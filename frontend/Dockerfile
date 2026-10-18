FROM node:22-alpine

WORKDIR /app

# Copy package manifests for efficient layer caching
COPY package.json package-lock.json ./

RUN npm ci

# Copy frontend source files
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
