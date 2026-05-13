FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY src ./src
COPY .env.example ./.env.example

ENV NODE_ENV=production
EXPOSE 3000

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const p=Number(process.env.PORT)||3000;fetch('http://127.0.0.1:'+p+'/health').then(r=>r.json().then(j=>process.exit(j&&j.ok?0:1))).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
