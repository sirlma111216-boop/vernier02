# 도쿄 Gemini 릴레이 (Cloud Run)

Cloudflare Pages 함수가 홍콩(HKG) 같은 **Gemini 미지원 엣지**에서 실행되면
`400 User location is not supported` 가 납니다. 이 작은 서비스를 **도쿄
(asia-northeast1)** 에 배포해 Gemini 호출이 **항상 일본에서 나가도록** 합니다.

```
브라우저 → Cloudflare /api/evaluate → (도쿄) Cloud Run 릴레이 → Gemini
```

- Gemini API 키는 **이 서비스에만** 둡니다(Cloudflare에서 제거 가능).
- 공개 URL이므로 **공유 비밀 헤더 `x-proxy-secret`** 로 보호합니다(Cloudflare만 호출).

## 사전 준비
- GCP 프로젝트 + 결제 사용 설정(Cloud Run 무료 등급 충분).
- `gcloud` CLI 로그인: `gcloud auth login`, `gcloud config set project <PROJECT_ID>`.

## 배포 (이 `cloud-run/` 폴더에서 실행)

```bash
gcloud run deploy gemini-proxy \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars "GEMINI_API_KEY=<당신의_GEMINI_키>,GEMINI_MODEL=gemini-3.1-flash-lite,PROXY_SHARED_SECRET=<공유_비밀>"
```

> `--allow-unauthenticated` 는 URL을 공개로 만들지만, 호출은 `x-proxy-secret`
> 비밀로 막습니다. **`<공유_비밀>` 실제 값은 절대 이 저장소에 커밋하지 마세요.**
> 로컬 `.dev.vars`(gitignore됨)에 이미 생성된 값이 들어 있으니 그 값을 쓰거나,
> `openssl rand -base64 24` 로 새로 만들어 Cloud Run과 Cloudflare 양쪽에 동일하게 넣으세요.

배포가 끝나면 출력에 **서비스 URL**이 나옵니다. 예:
`https://gemini-proxy-xxxxxxxx-an.a.run.app`

## Cloudflare 쪽 설정 (대시보드 → Pages → vernier02 → Settings → Environment variables)
다음 두 변수를 **추가**합니다(Production):

| 변수 | 값 |
|---|---|
| `GEMINI_PROXY_URL` | 위에서 받은 Cloud Run URL |
| `PROXY_SHARED_SECRET` | Cloud Run에 넣은 것과 **동일한** 비밀 값 |

- 설정 후 재배포(또는 빈 커밋 push)하면 `/api/evaluate`가 자동으로 도쿄 릴레이를 경유합니다.
- `GEMINI_PROXY_URL` 이 없으면 기존처럼 Gemini를 직접 호출합니다(하위 호환).
- 전환이 확인되면 Cloudflare의 `GEMINI_API_KEY` 는 제거해도 됩니다(키는 Cloud Run에만).

## 동작 확인
```bash
# 1) 릴레이 헬스체크
curl https://gemini-proxy-xxxxxxxx-an.a.run.app/health   # -> ok

# 2) 운영 엔드포인트 (여러 번 호출해도 지역 오류가 없어야 정상)
curl -s -X POST https://vernier02.labbitory.com/api/evaluate \
  -H "content-type: application/json" \
  -d '{"dataSummary":{},"predictions":{},"observeAnswers":{},"explainAnswers":{}}' | head -c 200
```

## 로컬 실행(선택)
```bash
GEMINI_API_KEY=... PROXY_SHARED_SECRET=... node server.js   # :8080
```
