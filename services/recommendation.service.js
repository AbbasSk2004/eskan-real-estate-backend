/**
 * Deterministic property recommendation ranker.
 *
 * Three stages, none of which call an LLM:
 *   1. Profile   — recency-weighted set of properties the visitor engaged with
 *   2. Candidates— union of index-backed Mongo queries (high recall, cheap)
 *   3. Rank      — weighted field similarity + popularity + freshness, then an
 *                  MMR pass for diversity
 *
 * An LLM is deliberately absent from this path. Ranking runs on every homepage
 * render, so it must be fast (single-digit ms of CPU), deterministic (the same
 * visitor reloading must not get a reshuffled list) and dependency-free (a
 * third-party outage must not take down the homepage). DeepSeek contributes to
 * ranking only through fields written offline by services/ai.service.js.
 *
 * FIELD-NAME HAZARD: Mongo stores camelCase (`propertyType`, `governorate`)
 * while the API response layer also emits snake_case aliases (`property_type`,
 * `governate` — note the legacy typo). Reading the wrong one yields undefined,
 * which silently degrades every similarity to "no data" without raising an
 * error anywhere. `toFeatures()` is the single place that reconciles both.
 */

const Property = require('../models/property.model');
const PropertyView = require('../models/propertyView.model');
const Favorite = require('../models/favorite.model');
const PropertyInquiry = require('../models/propertyInquiry.model');
const propertyService = require('./property.service');

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

// How much each interaction reveals about intent. Contacting an owner is the
// strongest declaration short of buying; a view is weak and noisy (bounces,
// misclicks, back-button traversal).
const SIGNAL_WEIGHTS = { inquiry: 5.0, favorite: 3.0, view: 1.0 };

// Per-signal half-life in days. Explicit signals persist far longer than
// passive ones: a saved listing still means something six weeks later, a
// single page view does not. A shared half-life would either erase favorites
// or let stale views dominate.
const SIGNAL_HALF_LIFE_DAYS = { inquiry: 45, favorite: 45, view: 10 };

const SIGNAL_LOOKBACK_DAYS = 90; // past this, decay makes rows worthless
const MAX_ANCHORS = 24;          // bounds similarity work at anchors x candidates

// Field weights inside contentSim. Only the ratios matter: the denominator sums
// weights for fields both properties actually populate, so a sparse listing is
// never punished for missing data.
//
// Location is split rather than concatenated. The old engine keyed on
// `governorate_city`, making "same governorate, neighbouring city" score
// exactly zero — indistinguishable from a different country. Splitting gives
// a real hierarchy: same governorate alone earns 3/(3+2) = 0.6 of location.
const FIELD_WEIGHTS = {
  propertyType: 5.0,
  governorate: 3.0,
  city: 2.0,
  area: 2.0,
  bedrooms: 1.5,
  bathrooms: 1.5,
  features: 2.0,
  aiTags: 2.5,
  aiLifestyle: 1.5
};

// Price is deliberately NOT in FIELD_WEIGHTS. Budget is a constraint, not a
// preference: someone browsing $100k apartments cannot buy the $1M one however
// identical it looks otherwise. As an additive term worth 3.0 of ~18.0 total
// weight, a 10x price gap still scored ~0.83 similarity — measured, not
// assumed. Modelling it multiplicatively lets a budget mismatch dampen the
// whole match the way it does in reality.
//
//   gate = FLOOR + (1 - FLOOR) * priceSim
//
// The floor keeps it a strong penalty rather than a hard filter, so an
// exceptional match slightly out of band can still surface.
const BUDGET_GATE_FLOOR = 0.35;

// Gaussian widths in log10 space. Real-estate price is log-normal, so a linear
// scaler lets one $5M villa flatten the entire price axis. At sigma 0.15 a 1.4x
// price gap scores ~0.5 and a 3x gap ~0.01 — which is what makes 100k~120k
// "similar" while 100k~1M is not.
const PRICE_LOG_SIGMA = 0.15;
const AREA_LOG_SIGMA = 0.20;

