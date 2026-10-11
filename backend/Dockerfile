# Optional: deploy the API on Render (or elsewhere) with SQLite when `sqlite3`
# fails on the default Node image (ERR_DLOPEN_FAILED). In Render, choose
# "Docker" as the environment and set the Dockerfile path to `backend/Dockerfile`.
FROM node:20-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --foreground-scripts && (cd node_modules/sqlite3 && npm run rebuild)
COPY . .
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "src/server.js"]
