FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# wdk-4337 local package
COPY apps/packages/wdk-4337 ./apps/packages/wdk-4337
RUN cd apps/packages/wdk-4337 && npm ci

# Server
COPY apps/server/package.json apps/server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev --force && npm install --no-save @libsql/linux-x64-gnu
COPY apps/server/src ./server/src
COPY apps/contracts/deploy/output ./apps/contracts/deploy/output

# Client (delete lockfile so npm resolves platform-correct native binaries)
COPY apps/client/package.json apps/client/package-lock.json ./apps/client/
RUN cd apps/client && npm ci --force && npm install --no-save @rollup/rollup-linux-x64-gnu @esbuild/linux-x64 lightningcss-linux-x64-gnu @tailwindcss/oxide-linux-x64-gnu 2>/dev/null; true
RUN ln -s /app/apps/client/node_modules/vite-plugin-node-polyfills /app/apps/packages/wdk-4337/node_modules/vite-plugin-node-polyfills
COPY apps/client ./apps/client

ARG VITE_API_URL
ARG VITE_PRIVY_APP_ID
ARG VITE_DEFAULT_CHAIN_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_PRIVY_APP_ID=$VITE_PRIVY_APP_ID
ENV VITE_DEFAULT_CHAIN_ID=$VITE_DEFAULT_CHAIN_ID

RUN cd apps/client && npx vite build
RUN npm install -g serve

EXPOSE 4848
EXPOSE 3000

CMD ["sh", "-c", "cd /app/server && node_modules/.bin/tsx src/server.ts & serve -s /app/apps/client/dist -l 3000 & wait"]
