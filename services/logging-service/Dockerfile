FROM node:18-alpine

WORKDIR /app

COPY package.json ./
COPY packages/shared ./packages/shared
COPY services/logging-service/package.json ./services/logging-service/package.json

RUN npm install --workspace services/logging-service

COPY services/logging-service/src ./services/logging-service/src
COPY services/logging-service/tests ./services/logging-service/tests
COPY services/logging-service/.env.example ./services/logging-service/.env.example

WORKDIR /app/services/logging-service

EXPOSE 3007

CMD ["npm", "start"]
