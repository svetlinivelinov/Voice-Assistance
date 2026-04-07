FROM node:18-alpine

WORKDIR /app

COPY package.json ./
COPY packages/shared ./packages/shared
COPY services/data-standardization/package.json ./services/data-standardization/package.json

RUN npm install --workspace services/data-standardization

COPY services/data-standardization/src ./services/data-standardization/src
COPY services/data-standardization/tests ./services/data-standardization/tests
COPY services/data-standardization/.env.example ./services/data-standardization/.env.example

WORKDIR /app/services/data-standardization

EXPOSE 3006

CMD ["npm", "start"]
