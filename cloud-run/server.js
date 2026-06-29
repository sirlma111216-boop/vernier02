// 도쿄(asia-northeast1) 고정 리전 Gemini 릴레이 — Cloud Run용
//
// 목적: Cloudflare Pages 함수가 실행되는 엣지(예: 홍콩 HKG)는 Gemini가 지역 차단
//       ("User location is not supported")하므로, Gemini 호출만 항상 일본에서
//       나가도록 이 릴레이를 거친다. 이 서비스의 송신 IP는 도쿄라 차단되지 않는다.
//
// 보안: 공개 URL이므로 공유 비밀 헤더(x-proxy-secret)로 보호한다(Cloudflare만 호출).
//       Gemini API 키는 이 서비스의 환경변수(GEMINI_API_KEY)에만 둔다.
//
// 계약(요청): POST /
//   headers: { 'x-proxy-secret': <PROXY_SHARED_SECRET> }
//   body:    { "model": "gemini-3.1-flash-lite", "payload": <generateContent 본문> }
// 응답: Gemini의 HTTP 상태/본문을 그대로 전달(passthrough) → 호출 측 로직 변경 최소화.

const http = require('http');

const KEY = process.env.GEMINI_API_KEY || '';
const SECRET = process.env.PROXY_SHARED_SECRET || '';
const PORT = process.env.PORT || 8080;
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const server = http.createServer((req, res) => {
  // 헬스체크
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('ok');
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'method not allowed' }));
  }
  // 공유 비밀 검증
  if (!SECRET || req.headers['x-proxy-secret'] !== SECRET) {
    res.writeHead(403, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'forbidden' }));
  }

  let raw = '';
  req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
  req.on('end', async () => {
    try {
      const { model, payload } = JSON.parse(raw || '{}');
      if (!KEY) { res.writeHead(500, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'GEMINI_API_KEY not set' })); }
      const m = model || process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
      const url = `${GEMINI_BASE}/${m}:generateContent?key=${KEY}`;
      const g = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
      const text = await g.text();
      // Gemini 응답을 상태코드까지 그대로 전달
      res.writeHead(g.status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(text);
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'proxy error', detail: String((e && e.message) || e) }));
    }
  });
});

server.listen(PORT, () => console.log('gemini-tokyo-proxy listening on ' + PORT));
