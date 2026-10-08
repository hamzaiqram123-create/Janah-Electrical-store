# syntax=docker/dockerfile:1
# Runs on any container host (Render, Fly.io, a VPS with Docker). Render injects PORT (10000);
# elsewhere the server listens on 3000 unless PORT is set.
FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production UPLOAD_DIR=/data/uploads

COPY package.json bun.lock* ./
RUN bun install --production

COPY . .
RUN bun run build && mkdir -p /data/uploads && chown -R bun:bun /data

USER bun
EXPOSE 3000
# Migrations are idempotent (each file runs once). SEED_ON_START=true loads the reference data, the first
# administrator and the sample catalogue on boot; turn it off after the first successful start, because the
# seed re-adds reference rows (FAQs, pages, categories…) that were deleted in the admin.
CMD ["sh", "-c", "bun scripts/migrate.ts && if [ \"$SEED_ON_START\" = \"true\" ]; then bun scripts/seed.ts; fi && exec bun src/server/index.ts"]
