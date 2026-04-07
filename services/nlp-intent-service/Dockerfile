FROM node:18-alpine

WORKDIR /app

COPY package.json ./
COPY packages/shared ./packages/shared
COPY services/nlp-intent-service/package.json ./services/nlp-intent-service/package.json

RUN npm install --workspace services/nlp-intent-service

COPY services/nlp-intent-service/src ./services/nlp-intent-service/src
COPY services/nlp-intent-service/tests ./services/nlp-intent-service/tests
COPY services/nlp-intent-service/.env.example ./services/nlp-intent-service/.env.example

WORKDIR /app/services/nlp-intent-service

EXPOSE 3005

CMD ["npm", "start"]
