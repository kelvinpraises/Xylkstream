FROM node:22-slim

# Force IPv4 for all DNS resolution (Docker Desktop IPv6 routing broken)
ENV NODE_OPTIONS="--dns-result-order=ipv4first"
RUN echo 'precedence ::ffff:0:0/96 100' > /etc/gai.conf

# Increase npm network resilience
RUN npm config set fetch-retries 5 && npm config set fetch-retry-mintimeout 20000 && npm config set fetch-retry-maxtimeout 120000

WORKDIR /app

# wdk-4337 local package
COPY apps/packages/wdk-4337 ./apps/packages/wdk-4337
RUN cd apps/packages/wdk-4337 && npm ci --ignore-scripts

# Server
COPY apps/server/package.json apps/server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev --ignore-scripts
COPY apps/server/src ./server/src

# Client
COPY apps/client/package.json apps/client/package-lock.json ./apps/client/
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN cd apps/client && rm -f package-lock.json && npm install
COPY apps/client ./apps/client
RUN cd apps/client && npx vite build

EXPOSE 4848
EXPOSE 3000

CMD ["sh", "-c", "cd /app/server && node_modules/.bin/tsx src/server.ts & cd /app/apps/client && npx vite preview --outDir dist --port 3000 --host & wait"]
