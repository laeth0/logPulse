# ── Development image ─────────────────────────────────────────────────────────
FROM node:22-alpine AS development

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]
