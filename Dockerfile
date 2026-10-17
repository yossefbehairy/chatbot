FROM node:20-slim

# Chromium + fonts required by whatsapp-web.js / Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Use the Chromium installed above instead of downloading one
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app

# Install dependencies first so Docker can cache this layer
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the source (secrets, sessions and runtime data are excluded via .dockerignore)
COPY . .

# WhatsApp session lives here (bind-mount or Fly volume in production)
RUN mkdir -p session

CMD ["node", "bot.js"]
