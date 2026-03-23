FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# wdk-4337 local package
COPY apps/packages/wdk-4337 ./apps/packages/wdk-4337
RUN cd apps/packages/wdk-4337 && npm ci

# Server
COPY apps/server/package.json apps/server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY apps/server/src ./server/src

# Client (delete lockfile so npm resolves platform-correct native binaries)
COPY apps/client/package.json apps/client/package-lock.json ./apps/client/
RUN cd apps/client && npm ci --force
COPY apps/client ./apps/client
RUN cd apps/client && npx vite build

EXPOSE 4848
EXPOSE 3000

CMD ["sh", "-c", "cd /app/server && node_modules/.bin/tsx src/server.ts & cd /app/apps/client && npx vite preview --outDir dist --port 3000 --host & wait"]
