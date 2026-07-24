// /functions/api/share-config.js — 모둠 공유용 Supabase 접속 정보 제공
//
// anon key는 공개되어도 안전한 구조다:
//   - share_sessions 테이블은 RLS로 직접 접근 전면 차단
//   - create_share_session / get_share_session 두 함수만 anon에 개방(SECURITY DEFINER)
// 다만 저장소에 값을 커밋하지 않으려고 Cloudflare 환경변수에서 읽어 내려준다.
//
// 필요한 환경변수: SUPABASE_URL, SUPABASE_ANON_KEY

export async function onRequestGet({ env }) {
  const url = (env.SUPABASE_URL || '').trim();
  const anonKey = (env.SUPABASE_ANON_KEY || '').trim();
  const body = (url && anonKey)
    ? { configured: true, url, anonKey }
    : { configured: false };

  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
