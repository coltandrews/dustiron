# Dust & Iron game server: serves the game and runs the shared world.
# Cloudflare runs containers on linux/amd64.
FROM --platform=linux/amd64 node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# Three.js and Rapier run on the server too (physics and outlaw AI); Vite is not needed.
RUN npm ci --omit=dev --ignore-scripts
COPY index.html favicon.svg ./
COPY src ./src
COPY server ./server
ENV PORT=8080 DATA_DIR=/data
EXPOSE 8080
CMD ["node", "server/index.js"]
