# Backend Dockerfile — Node only (no Python).
#
# No application environment variables are defined here on purpose: every value
# (secrets and non-secrets alike) comes from the Render dashboard at runtime.
# Baking them into the image would freeze config to build time and persist
# values in image layers.

FROM node:18.19-slim

ENV DEBIAN_FRONTEND=noninteractive

# git + ca-certificates: some npm installs fetch over git/HTTPS.
RUN set -eux; \
    apt-get update --allow-releaseinfo-change; \
    for i in 1 2 3; do \
      apt-get install -y --no-install-recommends git ca-certificates && break || sleep 5; \
    done; \
    apt-get clean; rm -rf /var/lib/apt/lists/*

# Keep line endings stable when npm resolves git dependencies.
RUN git config --global core.autocrlf false

WORKDIR /app

# Copy manifests first so the dependency layer caches independently of source.
COPY package*.json ./

RUN npm install --omit=dev

COPY . .

# Uploads scratch dir, then drop root.
RUN mkdir -p uploads && chown -R node:node /app

USER node

# Render injects PORT at runtime; index.js falls back to 3001 locally.
EXPOSE 3001

CMD ["node", "index.js"]
