FROM node:18-alpine

WORKDIR /app

COPY package.json ./
COPY packages/shared ./packages/shared
COPY services/conversation-engine/package.json ./services/conversation-engine/package.json

RUN npm install --workspace services/conversation-engine

COPY services/conversation-engine/src ./services/conversation-engine/src
COPY services/conversation-engine/tests ./services/conversation-engine/tests
COPY services/conversation-engine/.env.example ./services/conversation-engine/.env.example

WORKDIR /app/services/conversation-engine

EXPOSE 3002

CMD ["npm", "start"]