// Room-count tolerance: a 2-bed and a 3-bed are half-similar, 2 vs 4 unrelated.
const ROOM_TOLERANCE = 2;

// Final blend. Content dominates once history exists; popularity and freshness
// carry cold start and stop the tail of the list going stale.
const SCORE_BLEND = { content: 0.60, popularity: 0.22, freshness: 0.18 };

// MMR relevance/diversity trade-off. 0.7 keeps relevance in charge while still
// breaking up near-duplicates.
const MMR_LAMBDA = 0.7;

const POPULARITY_WINDOW_DAYS = 14;
const FRESHNESS_TAU_DAYS = 30;
const CANDIDATE_POOL_PER_QUERY = 100;
const RERANK_POOL_MULTIPLIER = 6;
const RERANK_POOL_MINIMUM = 60;

// Listings in these states must never be recommended.
const STALE_STATUSES = ['sold', 'rented', 'unavailable', 'Sold', 'Rented', 'Unavailable'];

const LIFESTYLE_KEYS = ['family', 'investor', 'student', 'luxury'];

// Fields the ranker actually reads. Candidate queries are projected onto these
// so the pool does not drag full `images` arrays across the wire; the handful
// of finally-selected documents are re-read in full for the response.
const RANKING_PROJECTION = [
  '_id', 'propertyType', 'governorate', 'city', 'price', 'area',
  'bedrooms', 'bathrooms', 'features', 'aiTags', 'aiLifestyle',
  'createdAt', 'ownerId'
].join(' ');

// ---------------------------------------------------------------------------
// Result cache
// ---------------------------------------------------------------------------
// Ranking is network-bound, not CPU-bound. Measured against this deployment:
// ~1300ms per call, of which the similarity math is ~13ms — the rest is four
// sequential round trips to Atlas at a ~640ms median RTT. Since this now runs
// on the homepage critical path, repeat requests are served from memory.
//
// Keyed per identity because every payload is personalized; short TTL so a new
// view surfaces quickly; bounded size so crawler traffic cannot grow it without
// limit. Process-local by design — no Redis dependency for a single-instance
// deployment. If this is ever scaled horizontally, each instance simply keeps
// its own copy, which is correct (just a lower hit rate).
const CACHE_TTL_MS = 45_000;
const CACHE_MAX_ENTRIES = 500;
const resultCache = new Map();

const cacheKeyFor = ({ userId, visitorId, limit }) => `${userId || ''}|${visitorId || ''}|${limit}`;

const readCache = (key) => {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > CACHE_TTL_MS) {
    resultCache.delete(key);
    return null;
  }
  return entry.value;
};

const writeCache = (key, value) => {
  // Map preserves insertion order, so the first key is the oldest — plain FIFO
  // eviction, which is sufficient for a TTL this short.
  if (resultCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = resultCache.keys().next().value;
    if (oldest !== undefined) resultCache.delete(oldest);
  }
  resultCache.set(key, { storedAt: Date.now(), value });
};

/**
 * Drop cached rankings for one identity.
 *
 * Called when a view is recorded so that opening a listing and returning to the
 * homepage shows an updated list immediately, instead of waiting out the TTL.
 */
const invalidateCacheForIdentity = ({ userId = null, visitorId = null } = {}) => {
  if (!userId && !visitorId) return;
  for (const key of resultCache.keys()) {
    const [keyUser, keyVisitor] = key.split('|');
    if ((userId && keyUser === String(userId)) || (visitorId && keyVisitor === String(visitorId))) {
      resultCache.delete(key);
    }
  }
};

// ---------------------------------------------------------------------------
// Feature projection
// ---------------------------------------------------------------------------

const numOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Project a property document onto the fields the ranker compares.
 * Accepts raw lean/Mongoose documents and already-formatted API responses.
 */
