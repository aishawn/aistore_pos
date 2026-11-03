FROM node:24-bookworm-slim
WORKDIR /app
COPY pos-ui/package.json pos-ui/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY pos-ui/src/lib/ ./src/lib/
COPY pos-ui/scripts/report-worker.ts ./scripts/report-worker.ts
ENV NODE_ENV=production
USER node
HEALTHCHECK --interval=30s --start-period=120s --timeout=5s CMD node -e "const fs=require('fs'); process.exit(Date.now()-fs.statSync('/tmp/report-worker-heartbeat').mtimeMs<180000?0:1)"
CMD ["node", "--experimental-strip-types", "scripts/report-worker.ts"]
