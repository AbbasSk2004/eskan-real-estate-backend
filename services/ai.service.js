/**
 * DeepSeek enrichment for property listings.
 *
 * WRITE-TIME ONLY. This service is never called while serving a read request.
 * It runs once per listing (and again only if the text changes), stores its
 * output on the Property document, and the deterministic ranker in
 * recommendation.service.js consumes those stored fields. Consequences:
 *
 *   - zero LLM latency on the request path
 *   - one API call per listing lifetime, not per page view
 *   - a DeepSeek outage degrades ranking quality slightly; it never breaks a
 *     page, a save, or a response
 *
 * The value it adds is turning the free-text `description` — which the previous
 * engine ignored entirely, counting only `features` keys — into structured
 * features the ranker can actually compare.
 *
 * DeepSeek is OpenAI-wire-compatible, so the already-installed `openai` SDK is
 * pointed at their base URL. No new dependency.
 */

const OpenAI = require('openai');
const crypto = require('crypto');
const Property = require('../models/property.model');

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 8000;
const AI_MAX_TOKENS = 700;

const isEnabled = () =>
  process.env.ENABLE_AI_ENRICHMENT === 'true' && Boolean(process.env.DEEPSEEK_API_KEY);

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------
// Without this, a DeepSeek outage means every property save waits the full
// timeout before giving up. After a run of failures we stop calling out
// entirely for a cooldown, so a bulk import stays fast while the API is down.

const BREAKER_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 60_000;

let consecutiveFailures = 0;
let breakerOpenedAt = 0;

const isBreakerOpen = () => {
  if (consecutiveFailures < BREAKER_THRESHOLD) return false;
  if (Date.now() - breakerOpenedAt >= BREAKER_COOLDOWN_MS) {
    // Cooldown elapsed: allow one probe through.
    consecutiveFailures = BREAKER_THRESHOLD - 1;
    return false;
  }
  return true;
};

const recordSuccess = () => {
  consecutiveFailures = 0;
  breakerOpenedAt = 0;
};

const recordFailure = () => {
  consecutiveFailures += 1;
  if (consecutiveFailures >= BREAKER_THRESHOLD) {
    breakerOpenedAt = Date.now();
    console.warn(`[AI] circuit breaker open after ${consecutiveFailures} consecutive failures; pausing ${BREAKER_COOLDOWN_MS}ms`);
  }
};

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

let client = null;

const getClient = () => {
  if (!isEnabled()) return null;
  if (client) return client;

  client = new OpenAI({
    baseURL: DEEPSEEK_BASE_URL,
    apiKey: process.env.DEEPSEEK_API_KEY,
    timeout: AI_TIMEOUT_MS,
    // The SDK's own retries would stack: 2 retries x 8s is a 24s worst case on
    // a path that promised 8. Retry policy stays ours (the breaker + the next
    // description edit), not the SDK's.
    maxRetries: 0
  });
  return client;
};

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a real-estate listing analyst for a Lebanese property marketplace.

Return ONLY a JSON object with exactly these keys:
{
  "aiTags": string[],
  "aiLifestyle": { "family": number, "investor": number, "student": number, "luxury": number },
  "aiSummary": { "en": string, "ar": string }
}

Rules:
- aiTags: 3 to 10 tags for concrete, verifiable attributes stated in the listing.
  Lowercase snake_case, characters a-z 0-9 and underscore only.
  Examples: sea_view, newly_renovated, near_school, parking, elevator,
  furnished, corner_unit, high_floor, investment_grade, quiet_street.
- NEVER invent an amenity that is not stated or clearly implied by the listing.
  Fewer accurate tags is better than more speculative ones.
- aiLifestyle: how well the property suits each buyer type, each 0 to 1.
- aiSummary: max 220 characters each, factual, no marketing adjectives, no
  price repetition. "ar" must be natural Modern Standard Arabic, not a
  transliteration of the English.
