# Eskan Real Estate Backend API

The API layer for the Eskan real estate platform. Built with **Node.js + Express** and backed by **MongoDB (Mongoose)** as the primary data store (migrated from Supabase/Postgres). It serves the web platform (`real-estate-react`), the admin dashboard (`admin-panel`), and the mobile app (`real_estate`) through a single REST API, plus a WebSocket server and a Server-Sent-Events (SSE) notification stream.

## Project Repositories

ESKAN is split across four repositories that all share the single backend API and one MongoDB database.

| Component | Repository | Local directory | Stack |
|---|---|---|---|
| **Backend API** &nbsp;`you are here` | [eskan-real-estate-backend](https://github.com/AbbasSk2004/eskan-real-estate-backend) | `backend/` | Node.js, Express 4, MongoDB (Mongoose 7) |
| Web platform | [Eskan_Real_Estate_Web](https://github.com/AbbasSk2004/Eskan_Real_Estate_Web) | `real-estate-react/` | Next.js 14 (App Router), React 18 |
| Admin panel | [react-real-estate-admin-panel](https://github.com/AbbasSk2004/react-real-estate-admin-panel) | `admin-panel/` | React 18, MUI 5, Chart.js |
| Mobile app | [React-Native-real-estate-mobile-app](https://github.com/AbbasSk2004/React-Native-real-estate-mobile-app) | `real_estate/` | Expo SDK 53, React Native 0.79 |

Clone them as **siblings in one parent directory** so the relative paths used throughout these docs (`../backend`, `../real-estate-react`) resolve:

```bash
mkdir eskan && cd eskan
git clone https://github.com/AbbasSk2004/eskan-real-estate-backend.git backend
git clone https://github.com/AbbasSk2004/Eskan_Real_Estate_Web.git real-estate-react
git clone https://github.com/AbbasSk2004/react-real-estate-admin-panel.git admin-panel
git clone https://github.com/AbbasSk2004/React-Native-real-estate-mobile-app.git real_estate
```

All three clients authenticate against the same `/api/auth` endpoints and read the same property data, so **a change to any backend response shape affects all three**. The property payload in particular is served in both camelCase and snake_case (see `toResponse` in `backend/services/property.service.js`) specifically to keep older mobile and web clients working — do not remove alias fields without checking every client.

## Overview

- User registration, login, and JWT-based sessions with **access + refresh token rotation**
- Email verification via **6-digit OTP** (Brevo transactional email)
- Property creation, search, filtering, and listing management
- Favorites, property inquiries, testimonials, and contact submissions
- Agent applications and agent-facing workflows
- 1:1 chat (REST API) and in-app notifications (SSE)
- **Personalized property recommendations** — deterministic Node.js ranker (content similarity + popularity + MMR diversity), with DeepSeek used off the request path for listing enrichment ([see below](#recommendation-engine))
- Prefix-scoped admin API (`/api/admin/*`) for the dashboard
- File uploads via Multer → Cloudinary
- Deployed on Render (native Node runtime)

## Tech Stack

| Concern | Technology |
|---|---|
| Runtime | Node.js >= 18 |
| Web framework | Express 4 |
| Database | MongoDB (Mongoose 7) — **primary store** |
| Auth | JWT access tokens + bcrypt-hashed rotating refresh tokens |
| Email | Brevo (`@getbrevo/brevo`) transactional API |
| Media | Cloudinary (upload SDK + Multer middleware) |
| Real-time | `ws` WebSocket server (`/ws`), SSE notification stream |
| Recommendations | Pure Node.js ranker (`services/recommendation.service.js`) |
| AI | DeepSeek via the `openai` SDK — **write-time only**, never on a read path |
| Security | helmet, cors (origin allow-list), CSRF header guard, express-rate-limit |
| Logging | winston / morgan |
| Deployment | Render, native Node runtime (`render.yaml`) |

## Architecture Notes

- **MongoDB is the system of record.** The platform previously ran on Supabase/Postgres; `database/schema.sql` and the `scripts/migrate-*`/`import-*` tools are legacy migration artifacts. The connection respects `MONGO_DB_NAME`; when unset the DB name embedded in `MONGO_URI` is used (`config/mongo.js`).
- **Auth flow:** `POST /api/auth/register` creates the user and emails a 6-digit OTP; `POST /api/auth/verify-otp` activates the account and returns `{ access_token, refresh_token, expires_at }` (legacy top-level `token` aliases are also returned for older clients). `POST /api/auth/refresh` rotates the refresh token (bcrypt-hashed, max 10 stored per user).
- **Realtime split:**
  - **Notifications** are delivered via Server-Sent Events (`GET /api/admin/notifications/stream?token=<jwt>`) and persisted in MongoDB.
  - **Chat** is REST-only (conversations/messages in MongoDB); the WebSocket server is initialized for presence/ping but messages are not transported over it yet.
- **Roles:** `user`, `agent`, `admin` — the admin API is protected by `requireAuth` + `requireRole('admin')`.
- **Visitor identity:** public personalization routes run `attachVisitorId` + `optionalAuth`. `attachVisitorId` issues a 1-year HttpOnly `visitor_id` UUID cookie (validated against a UUID pattern before it is trusted, since it reaches Mongo queries and a unique index key) so anonymous guests accumulate a taste profile. `optionalAuth` layers on a user id when a session exists but never rejects guests.
- The backend serves web, admin, and mobile clients; CORS origin allow-list is built from `ALLOWED_ORIGINS` (comma-separated) or `FRONTEND_URL`, plus localhost dev origins.

## Prerequisites

- Node.js >= 18
- npm
- MongoDB (local `mongod` or MongoDB Atlas cluster)
- A Brevo API key (transactional email) and Cloudinary credentials (uploads) for full functionality
- *Optional:* a funded DeepSeek API key for listing enrichment. Everything works without it — listings simply carry no `aiTags`/`aiSummary` and ranking loses one of nine similarity signals.

## Installation

1. Install Node dependencies:

   ```bash
   npm install
   ```

2. Create `.env` from the template and fill in the required values (see [Configuration](#configuration)):

   ```bash
   cp .env.example .env   # then edit with real credentials
   ```

3. *(Optional)* Enable DeepSeek listing enrichment. Skip this and everything still works — listings simply carry no `aiTags`/`aiSummary`:

   ```bash
   # in .env
   ENABLE_AI_ENRICHMENT=true
   DEEPSEEK_API_KEY=sk-...        # requires account balance; an unfunded key returns 402
   ```

4. Start the development server:

   ```bash
   npm run dev           # nodemon
   # or
   npm start             # plain node
   ```

The server listens on `PORT` (default **3001**) and mounts the health check at `GET /api/health`.

## Configuration

All configuration is environment-based via a `.env` file in this directory. The server **throws at boot** if `MONGO_URI`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, or `BREVO_API_KEY` are missing.

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `production` enables stricter CORS, morgan combined logs, and disables Mongoose auto-indexing |
| `PORT` | no | `3001` | HTTP server port |
| `MONGO_URI` | **yes** | — | MongoDB connection string (local or Atlas) |
| `MONGO_DB_NAME` | no | (from URI) | Database name to use within the MongoDB server |
| `JWT_SECRET` | **yes** | — | Secret for signing access tokens |
| `JWT_EXPIRES_IN` | no | `15m` | Access-token lifetime (e.g. `7d`) |
| `REFRESH_TOKEN_SECRET` | **yes** | — | Secret component for refresh-token operations |
| `REFRESH_TOKEN_EXPIRES_IN` | no | `30d` | Refresh-token lifetime |
| `SESSION_SECRET` | no | — | Reserved for session middleware |
| `BREVO_API_KEY` | **yes** | — | Brevo transactional email API key |
| `EMAIL_FROM` | no | `Eskan Real Estate <...>` | Sender address for outgoing email |
| `EMAIL_VERIFICATION_EXPIRY_MINUTES` | no | `15` | OTP validity window |
| `CLOUDINARY_CLOUD_NAME` | yes* | — | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | yes* | — | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | yes* | — | Cloudinary API secret |
| `FRONTEND_URL` | no | — | Allowed frontend origin(s) for CORS |
| `ALLOWED_ORIGINS` | no | `FRONTEND_URL` | Comma-separated CORS origin allow-list |
| `API_BASE_URL` | no | `http://localhost:3001/api` | Public API base URL (used in emails/links) |
| `WS_URL` | no | `ws://localhost:3001` | Public WebSocket base URL |
| `WS_PATH` | no | `/ws` | WebSocket upgrade path |
| `WS_PING_INTERVAL` | no | — | WebSocket keepalive interval (ms) |
| `BATCH_SIZE` | no | — | Batch size for migration scripts |
| `MAX_FILE_SIZE` | no | `1048760` | Upload size limit (bytes) |
| `MAX_FILES_COUNT` | no | `10` | Max files per upload batch |
| `ENABLE_AI_ENRICHMENT` | no | `false` | Master switch for DeepSeek listing enrichment. Off ⇒ the AI layer is completely inert |
| `DEEPSEEK_API_KEY` | no | — | DeepSeek key. **Server-side only — never a `NEXT_PUBLIC_*` var.** Requires account balance; an unfunded key returns `402` and enrichment silently no-ops |
| `DEEPSEEK_BASE_URL` | no | `https://api.deepseek.com` | OpenAI-compatible base URL |
| `DEEPSEEK_MODEL` | no | `deepseek-chat` | Enrichment model |
| `AI_TIMEOUT_MS` | no | `8000` | Hard per-call ceiling. SDK retries are disabled, so this is the true worst case |
| `COOKIE_SECURE` | no | `true` | Set `false` for local http on a non-localhost host (falls back to `SameSite=Lax`) |
| `DEV_TEST_USER_EMAILS` | no | — | Emails treated as dev/test users by helper scripts |
| `GOOGLE_MAPS_API_KEY` | no | — | Reserved for map features (web/mobile use their own) |
| `ENABLE_ANALYTICS`, `ENABLE_MAP_SEARCH`, `ENABLE_SOCIAL_SHARING`, `ENABLE_LAZY_LOADING`, `ENABLE_IMAGE_OPTIMIZATION`, `ENABLE_SEARCH_SUGGESTIONS`, `ENABLE_SAVED_SEARCHES`, `DEBUG_AUTH` | no | `true`/`false` | Feature flags consumed by the frontends via `/api` responses |

\* Cloudinary vars are only required when media uploads are used.

`.env.example` also lists legacy **Firebase** and **Supabase** keys (`FIREBASE_*`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `POSTGRES_URL`) — these are **not used by the current code** and are kept only for migration context. Do not rely on them.

## API Overview

Base path: `/api`. Public routes respond on the user-facing groups; admin groups are mounted under `/api/admin/*` and require an admin JWT.

### User-facing

| Group | Base path | Highlights |
|---|---|---|
| Auth | `/api/auth` | `POST /register`, `POST /login`, `POST /refresh`, `POST /verify-otp`, `POST /resend-otp`, `POST /logout`, `GET /verify`, `POST /update-status` |
| Profile | `/api/profile` | Get/update profile, change password (invalidates all refresh tokens) |
| Properties | `/api/properties` | CRUD, search/filter, featured list, **personalized `GET /recommended`**, user properties |
| Property views | `/api/properties/:id/views` | `POST` record a view (**public**, rate-limited, deduped per identity per day), `GET /count` |
| Favorites | `/api/favorites` | List, add, remove, is-favorited |
| Agents | `/api/agents` | List, featured, apply/join, agent profile |
| FAQs | `/api/faqs` | All, featured, by category |
| Testimonials | `/api/testimonials` | Approved list, create, per-user check |
| Similar properties | `/api/similar-properties` | Same property type as the visited listing |
| Recommendations | `/api/recommendations` | `POST /local` — **deprecated** legacy shim; use `GET /api/properties/recommended` |
| Typepage | `/api/typepage` | Property-type page content |
| Chat | `/api/chat` | Conversations, messages, mark-read, unread counts, delete |
| Notifications | `/api/notifications` | CRUD, unread count, stats, bulk read/delete |
| Contact | `/api/contact` | Contact-form submissions |

### Admin (`/api/admin/*` — auth + admin role required)

| Group | Highlights |
|---|---|
| `/auth` | `POST /login` (admin-only), `POST /logout`, `POST /logout-beacon` (unauthenticated, for `navigator.sendBeacon`), `GET /status` |
| `/users` | List, create, get, update, delete users; profile-image upload/delete |
| `/agents` | Approved agents, applications, feature/update/delete |
| `/properties` | Admin CRUD over properties |
| `/testimonials` | List all, approval toggle, delete |
| `/contact-submissions` | List, get, update status |
| `/property-inquiries` | List, update status, reply, delete |
| `/faqs` | CRUD + categories |
| `/analytics` | Overview, listings/views by month, type distribution, top properties |
| `/dashboard` | Stats, recent properties/inquiries, earnings overview |
| `/profile` | Admin profile management |
| `/property-views` | View analytics |
| `/notifications` | Same CRUD as user notifications, plus `GET /stream` (SSE) |

## Real-time

### WebSocket (`/ws`)

The `ws` server is attached to the same HTTP server (`websocket.js`):

- Upgrade path: `/ws` only (everything else is rejected with 404/401)
- Authentication: `?token=<accessToken>` query parameter (JWT) — verified before the upgrade completes
- Messages: JSON; the server replies to `{ type: 'ping' }` with `{ type: 'pong', data: <timestamp> }`
- On connect the server sends `{ type: 'connection', data: { connected: true } }`
- `sendToUser(userId, type, data)` helper is exported for server-side push to a user's active sockets

### SSE notifications

`GET /api/admin/notifications/stream?token=<accessToken>` opens an SSE stream that pushes `data: { type: "...", data: {...} }` events as notifications are created (30 s heartbeat comments). EventSource cannot send `Authorization` headers, hence the query-param token.

## Recommendation Engine

Ranking is a **three-stage pipeline in pure Node.js** (`services/recommendation.service.js`). No LLM runs on the request path.

```
Stage 1  PROFILE      recency-decayed anchor set from PropertyView + Favorite + PropertyInquiry
Stage 2  CANDIDATES   union of 4 concurrent index-backed Mongo queries (~300 rows)
Stage 3  RANK         weighted field similarity x budget gate + popularity + freshness -> MMR
```

### Why the LLM is not the ranker

An LLM asked to order 300 listings costs seconds of latency on a page that must render, returns a different order on every reload, can hallucinate ids that are not in the database, and makes the homepage depend on a third party's uptime. Measured on this deployment, the deterministic ranker's similarity math costs **1.75 µs per comparison** — a realistic 24-anchor × 300-candidate request is **~13 ms of CPU**. DeepSeek contributes to ranking only through fields written offline (see [AI enrichment](#ai-enrichment-deepseek)).

### Stage 1 — taste profile

| Signal | Weight | Half-life |
|---|---|---|
| `PropertyInquiry` (contacted owner) | 5.0 | 45 d |
| `Favorite` (saved listing) | 3.0 | 45 d |
| `PropertyView` | 1.0 | 10 d |

Decay is `2^(-ageDays / halfLife)`. Half-lives differ per signal: a saved listing still means something six weeks later, a single page view does not.

The profile is a **weighted anchor set (max 24), not an averaged centroid.** Averaging destroys multi-modal taste — someone comparing $80k studios against $600k villas collapses to a $340k preference matching neither. Every property the visitor touched is excluded from the output.

### Stage 3 — similarity

Attribute similarity is a weighted mean over comparable fields. **Fields missing on either side are dropped from both numerator and denominator**, so a sparse listing is never punished for incomplete data.

| Field | Weight | Function |
|---|---|---|
| `propertyType` | 5.0 | exact match |
| `governorate` | 3.0 | exact match |
| `city` | 2.0 | exact match |
| `area` | 2.0 | Gaussian on log₁₀, σ = 0.20 |
| `bedrooms` | 1.5 | `max(0, 1 − |Δ| / 2)` |
| `bathrooms` | 1.5 | `max(0, 1 − |Δ| / 2)` |
| `features` | 2.0 | Jaccard over keys whose value is **`true`** |
| `aiTags` | 2.5 | Jaccard |
| `aiLifestyle` | 1.5 | cosine over 4 dimensions |

**Price is deliberately absent from that table.** Budget is a *constraint*, not a preference — someone browsing $100k apartments cannot buy the $1M one however identical it looks. As an additive term it was measured at 3.0/18.0 total weight, leaving a 10× price gap still scoring **0.83** similarity. It is therefore applied multiplicatively:

```
similarity = attributeSimilarity × budgetGate
budgetGate = 0.35 + 0.65 × exp(−(Δlog₁₀price)² / 2σ²),  σ = 0.15
```

Measured effect: a 10× price gap fell from **0.83 → 0.35**, while $100k↔$120k held at **0.91**. The `0.35` floor keeps it a strong penalty rather than a hard filter, so an exceptional match slightly out of band can still surface.

Location is **split** into governorate + city rather than concatenated. The previous engine keyed on `governorate_city`, so "same governorate, neighbouring city" scored exactly zero — indistinguishable from a different country. Split, it earns `3/(3+2) = 0.6` of the location weight.

### Final score and diversity

```
with history:  0.60 × contentSim + 0.22 × popularity + 0.18 × freshness
cold start:    contentSim is 0 for everyone, so its weight is redistributed
               onto the two components that actually discriminate
```

- **popularity** — views + 3× favorites over 14 days, `log1p`-normalized so one viral listing cannot flatten the field. Trustworthy because views are deduped to one row per identity per UTC day.
- **freshness** — `exp(−ageDays / 30)`
- **MMR** (Carbonell & Goldstein, SIGIR 1998) — `argmax[ λ·score − (1−λ)·maxSimToPicked ]`, λ = 0.7. Without it, pure score ordering returns near-duplicates by construction: the five best matches for "2-bed in Achrafieh" are usually five 2-beds in the same building.

### Caching

Ranking is **network-bound, not CPU-bound**: ~1300 ms per cold call against this deployment's Atlas cluster, of which ~13 ms is the math — the rest is four sequential round trips at a **~640 ms median RTT**. Results are cached in-process for 45 s, keyed per identity and limit, FIFO-bounded at 500 entries. Cold 3409 ms → cached **0 ms**.

Recording a view calls `invalidateCacheForIdentity`, so opening a listing and returning to the homepage shows an updated list immediately rather than waiting out the TTL.

> **The single biggest latency win available is not in this code.** A ~640 ms median RTT to MongoDB indicates a shared-tier or geographically distant Atlas cluster. Moving it to a region near the Render deployment would cut first-load latency several-fold.

### Endpoint

`GET /api/properties/recommended?limit=10` — public, `attachVisitorId` + `optionalAuth`, `Cache-Control: private, no-store`.

```json
{ "success": true, "data": [ ... ], "source": "personalized", "personalized": true }
```

`source` is one of `personalized` (history exists), `trending` (cold start), or `curated` (fallback to the admin `recommended` flag). `data` is **unchanged** from the legacy contract; `source`, `personalized`, and the per-property `match_score` / `recommendation_reason` are purely additive, so the mobile app is unaffected.

A client-supplied `user_id` query param is **ignored** — identity comes only from the session and visitor cookies. Honouring it would let anyone read another user's feed by guessing an id.

### View telemetry (the prerequisite)

`POST /api/properties/:id/views` — public, rate-limited to 120 requests / 5 min per IP.

Recommendations are only as good as the behavioural data behind them. This endpoint is what feeds Stage 1:

- **Deduped** to one row per `(property, identity, UTC day)`, enforced by a unique partial index on `{propertyId, visitorId, viewedDate}`. Verified: 130 rapid POSTs produced **1** row.
- **Identity precedence** is `visitorId` (cookie) > `ipAddress`. IP alone is a poor key — carrier NAT collapses many people onto one address, and addresses rotate.
- **UTC day bucketing** computed in the service, not from a local-time schema default, so buckets do not shift with the container timezone.
- **Ids are resolved and existence-checked** before insert (slug or uuid), so a public endpoint cannot fill the collection with orphan rows that would skew the popularity score.

### Similar properties

`GET /api/similar-properties/:id` matches on **property type only** (`services/similarProperties.service.js`). Intentionally not AI-driven and intentionally single-dimension: the previous conjunctive filter (type AND city AND governorate AND status AND price ±20%) returned `[]` on a thin catalogue, so most detail pages showed nothing.

## AI Enrichment (DeepSeek)

`services/ai.service.js` — **write-time only.** Runs when a property is created or its text changes, never while serving a read.

DeepSeek is OpenAI-wire-compatible, so the already-installed `openai` SDK is pointed at their base URL. **No new dependency.**

### What it extracts

One `deepseek-chat` call (`temperature: 0`, JSON mode) turns the free-text `description` — which the previous engine ignored entirely, counting only `features` keys — into structured ranking features:

| Field | Shape |
|---|---|
| `aiTags` | `string[]` — snake_case, e.g. `sea_view`, `newly_renovated`, `near_school` |
| `aiLifestyle` | `{ family, investor, student, luxury }`, each 0–1 |
| `aiSummary` | `{ en, ar }` — factual, ≤ 220 chars each |
| `aiModel`, `aiEnrichedAt`, `aiDescriptionHash` | provenance + change detection |

### Cost control

`aiDescriptionHash` is a SHA-256 of title + description. Enrichment re-runs only when that hash changes, so editing a price or swapping photos costs nothing. **One call per listing lifetime**, not per page view.

### Failure handling

Every failure mode resolves to `null`, so callers have exactly one case to handle. A property save **never** fails, slows, or rolls back because of the AI layer.

| Mechanism | Behaviour |
|---|---|
| Flag | Inert unless `ENABLE_AI_ENRICHMENT=true` **and** `DEEPSEEK_API_KEY` is set |
| Timeout | 8 s hard ceiling (`AI_TIMEOUT_MS`) |
| SDK retries | **Disabled** (`maxRetries: 0`) — 2 retries × 8 s would make an 8 s budget a 24 s worst case |
| Circuit breaker | Opens after 5 consecutive failures, 60 s cooldown, then one probe. Verified: per-call timings `1078, 833, 653, 647, 646, 1, 0 ms` |
| Invocation | `setImmediate` fire-and-forget, after the HTTP response is sent |
| Degradation | Ranking continues with 8 of 9 similarity fields |

### Security

- **Output is rebuilt, never passed through.** Descriptions are attacker-controllable (anyone can list a property), so a prompt-injected listing could steer the model into emitting operator-shaped keys (`$set`, `$where`), nested objects, or unbounded arrays. `sanitizeEnrichment()` re-derives every field onto a fixed shape with type checks, a `^[a-z0-9_]{2,32}$` tag pattern, `[0,1]` clamping, length caps, and a hard 3-key output whitelist. Covered by 20 adversarial assertions.
- **Clients cannot write AI fields.** `createProperty`/`updateProperty` spread the request body, so `AI_MANAGED_FIELDS` are stripped from every payload — an owner must not be able to hand-write the `aiTags` that feed their own ranking score.
- **No PII in prompts.** Only listing attributes are sent; owner name, email, and phone are never included.
- **Server-side only.** The key must never appear in a `NEXT_PUBLIC_*` variable.

## Utility Scripts (`npm run <script>`)

| Script | Purpose |
|---|---|
| `dev` / `start` | Run the server (nodemon / node) |
| `build` | Bundle build via `scripts/build.js` |
| `ensure-admin-user` | Bootstrap an admin user, e.g. `node scripts/ensure-admin-user.js --email=... --password=... [--dry-run]` |
| `reset-dev-users` | Reset development users |
| `migrate:supabase-to-mongo` | One-time legacy migration: Supabase/Postgres → MongoDB |
| `import:supabase-passwords` | Import (bcrypt `$2y$` → `$2a$` normalized) passwords for migrated users |
| `fix:migrated-user-passwords` | Apply password fixes for migrated user records |
| `test` | Jest runner (configured; **no test suites exist yet** — see below) |

## Testing

Jest and Supertest are installed and `"test": "jest"` is wired, **but no test suites have been written**. `npm test` currently reports "no tests found". Tests are expected under `__tests__/` or `*.test.js` files.

## Deployment

### Render (native Node runtime)

`render.yaml` defines the `eskan-real-estate-api` web service:

| Setting | Value |
|---|---|
| Runtime | `node` |
| Build command | `npm install --omit=dev` |
| Start command | `node index.js` |
| Health check | `/api/health` |
| Auto-deploy | enabled |

Environment variables are managed **entirely in the Render dashboard** and are
deliberately not declared in `render.yaml`, so a Blueprint sync can never
overwrite a live secret. The required set is listed under
[Configuration](#configuration).

> If this service is Blueprint-managed, confirm in the dashboard after the first
> sync that your variables are still present — a sync can prune variables the
> Blueprint does not declare.

Render injects `PORT` automatically; `index.js` reads it and falls back to 3001
locally.

Production base URL: configured in the Render dashboard; intentionally not published here.

### Required indexes

`autoIndex` is **disabled when `NODE_ENV=production`**, so these must be created once per production database. They are declared in the Mongoose schemas (so local dev gets them automatically) but a production deploy will not build them.

Run against the target database with `mongosh`:

```js
// Dedup guarantee for view telemetry. Without this, one visitor refreshing a
// listing inflates the popularity component of the recommendation score.
db.propertyviews.createIndex(
  { propertyId: 1, visitorId: 1, viewedDate: 1 },
  { unique: true, partialFilterExpression: { visitorId: { $type: "string" } }, background: true }
);

// Taste-profile reads: "most recent activity for this identity", newest first.
db.propertyviews.createIndex({ userId: 1, viewedAt: -1 }, { background: true });
db.propertyviews.createIndex({ visitorId: 1, viewedAt: -1 }, { background: true });

// Multikey index for tag-based filtering / aiTags similarity reads.
db.properties.createIndex({ aiTags: 1 }, { background: true });
```

Verify:

```js
db.propertyviews.getIndexes();   // expect propertyId_1_visitorId_1_viewedDate_1 with unique: true
```

The unique build is safe on an existing collection: rows written before this change carry no `visitorId`, so the partial filter excludes them and there is nothing to collide.

## Project Structure

```text
backend/
├── index.js                 # App bootstrap: middleware, CORS, routes, server start
├── websocket.js             # ws server on /ws (noServer mode, JWT via query token)
├── config/                  # mongo.js, cloudinary.js, cookies.js (auth + visitor_id policy)
├── routes/                  # Express routers (user + admin/)
├── controllers/             # Request handlers (mirrors routes/)
├── services/                # Business logic
│   ├── recommendation.service.js   # 3-stage deterministic ranker (profile/candidates/MMR)
│   ├── ai.service.js               # DeepSeek write-time enrichment + circuit breaker
│   └── admin/                      # Admin-scoped business logic
├── models/                  # Mongoose schemas (user, property, propertyView, ...)
├── middleware/              # auth.js — requireAuth, requireRole, optionalAuth, attachVisitorId
│                            # csrfGuard.js — X-Requested-With enforcement
├── utils/                   # cloudinaryUpload, notificationStream (SSE), slugify
├── scripts/                 # migrations, ensure-admin-user, reset-dev-users
├── database/schema.sql      # LEGACY Supabase/Postgres schema (migration reference only)
└── render.yaml
```

## Recommendation Engine — Operational Notes

Things worth knowing before changing this code:

1. **Field-name hazard.** Mongo stores camelCase (`propertyType`, `governorate`); the API response layer also emits snake_case aliases (`property_type`, `governate` — note the legacy typo, preserved for old clients). Reading the wrong one yields `undefined`, which degrades every similarity to "no data" **without raising an error anywhere**. `toFeatures()` is the single place that reconciles both shapes — go through it.

2. **View counts changed meaning.** They are now unique-per-identity-per-day rather than raw hits, so numbers grow more slowly than before. This is deliberate: inflatable counts would corrupt the popularity component. Rows written before this change are untouched.

3. **Indexes do NOT auto-build in production.** `config/mongo.js` sets `autoIndex: process.env.NODE_ENV !== 'production'`, so a production deploy creates **none** of the indexes below. Without the unique one, per-day view dedup is not enforced and the popularity score becomes trivially inflatable. Create them once per environment — see [Required indexes](#required-indexes).

   The unique index uses `partialFilterExpression: { visitorId: { $type: 'string' } }` — **not** `sparse`. A compound *sparse* index still indexes documents that have only some of the keys, so every legacy row without a `visitorId` would collide on the same null key and the build would fail.

4. **The personalized homepage slot is client-rendered on purpose.** `app/page.js` passes no `initialProperties` to `PropertyCarousel`. ISR caches one HTML payload and serves it to everyone, so a pre-rendered list there would be identical for all visitors — and the component skips its fetch entirely when seeded.

5. **Tuning lives in one block.** All weights, half-lives, sigmas, and blend ratios are named constants at the top of `recommendation.service.js`. Every one carries a comment explaining *why* it has that value. Change them there, not inline.

## License

MIT