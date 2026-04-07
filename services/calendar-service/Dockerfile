FROM node:18-alpine

WORKDIR /app

COPY package.json ./
COPY packages/shared ./packages/shared
COPY services/calendar-service/package.json ./services/calendar-service/package.json

RUN npm install --workspace services/calendar-service

COPY services/calendar-service/src ./services/calendar-service/src
COPY services/calendar-service/tests ./services/calendar-service/tests
COPY services/calendar-service/.env.example ./services/calendar-service/.env.example

WORKDIR /app/services/calendar-service

EXPOSE 3003

CMD ["npm", "start"]
