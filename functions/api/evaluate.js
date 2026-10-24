// Temporarily paused at the server boundary: no body parsing or upstream calls.
export async function onRequestPost() {
  return new Response(JSON.stringify({ error: '학생용 AI 평가를 일시 중단했습니다.', code: 'student_ai_paused', retryable: false }), {
    status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}
