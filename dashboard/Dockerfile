FROM node:20-alpine
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 9016
CMD ["npx", "next", "dev", "-H", "0.0.0.0", "-p", "9016"]
