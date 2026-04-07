FROM node:18-alpine

WORKDIR /app

COPY package.json ./
COPY packages/shared ./packages/shared
COPY services/crm-service/package.json ./services/crm-service/package.json

RUN npm install --workspace services/crm-service

COPY services/crm-service/src ./services/crm-service/src
COPY services/crm-service/tests ./services/crm-service/tests
COPY services/crm-service/.env.example ./services/crm-service/.env.example

WORKDIR /app/services/crm-service

EXPOSE 3004

CMD ["npm", "start"]
