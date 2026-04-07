FROM node:18-alpine

WORKDIR /app

COPY package.json ./
COPY packages/shared ./packages/shared
COPY services/telephony-service/package.json ./services/telephony-service/package.json

RUN npm install --workspace services/telephony-service

COPY services/telephony-service/src ./services/telephony-service/src
COPY services/telephony-service/tests ./services/telephony-service/tests
COPY services/telephony-service/.env.example ./services/telephony-service/.env.example

WORKDIR /app/services/telephony-service

EXPOSE 3001

CMD ["npm", "start"]