const toFeatures = (p) => {
  if (!p) return null;

  const featureMap = p.features && typeof p.features === 'object' && !Array.isArray(p.features)
    ? p.features
    : {};

  const owner = p.ownerId;

  return {
    id: String(p._id || p.id || ''),
    propertyType: p.propertyType || p.property_type || null,
    governorate: p.governorate || p.governate || null,
    city: p.city || null,
    price: numOrNull(p.price),
    area: numOrNull(p.area),
    bedrooms: numOrNull(p.bedrooms),
    bathrooms: numOrNull(p.bathrooms),
    // Only amenities that are actually TRUE. The old engine counted JSON keys,
    // so `{parking: false, pool: false}` scored 2 — higher than `{pool: true}`.
    features: new Set(
      Object.entries(featureMap)
        .filter(([, v]) => v === true || v === 'true')
        .map(([k]) => k)
    ),
    aiTags: new Set(Array.isArray(p.aiTags) ? p.aiTags.filter((t) => typeof t === 'string') : []),
    aiLifestyle: p.aiLifestyle && typeof p.aiLifestyle === 'object' ? p.aiLifestyle : null,
    createdAt: p.createdAt || p.created_at || null,
    ownerId: owner && typeof owner === 'object' ? String(owner._id || '') : (owner ? String(owner) : null)
  };
};

// ---------------------------------------------------------------------------
// Per-field similarity. Every function returns null for "not comparable", which
// removes the field from both numerator and denominator.
// ---------------------------------------------------------------------------

const exactSim = (a, b) => {
  if (!a || !b) return null;
  return a === b ? 1 : 0;
};

const gaussianLogSim = (a, b, sigma) => {
  if (!(a > 0) || !(b > 0)) return null;
  const delta = Math.log10(a) - Math.log10(b);
  return Math.exp(-(delta * delta) / (2 * sigma * sigma));
};

const countSim = (a, b) => {
  if (a === null || b === null) return null;
  return Math.max(0, 1 - Math.abs(a - b) / ROOM_TOLERANCE);
};

const jaccardSim = (a, b) => {
  if (!a || !b || (a.size === 0 && b.size === 0)) return null;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? null : intersection / union;
};

