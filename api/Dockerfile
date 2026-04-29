FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npx", "ts-node-dev", "--compiler-options", "{\"module\":\"commonjs\"}", "--respawn", "src/index.ts"]
