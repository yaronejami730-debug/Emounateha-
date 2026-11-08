# Page de don Stripe (mode TEST) + reçus CERFA PDF + e-mails : image autonome avec Chromium pour fabriquer les PDF
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-dejavu-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY local-stripe-test/package*.json ./local-stripe-test/
RUN cd local-stripe-test && npm ci --omit=dev
COPY local-stripe-test ./local-stripe-test
COPY public ./public
ENV NODE_ENV=production HOST=0.0.0.0 PORT=10000 DATA_DIR=/data CHROME_PATH=/usr/bin/chromium CHROME_NO_SANDBOX=1
WORKDIR /app/local-stripe-test
EXPOSE 10000
CMD ["node", "server.js"]