const lifestyleSim = (a, b) => {
  if (!a || !b) return null;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const key of LIFESTYLE_KEYS) {
    const x = Number(a[key]) || 0;
    const y = Number(b[key]) || 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return null;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

/**
 * Weighted field similarity in [0, 1].
 *
 * A hand-rolled weighted mean rather than sklearn cosine on a scaled matrix:
 * after StandardScaler, cosine becomes Pearson correlation (not similarity),
 * and unscaled one-hot columns sit alongside numerics swinging +/-3 sigma, so
 * whichever field has an outlier dominates. This form is also introspectable —
 * `contributions()` reuses it to explain *why* something was recommended.
 */
const similarity = (a, b) => {
  if (!a || !b) return 0;

  const parts = [
    [FIELD_WEIGHTS.propertyType, exactSim(a.propertyType, b.propertyType)],
    [FIELD_WEIGHTS.governorate, exactSim(a.governorate, b.governorate)],
    [FIELD_WEIGHTS.city, exactSim(a.city, b.city)],
    [FIELD_WEIGHTS.area, gaussianLogSim(a.area, b.area, AREA_LOG_SIGMA)],
    [FIELD_WEIGHTS.bedrooms, countSim(a.bedrooms, b.bedrooms)],
    [FIELD_WEIGHTS.bathrooms, countSim(a.bathrooms, b.bathrooms)],
    [FIELD_WEIGHTS.features, jaccardSim(a.features, b.features)],
    [FIELD_WEIGHTS.aiTags, jaccardSim(a.aiTags, b.aiTags)],
    [FIELD_WEIGHTS.aiLifestyle, lifestyleSim(a.aiLifestyle, b.aiLifestyle)]
  ];

  let numerator = 0;
  let denominator = 0;
  for (const [weight, score] of parts) {
    if (score === null) continue;
    numerator += weight * score;
    denominator += weight;
  }

  const attributeSim = denominator === 0 ? 0 : numerator / denominator;

  // Multiplicative budget gate (see BUDGET_GATE_FLOOR). Neutral when either
  // side has no price, so a listing missing a price is not silently penalized.
  const priceSim = gaussianLogSim(a.price, b.price, PRICE_LOG_SIGMA);
  const budgetGate = priceSim === null
    ? 1
    : BUDGET_GATE_FLOOR + (1 - BUDGET_GATE_FLOOR) * priceSim;

  return attributeSim * budgetGate;
};

// ---------------------------------------------------------------------------
// Stage 1: taste profile
// ---------------------------------------------------------------------------

const decayFor = (date, halfLifeDays) => {
  if (!date) return 0;
  const ageDays = (Date.now() - new Date(date).getTime()) / DAY_MS;
  if (!Number.isFinite(ageDays)) return 0;
  if (ageDays <= 0) return 1;
  return Math.pow(2, -ageDays / halfLifeDays);
};

/**
 * Build a taste profile: a recency-weighted set of "anchor" properties.
 *
 * Deliberately an anchor SET, not a single averaged centroid. Averaging
 * destroys multi-modal taste — someone comparing $80k studios against $600k
 * villas collapses to a $340k preference matching neither. Scoring against
 * every anchor and taking a weighted mean keeps both modes alive.
 *
 * `interactedIds` covers every property touched (not just the top anchors), so
 * nothing already seen can be recommended back. The old engine excluded only
 * the seed property and happily re-served the rest of the user's own history.
 */
const buildProfile = async ({ userId, visitorId }) => {
  const identityOr = [];
  if (userId) identityOr.push({ userId });
  if (visitorId) identityOr.push({ visitorId });

  if (!identityOr.length) {
    return { anchors: [], interactedIds: new Set() };
  }

  const since = new Date(Date.now() - SIGNAL_LOOKBACK_DAYS * DAY_MS);

  const [views, favorites, inquiries] = await Promise.all([
    PropertyView.find({ $or: identityOr, viewedAt: { $gte: since } })
      .select('propertyId viewedAt')
      .sort({ viewedAt: -1 })
      .limit(200)
      .lean(),
    userId
      ? Favorite.find({ userId })
          .select('propertyId createdAt')
          .sort({ createdAt: -1 })
          .limit(100)
          .lean()
      : [],
    userId
      ? PropertyInquiry.find({ userId, createdAt: { $gte: since } })
          .select('propertyId createdAt')
          .sort({ createdAt: -1 })
          .limit(50)
          .lean()
      : []
  ]);

  const weightById = new Map();
  const addSignal = (propertyId, kind, date) => {
    if (!propertyId) return;
    const contribution = SIGNAL_WEIGHTS[kind] * decayFor(date, SIGNAL_HALF_LIFE_DAYS[kind]);
    if (!(contribution > 0)) return;
    const id = String(propertyId);
    weightById.set(id, (weightById.get(id) || 0) + contribution);
  };

  views.forEach((v) => addSignal(v.propertyId, 'view', v.viewedAt));
  favorites.forEach((f) => addSignal(f.propertyId, 'favorite', f.createdAt));
  inquiries.forEach((i) => addSignal(i.propertyId, 'inquiry', i.createdAt));

  const interactedIds = new Set(weightById.keys());
  if (!interactedIds.size) {
    return { anchors: [], interactedIds };
  }

  const topEntries = [...weightById.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ANCHORS);

  const anchorDocs = await Property.find({ _id: { $in: topEntries.map(([id]) => id) } })
    .select(RANKING_PROJECTION)
    .lean();
  const docById = new Map(anchorDocs.map((doc) => [String(doc._id), doc]));

  const anchors = topEntries
    .map(([id, weight]) => {
      const doc = docById.get(id);
      return doc ? { weight, features: toFeatures(doc) } : null;
    })
    .filter(Boolean);

  return { anchors, interactedIds };
};

// ---------------------------------------------------------------------------
// Stage 2: candidate generation
// ---------------------------------------------------------------------------

/**
 * Fetch a high-recall candidate pool from a union of index-backed queries.
 *
 * A union beats one broad scan: it guarantees the pool contains stock matching
 * the visitor's demonstrated type, region and price band, while the discovery
 * slice keeps the results from becoming a hall of mirrors. Each query hits an
 * existing index (propertyType, governorate, price, createdAt) and they run
 * concurrently, so the whole stage is one round trip's latency.
 */
const fetchCandidates = async ({ anchors, excludeIds, ownerId }) => {
  const base = {
    verified: true,
    status: { $nin: STALE_STATUSES }
  };
  // Never recommend a user their own listing. Done in the query rather than
  // client-side, where the previous implementation filtered it twice and still
  // let it consume a slot.
  if (ownerId) base.ownerId = { $ne: ownerId };
  if (excludeIds.size) base._id = { $nin: [...excludeIds] };

  // Discovery slice: newest verified stock, independent of the profile.
  const queries = [
    Property.find(base).select(RANKING_PROJECTION).sort({ createdAt: -1 }).limit(CANDIDATE_POOL_PER_QUERY).lean()
  ];

  const types = [...new Set(anchors.map((a) => a.features.propertyType).filter(Boolean))].slice(0, 4);
  const governorates = [...new Set(anchors.map((a) => a.features.governorate).filter(Boolean))].slice(0, 4);
  const prices = anchors.map((a) => a.features.price).filter((p) => p > 0).sort((a, b) => a - b);

  if (types.length) {
    queries.push(
      Property.find({ ...base, propertyType: { $in: types } })
        .select(RANKING_PROJECTION).sort({ createdAt: -1 }).limit(CANDIDATE_POOL_PER_QUERY).lean()
    );
  }
  if (governorates.length) {
    queries.push(
      Property.find({ ...base, governorate: { $in: governorates } })
        .select(RANKING_PROJECTION).sort({ createdAt: -1 }).limit(CANDIDATE_POOL_PER_QUERY).lean()
    );
  }
  if (prices.length) {
    // Median, not mean: one outlier listing must not drag the band.
    const median = prices[Math.floor(prices.length / 2)];
    queries.push(
      Property.find({ ...base, price: { $gte: median * 0.6, $lte: median * 1.6 } })
        .select(RANKING_PROJECTION).sort({ createdAt: -1 }).limit(CANDIDATE_POOL_PER_QUERY).lean()
    );
  }

  const results = await Promise.all(queries);

  const pool = new Map();
  results.flat().forEach((doc) => pool.set(String(doc._id), doc));
  return [...pool.values()];
};

// ---------------------------------------------------------------------------
// Stage 3: scoring
// ---------------------------------------------------------------------------

/**
 * Recency-weighted engagement per candidate, normalized to [0, 1].
 *
 * Safe to trust because Phase 1 deduped views to one row per identity per UTC
 * day — refreshing a listing can no longer inflate it.
 */
const fetchPopularity = async (candidateIds) => {
  if (!candidateIds.length) return new Map();

  const since = new Date(Date.now() - POPULARITY_WINDOW_DAYS * DAY_MS);

  const [views, favorites] = await Promise.all([
    PropertyView.aggregate([
      { $match: { propertyId: { $in: candidateIds }, viewedAt: { $gte: since } } },
      { $group: { _id: '$propertyId', count: { $sum: 1 } } }
    ]),
    Favorite.aggregate([
      { $match: { propertyId: { $in: candidateIds }, createdAt: { $gte: since } } },
      { $group: { _id: '$propertyId', count: { $sum: 1 } } }
    ])
  ]);

  const raw = new Map();
  const bump = (id, amount) => {
    const key = String(id);
    raw.set(key, (raw.get(key) || 0) + amount);
  };
  views.forEach((v) => bump(v._id, v.count));
  favorites.forEach((f) => bump(f._id, f.count * 3)); // saving beats browsing

  let max = 0;
  raw.forEach((value) => { if (value > max) max = value; });
  if (max === 0) return new Map();

  // log1p compresses the head so one viral listing cannot flatten every other
  // candidate to ~0.
  const logMax = Math.log1p(max);
  const normalized = new Map();
  raw.forEach((value, id) => normalized.set(id, Math.log1p(value) / logMax));
  return normalized;
};

const freshnessScore = (createdAt) => {
  if (!createdAt) return 0;
  const ageDays = Math.max(0, (Date.now() - new Date(createdAt).getTime()) / DAY_MS);
  return Math.exp(-ageDays / FRESHNESS_TAU_DAYS);
};

/**
 * Weighted mean similarity to the anchor set.
 *
 * Weighted mean rather than max, so one strong anchor cannot pull in everything
 * resembling it; weighted rather than plain, so a handful of stale views cannot
 * outvote a fresh inquiry.
 */
const profileSimilarity = (anchors, candidate) => {
  if (!anchors.length) return 0;

  let numerator = 0;
  let denominator = 0;
  for (const anchor of anchors) {
    numerator += anchor.weight * similarity(anchor.features, candidate);
    denominator += anchor.weight;
  }
  return denominator === 0 ? 0 : numerator / denominator;
};

/**
 * Maximal Marginal Relevance (Carbonell & Goldstein, SIGIR 1998).
 *
 *   pick argmax [ lambda * relevance - (1 - lambda) * maxSimToAlreadyPicked ]
 *
 * Pure score ordering returns near-duplicates by construction: the five most
 * similar listings to "2-bed in Achrafieh" are usually five 2-beds in the same
 * building. This is the single change that makes the carousel read as a market.
 */
const applyMmr = (scored, limit, lambda = MMR_LAMBDA) => {
  const pool = [...scored];
  const selected = [];

  while (selected.length < limit && pool.length) {
    let bestIndex = 0;
    let bestValue = -Infinity;

    for (let i = 0; i < pool.length; i += 1) {
      let maxSim = 0;
      for (const chosen of selected) {
        const sim = similarity(pool[i].features, chosen.features);
        if (sim > maxSim) maxSim = sim;
      }
      const value = lambda * pool[i].score - (1 - lambda) * maxSim;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    }

    selected.push(pool.splice(bestIndex, 1)[0]);
  }

  return selected;
};

// ---------------------------------------------------------------------------
// Explanations (template-based; no LLM on the request path)
// ---------------------------------------------------------------------------

const buildReason = (candidate, anchors) => {
  if (!anchors.length) return 'Popular with visitors right now';

  const top = anchors.reduce((a, b) => (b.weight > a.weight ? b : a));
  const anchor = top.features;
  const type = candidate.propertyType ? String(candidate.propertyType).toLowerCase() : 'property';

  if (anchor.propertyType === candidate.propertyType && anchor.city && anchor.city === candidate.city) {
    return `Another ${type} in ${candidate.city}, like the ones you viewed`;
  }
  if (anchor.propertyType === candidate.propertyType) {
    return `Matches the ${type} type you have been browsing`;
  }
  if (anchor.governorate && anchor.governorate === candidate.governorate) {
    return `In ${candidate.governorate}, the area you have been searching`;
  }
  const priceSim = gaussianLogSim(anchor.price, candidate.price, PRICE_LOG_SIGMA);
  if (priceSim !== null && priceSim > 0.5) {
    return 'In the price range you have been looking at';
  }
  return 'Similar to properties you viewed recently';
};

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

/**
 * Editorial fallback for an empty candidate pool (fresh deployment, tiny or
 * fully-excluded catalogue). Preserves this endpoint's original behaviour —
 * the admin-curated `recommended` flag — instead of returning nothing.
 */
const fallbackProperties = async (limit) => {
  const merged = new Map();

  const curated = await propertyService.getRecommendedProperties(limit);
  curated.forEach((p) => merged.set(p.id, p));

  if (merged.size < limit) {
    const featured = await propertyService.getFeaturedProperties(limit);
    featured.forEach((p) => { if (!merged.has(p.id)) merged.set(p.id, p); });
  }

  return [...merged.values()].slice(0, limit);
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Rank properties for a visitor.
 *
 * @param {object}  params
 * @param {?string} params.userId    authenticated user id, from the session only
 * @param {?string} params.visitorId anonymous cookie id (guests)
 * @param {number}  params.limit     how many to return (clamped 1..50)
 * @returns {Promise<{properties: object[], source: string, personalized: boolean}>}
 */
const getRecommendations = async ({ userId = null, visitorId = null, limit = 10 } = {}) => {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));

  const key = cacheKeyFor({ userId, visitorId, limit: safeLimit });
  const cached = readCache(key);
  if (cached) return cached;

  const { anchors, interactedIds } = await buildProfile({ userId, visitorId });
  const candidates = await fetchCandidates({ anchors, excludeIds: interactedIds, ownerId: userId });

  if (!candidates.length) {
    const fallback = {
      properties: await fallbackProperties(safeLimit),
      source: 'curated',
      personalized: false
    };
    writeCache(key, fallback);
    return fallback;
  }

  const popularity = await fetchPopularity(candidates.map((c) => String(c._id)));

  // With no history contentSim is 0 for every candidate, so its weight is
  // redistributed onto the components that actually discriminate. Leaving it in
  // would make cold-start results 60% constant.
  const coldStartDivisor = SCORE_BLEND.popularity + SCORE_BLEND.freshness;

  const scored = candidates.map((doc) => {
    const features = toFeatures(doc);
    const content = profileSimilarity(anchors, features);
    const pop = popularity.get(String(doc._id)) || 0;
    const fresh = freshnessScore(doc.createdAt);

    const score = anchors.length
      ? SCORE_BLEND.content * content + SCORE_BLEND.popularity * pop + SCORE_BLEND.freshness * fresh
      : (SCORE_BLEND.popularity * pop + SCORE_BLEND.freshness * fresh) / coldStartDivisor;

    return { id: String(doc._id), features, score, content };
  });

  scored.sort((a, b) => b.score - a.score);

  // MMR is O(pool x limit x fields); cap the slice it reranks so a large
  // catalogue cannot make this the slow part of the request.
  const rerankPool = scored.slice(0, Math.max(safeLimit * RERANK_POOL_MULTIPLIER, RERANK_POOL_MINIMUM));
  const selected = applyMmr(rerankPool, safeLimit);

  // Re-read the chosen documents with the owner populated so the payload is
  // byte-compatible with every other property endpoint (the mobile app reads
  // `profiles`/`profiles_id`). Populating the whole candidate pool instead
  // would mean hundreds of needless joins.
  const selectedIds = selected.map((s) => s.id);
  const docs = await Property.find({ _id: { $in: selectedIds } })
    .populate('ownerId', 'firstName lastName profilePhoto role phone email')
    .lean();
  const docById = new Map(docs.map((doc) => [String(doc._id), doc]));

  const properties = selected
    .map((entry) => {
      const doc = docById.get(entry.id);
      if (!doc) return null;
      return {
        ...propertyService.formatProperty(doc),
        // Additive metadata only — legacy clients ignore unknown keys.
        match_score: Math.round(entry.score * 100),
        recommendation_reason: buildReason(entry.features, anchors)
      };
    })
    .filter(Boolean);

  const result = {
    properties,
    source: anchors.length ? 'personalized' : 'trending',
    personalized: anchors.length > 0
  };

  writeCache(key, result);
  return result;
};

module.exports = {
  getRecommendations,
  invalidateCacheForIdentity,
  // Exported for tests and for the offline Python training job to compare against.
  _internals: {
    toFeatures,
    similarity,
    buildProfile,
    applyMmr,
    freshnessScore,
    FIELD_WEIGHTS,
    SIGNAL_WEIGHTS,
    SCORE_BLEND
  }
};
