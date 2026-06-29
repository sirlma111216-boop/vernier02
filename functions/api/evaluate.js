// /functions/api/evaluate.js — Cloudflare Pages Function
// 기본 제공사: Gemini(무료 티어). env.AI_PROVIDER = 'gemini' | 'claude' 로 교체 가능.
//
// ⚠️ 개인정보: 클라이언트는 학생 이름·학교·반을 여기로 보내지 않는다.
//    payload에는 익명화된 측정 데이터와 답변 텍스트만 담는다.
//    { dataSummary, predictions, observeAnswers, explainAnswers }
//
// 안정성: 모든 오류 경로를 잡아 200 + {error, detail} JSON으로 돌려준다.
//   (5xx로 돌려주면 Cloudflare 엣지가 "error code: 502" 평문으로 덮어써서
//    클라이언트가 원인을 알 수 없게 되므로, 본문이 항상 닿도록 200으로 반환.)
//   Gemini 분당 한도(RPM)로 인한 429/5xx는 백오프 후 재시도한다.

const SYSTEM_PROMPT = `너는 중학교 3학년 과학 '상태 변화와 열에너지' 단원의 탐구를 돕는 평가 도우미다.
학생은 라우르산(로르산)의 냉각 곡선 실험을 했다. 로르산의 응고점은 약 43°C다.
다음 원칙을 지켜라:
- 답을 곧장 주기보다, 오개념이 있으면 학생이 스스로 깨닫도록 되묻는 질문/힌트를 먼저 제시한다.
- 그래도 마지막에는 올바른 개념을 짧게 확인시켜 준다.
- 중학생 눈높이의 따뜻하고 구체적인 말투를 쓴다.
핵심 개념: 액체→고체로 응고하는 동안 열에너지를 '방출'하기 때문에 온도가 일정하게 유지된다. 냉각하면 입자 운동이 둔해지고 입자 사이 거리가 가까워지며 배열이 규칙적으로 변한다.`;

const JSON_SCHEMA_HINT = `반드시 아래 JSON 스키마로만, 다른 텍스트 없이 응답하라:
{"success": boolean, "successReason": string, "strengths": [string], "improvements": [string], "misconceptions": [{"detected": string, "guidingQuestion": string, "correctConcept": string}], "encouragement": string}`;

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const jsonResp = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(id); }
}

export async function onRequestPost({ request, env }) {
  try {
    let payload;
    try { payload = await request.json(); }
    catch { payload = {}; }

    const provider = env.AI_PROVIDER || 'gemini';
    const userContent = `다음은 학생의 실험 데이터 요약과 답변이다. 평가해줘.\n${JSON.stringify(payload, null, 2)}`;

    const resultText = provider === 'claude'
      ? await callClaude(env, userContent)
      : await callGemini(env, userContent);

    // ```json 펜스 제거
    const clean = (resultText || '').replace(/```json|```/g, '').trim();
    // 유효 JSON인지 확인 — 아니면 오류로 처리(클라이언트가 안내/재시도)
    try { JSON.parse(clean); }
    catch { return jsonResp({ error: 'AI 응답 형식 오류', detail: clean.slice(0, 200) }); }
    return new Response(clean, { headers: JSON_HEADERS });
  } catch (e) {
    const msg = String((e && e.message) || e);
    const rateLimited = /\b429\b/.test(msg);
    // Cloudflare 엣지가 Gemini 미지원 지역(예: 홍콩)에서 실행되면 400 location 오류.
    // 같은 invocation은 같은 colo라 서버 재시도는 무의미 → 클라이언트가 재요청하면 다른 colo로 재배정됨.
    const geoBlocked = /location is not supported/i.test(msg);
    return jsonResp({
      error: geoBlocked ? '지역 라우팅 문제(자동 재시도 중)'
           : rateLimited ? 'AI 사용량 한도 초과(잠시 후 재시도)'
           : 'AI 평가 호출 실패',
      detail: msg,
      rateLimited,
      geoBlocked,
    });
  }
}

// ── Gemini (기본) ───────────────────────────────────────────────
async function callGemini(env, userContent) {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 미설정');
  const model = env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT}\n${JSON_SCHEMA_HINT}` }] },
    contents: [{ role: 'user', parts: [{ text: userContent }] }],
    generationConfig: {
      responseMimeType: 'application/json', // JSON 강제
      maxOutputTokens: 1500,
      temperature: 0.4,
    },
  });

  // 429(분당 한도)·5xx는 백오프 후 재시도
  const delays = [0, 1500, 4000];
  let lastErr;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await sleep(delays[i]);
    let res;
    try { res = await fetchWithTimeout(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body }, 25000); }
    catch (e) { lastErr = new Error('Gemini fetch 실패: ' + String((e && e.message) || e)); continue; }
    if (res.ok) {
      const data = await res.json();
      return (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    }
    lastErr = new Error('Gemini ' + res.status + ' ' + (await res.text()).slice(0, 200));
    if (res.status !== 429 && res.status < 500) break; // 재시도해도 소용없는 오류는 중단
  }
  throw lastErr;
}

// ── Claude (교체용) ─────────────────────────────────────────────
async function callClaude(env, userContent) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY 미설정');
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL || 'claude-haiku-4-5',
      max_tokens: 1500,
      system: `${SYSTEM_PROMPT}\n${JSON_SCHEMA_HINT}`,
      messages: [{ role: 'user', content: userContent }],
    }),
  }, 25000);
  if (!res.ok) throw new Error('Claude ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const data = await res.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}
