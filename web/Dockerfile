FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

EXPOSE 3000
# Migrations run first, then the server. Both are in the start script so a fresh
# database needs no manual step.
CMD ["npm", "run", "start"]