- Output JSON only. No markdown fences, no commentary.`;

/**
 * Build the user message.
 *
 * Only listing attributes are included — never owner name, email or phone. The
 * prompt must not become a PII egress path to a third party.
 */
const buildUserPrompt = (property) => {
  const trueFeatures = property.features && typeof property.features === 'object' && !Array.isArray(property.features)
    ? Object.entries(property.features).filter(([, v]) => v === true || v === 'true').map(([k]) => k)
    : [];

  const payload = {
    title: String(property.title || '').slice(0, 300),
    propertyType: property.propertyType || null,
    status: property.status || null,
    price: property.price ?? null,
    area: property.area ?? null,
    bedrooms: property.bedrooms ?? null,
    bathrooms: property.bathrooms ?? null,
    city: property.city || null,
    governorate: property.governorate || null,
    village: property.village || null,
    yearBuilt: property.yearBuilt ?? null,
    floor: property.floor ?? null,
    furnishingStatus: property.furnishingStatus || null,
    view: property.view || null,
    amenities: trueFeatures,
    // Truncated: descriptions are user-supplied and unbounded, and this caps
    // both token spend and the surface area for prompt injection.
    description: String(property.description || '').slice(0, 2500)
  };

  return `Analyze this property listing:\n${JSON.stringify(payload, null, 2)}`;
};

// ---------------------------------------------------------------------------
// Output validation
// ---------------------------------------------------------------------------

const TAG_PATTERN = /^[a-z0-9_]{2,32}$/;
const MAX_TAGS = 12;
const MAX_SUMMARY_CHARS = 400;
const LIFESTYLE_KEYS = ['family', 'investor', 'student', 'luxury'];

/**
 * Rebuild model output onto a fixed shape.
 *
 * Nothing from the response is spread or passed through. The description is
 * attacker-controllable (any user can list a property), so a prompt-injected
 * listing could otherwise steer the model into emitting operator-shaped keys
 * (`$set`, `$where`), deeply nested objects, or unbounded arrays that then get
 * written straight to Mongo. Every field here is explicitly re-derived, typed,
 * pattern-checked and length-capped.
 *
 * Returns null when the output carries no usable signal, so the caller can
 * treat it exactly like a failed call.
 */
const sanitizeEnrichment = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const rawTags = Array.isArray(raw.aiTags) ? raw.aiTags : [];
  const aiTags = [...new Set(
    rawTags
      .filter((tag) => typeof tag === 'string')
      .map((tag) => tag.trim().toLowerCase().replace(/[\s-]+/g, '_'))
      .filter((tag) => TAG_PATTERN.test(tag))
  )].slice(0, MAX_TAGS);

  const rawLifestyle = raw.aiLifestyle && typeof raw.aiLifestyle === 'object' && !Array.isArray(raw.aiLifestyle)
    ? raw.aiLifestyle
    : {};
  const aiLifestyle = {};
  for (const key of LIFESTYLE_KEYS) {
    const value = Number(rawLifestyle[key]);
    aiLifestyle[key] = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  }

  const asText = (value) => (typeof value === 'string' ? value.trim().slice(0, MAX_SUMMARY_CHARS) : '');
  const rawSummary = raw.aiSummary && typeof raw.aiSummary === 'object' && !Array.isArray(raw.aiSummary)
    ? raw.aiSummary
    : {};
  const aiSummary = { en: asText(rawSummary.en), ar: asText(rawSummary.ar) };

  if (!aiTags.length && !aiSummary.en && !aiSummary.ar) return null;

  return { aiTags, aiLifestyle, aiSummary };
};

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

/**
 * Hash of the text the enrichment is derived from.
 *
 * Stored alongside the result so editing a price or swapping photos does not
 * re-spend tokens re-analysing identical prose.
 */
const descriptionHash = (property) =>
  crypto
    .createHash('sha256')
    .update(`${property?.title || ''} ${property?.description || ''}`)
    .digest('hex');

/**
 * Call DeepSeek and return validated enrichment fields, or null.
 *
 * Never throws. Every failure mode — disabled, breaker open, timeout, non-JSON
 * response, failed validation — resolves to null so callers have exactly one
 * case to handle.
 */
const enrichProperty = async (property) => {
  if (!isEnabled()) return null;

  if (isBreakerOpen()) {
    console.warn('[AI] skipped: circuit breaker open', { propertyId: property?._id });
    return null;
  }

  const aiClient = getClient();
  if (!aiClient) return null;

  const startedAt = Date.now();

  try {
    const completion = await aiClient.chat.completions.create({
      model: DEEPSEEK_MODEL,
      temperature: 0, // deterministic: the same listing must enrich identically
      max_tokens: AI_MAX_TOKENS,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(property) }
      ]
    });

    const content = completion?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty completion');

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      throw new Error(`Model returned non-JSON content: ${parseErr.message}`);
    }

    const clean = sanitizeEnrichment(parsed);
    if (!clean) throw new Error('Model output failed validation');

    const usage = completion.usage || {};
    console.log('[AI] property enriched', {
      propertyId: property?._id,
      model: DEEPSEEK_MODEL,
      ms: Date.now() - startedAt,
      tags: clean.aiTags.length,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens
    });

    recordSuccess();
    return { ...clean, aiModel: DEEPSEEK_MODEL, aiEnrichedAt: new Date() };
  } catch (err) {
    recordFailure();
    console.error('[AI] enrichment failed', {
      propertyId: property?._id,
      ms: Date.now() - startedAt,
      error: err.message
    });
    return null; // callers must never fail a property save because of this
  }
};

/**
 * Fire-and-forget enrichment by id.
 *
 * Deliberately not awaited by the caller: a property save must not block on, or
 * fail because of, a third-party API. `setImmediate` defers until after the HTTP
 * response has been sent, so the user sees their listing created instantly and
 * the AI fields appear moments later.
 */
const enrichPropertyInBackground = (propertyId) => {
  if (!isEnabled() || !propertyId) return;

  setImmediate(async () => {
    try {
      const doc = await Property.findById(propertyId).lean();
      if (!doc) return;

      const hash = descriptionHash(doc);
      if (doc.aiEnrichedAt && doc.aiDescriptionHash === hash) {
        return; // text unchanged since the last enrichment
      }

      const enrichment = await enrichProperty(doc);
      if (!enrichment) return;

      await Property.updateOne(
        { _id: propertyId },
        { $set: { ...enrichment, aiDescriptionHash: hash } }
      );
    } catch (err) {
      console.error('[AI] background enrichment error', { propertyId, error: err.message });
    }
  });
};

module.exports = {
  isEnabled,
  enrichProperty,
  enrichPropertyInBackground,
  descriptionHash,
  // Exported for tests — the validation layer is security-relevant.
  sanitizeEnrichment
};
