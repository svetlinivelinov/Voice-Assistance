FROM node:18-alpine

WORKDIR /app

# Copy manifests first for layer-cache efficiency
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY services/telephony-service/package.json ./services/telephony-service/package.json

# Reproducible install (fails on lock-file mismatch)
RUN npm ci --workspace=@voice-assistant/telephony-service --workspace=@voice-assistant/shared --include-workspace-root

# Copy source after install to preserve the layer cache on dep-only rebuilds
COPY packages/shared/src ./packages/shared/src
COPY services/telephony-service/src ./services/telephony-service/src
COPY services/telephony-service/.env.example ./services/telephony-service/.env.example

WORKDIR /app/services/telephony-service

# Railway injects PORT at runtime; EXPOSE is documentation only
EXPOSE 3001

CMD ["node", "src/index.js"]
