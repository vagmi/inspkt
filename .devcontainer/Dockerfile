FROM mcr.microsoft.com/devcontainers/javascript-node:24

# System packages: sqlite3 for poking at the local D1 database directly,
# build tools come with the base image (needed by better-sqlite3).
RUN apt-get update \
    && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y --no-install-recommends sqlite3 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# pnpm via corepack (version pinned by package.json's "packageManager")
RUN corepack enable

# Global CLIs:
#  - wrangler         Cloudflare Workers/D1 (also a devDependency; global for convenience)
#  - claude-code      Claude Code
#  - @playwright/cli  browser verification workflow (see .claude/skills).
#    Browsers + system deps install on demand at runtime to keep the image
#    lean: `sudo npx -y playwright install --with-deps chromium`
RUN npm install -g wrangler @anthropic-ai/claude-code @playwright/cli@latest

# Polar CLI (billing webhooks via `polar listen`).
# The install script has no linux/arm64 build yet — Codespaces machines are
# amd64 so this only skips when building locally on Apple Silicon.
RUN if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
      curl -fsSL https://polar.sh/install.sh | bash; \
    else \
      echo "NOTE: Polar CLI skipped (no linux/arm64 build yet)"; \
    fi

USER node
