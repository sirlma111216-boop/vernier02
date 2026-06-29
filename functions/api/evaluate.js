// /functions/api/evaluate.js — Cloudflare Pages Function
// 기본 제공사: Gemini(무료 티어). env.AI_PROVIDER = 'gemini' | 'claude' 로 교체 가능.
//
// ⚠️ 개인정보: 클라이언트는 학생 이름·학교·반을 여기로 보내지 않는다.
//    payload에는 익명화된 측정 데이터와 답변 텍스트만 담는다.
//    { dataSummary, predictions, observeAnswers, explainAnswers }

const SYSTEM_PROMPT = `너는 중학교 3학년 과학 '상태 변화와 열에너지' 단원의 탐구를 돕는 평가 도우미다.
학생은 라우르산(로르산)의 냉각 곡선 실험을 했다. 로르산의 응고점은 약 43°C다.
다음 원칙을 지켜라:
- 답을 곧장 주기보다, 오개념이 있으면 학생이 스스로 깨닫도록 되묻는 질문/힌트를 먼저 제시한다.
- 그래도 마지막에는 올바른 개념을 짧게 확인시켜 준다.
- 중학생 눈높이의 따뜻하고 구체적인 말투를 쓴다.
핵심 개념: 액체→고체로 응고하는 동안 열에너지를 '방출'하기 때문에 온도가 일정하게 유지된다. 냉각하면 입자 운동이 둔해지고 입자 사이 거리가 가까워지며 배열이 규칙적으로 변한다.`;

const JSON_SCHEMA_HINT = `반드시 아래 JSON 스키마로만, 다른 텍스트 없이 응답하라:
{"success": boolean, "successReason": string, "strengths": [string], "improvements": [string], "misconceptions": [{"detected": string, "guidingQuestion": string, "correctConcept": string}], "encouragement": string}`;

export async function onRequestPost({ request, env }) {
  const payload = await request.json();
  const provider = env.AI_PROVIDER || 'gemini';
  const userContent = `다음은 학생의 실험 데이터 요약과 답변이다. 평가해줘.\n${JSON.stringify(payload, null, 2)}`;

  let resultText;
  try {
    resultText = provider === 'claude'
      ? await callClaude(env, userContent)
      : await callGemini(env, userContent);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'AI 평가 호출 실패', detail: String(e) }), {
      status: 502, headers: { 'content-type': 'application/json' },
    });
  }

  // ```json 펜스 제거 후 그대로 전달
  const clean = resultText.replace(/```json|```/g, '').trim();
  return new Response(clean, { headers: { 'content-type': 'application/json' } });
}

// ── Gemini (기본) ───────────────────────────────────────────────
async function callGemini(env, userContent) {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 미설정');
  const model = env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT}\n${JSON_SCHEMA_HINT}` }] },
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      generationConfig: {
        responseMimeType: 'application/json', // JSON 강제
        maxOutputTokens: 1500,
        temperature: 0.4,
      },
    }),
  });
  if (!res.ok) throw new Error('Gemini ' + res.status + ' ' + (await res.text()).slice(0, 300));
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
}

// ── Claude (교체용) ─────────────────────────────────────────────
async function callClaude(env, userContent) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY 미설정');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
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
  });
  if (!res.ok) throw new Error('Claude ' + res.status + ' ' + (await res.text()).slice(0, 300));
  const data = await res.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}
