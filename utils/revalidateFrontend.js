const axios = require('axios');

/**
 * On-demand ISR revalidation trigger (backend → Next.js web app).
 *
 * Fire-and-forget notifier: the instant content changes in a service, this
 * pings the web app's /api/revalidate route so it purges the matching cached
 * pages. It is never awaited at call sites and never throws — a slow or down
 * frontend must not delay or fail the admin's API response.
 *
 * Contract MUST match real-estate-react/app/api/revalidate/route.js:
 *   POST {WEB_APP_URL}/api/revalidate?secret=<REVALIDATION_SECRET>&tag=<t>&path=<p>
 *   - `secret`, `tag`(s) and `path`(s) are QUERY params — that route reads
 *     searchParams only and ignores the request body.
 *   - tags must match its allow-list (properties, property-*, testimonials, ...).
 *
 * Configuration (both required, else revalidation is silently skipped — mirroring
 * the frontend route, which no-ops when its secret is unset):
 *   - WEB_APP_URL          Base origin of the Next.js site, e.g. http://localhost:3000
 *                          (NOT reused from FRONTEND_URL, which is a comma-separated
 *                          CORS allow-list, not a single origin.)
 *   - REVALIDATION_SECRET  Shared secret; identical to the web app's value.
 *
 * @param {{ tags?: string[], paths?: string[] }} target
 */
const triggerRevalidation = ({ tags = [], paths = [] } = {}) => {
  const baseUrl = process.env.WEB_APP_URL;
  const secret = process.env.REVALIDATION_SECRET;

  if (!baseUrl || !secret) return;
  if (tags.length === 0 && paths.length === 0) return;

  const params = new URLSearchParams();
  params.set('secret', secret);
  tags.forEach((tag) => params.append('tag', tag));
  paths.forEach((path) => params.append('path', path));

  const url = `${baseUrl.replace(/\/+$/, '')}/api/revalidate?${params.toString()}`;

  // Non-blocking: the returned promise never rejects (errors are swallowed here),
  // so callers can safely ignore it without risking an unhandledRejection.
  return axios
    .post(url, null, { timeout: 5000 })
    .then(() => {
      console.log(`[Cache] Revalidated web app — tags: [${tags.join(', ')}]${paths.length ? ` paths: [${paths.join(', ')}]` : ''}`);
    })
    .catch((error) => {
      console.error(`[Cache] Failed to revalidate web app: ${error.message}`);
    });
};

module.exports = { triggerRevalidation };
