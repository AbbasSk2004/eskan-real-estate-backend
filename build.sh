#!/usr/bin/env bash
# Native (non-Docker) build helper. Not used by the Render Docker service —
# kept for local or alternative-host builds.
set -o errexit

echo "Installing Node.js dependencies..."
npm install

echo "Done."
