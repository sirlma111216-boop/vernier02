FROM node:20-slim
WORKDIR /app
# 의존성 없음(내장 모듈만 사용) — package.json만 복사
COPY package.json ./
RUN npm install --omit=dev || true
COPY server.js ./
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
