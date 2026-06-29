# 버니어 척척박사 ② — 로르산 냉각 곡선 탐구 앱

중학교 3학년 과학 〈상태 변화와 열에너지〉 — **로르산(라우르산) 냉각 곡선** 실험을 위한
단일 페이지 웹앱입니다. 학생이 직접 실험하며 Vernier Go Direct 온도 센서로 데이터를
자동 측정하고, 스스로 분석한 뒤, 생성형 AI가 평가·피드백해 줍니다.

**교육 철학:** "설정은 앱이, 탐구는 학생이" · POE(예상→관찰→설명) · AI는 정답을 먼저 주지 않는다.

## 화면 흐름 (STEP 0 → 6)

| STEP | 이름 | 핵심 |
|---|---|---|
| 0 | 도입·예상(Predict) | 예상 선택 + 이유 서술 |
| 1 | 실험 준비 | 체크리스트로 실제 실험 먼저 진행 |
| 2 | 센서 연결 | Web Bluetooth로 Go Direct 연결 (+ 데모 모드) |
| 3 | 데이터 수집 | 실시간 온도 + 자동/수동 기록 + 냉각 곡선 |
| 4 | 탐구 질문 | 그래프 기반 순차 질문(Observe·Explain) |
| 5 | AI 평가 | 성공 여부·잘된 점·보완점·오개념 안내 |
| 6 | 보고서·인쇄 | 전체 보고서 조립 + `window.print()` |

## 파일 구성

```
index.html              ★ 자체 완결형 단일 파일 — 화면 구조 + 스타일(CSS) +
                          godirect 라이브러리 + 전체 로직(JS)이 모두 인라인.
                          더블클릭(file://)으로 열어도 깨지지 않습니다.
functions/api/evaluate.js   Cloudflare Pages Function — AI 평가 프록시(키 비노출)
README.md               이 문서
.claude/launch.json     로컬 미리보기용 정적 서버 설정
```

> - `index.html` 한 파일만 있으면 프런트엔드가 동작합니다(외부 의존성: 구글 폰트뿐, 폰트 없어도 기본 글꼴로 표시).
> - 센서 연결 코드·라이브러리는 기존 「버니어 척척박사」 온도센서 앱(`vernier-temp-test_7.html`)에서
>   동작하던 godirect 모듈을 그대로 재사용해 인라인으로 포함했습니다.
> - AI 평가 기능만 `functions/`(Cloudflare Pages Functions) 배포가 필요합니다.

## 로컬 실행

Web Bluetooth는 **https 또는 localhost**에서만 동작합니다.

```bash
npx http-server -p 8123 -c-1 .
# http://localhost:8123 접속
```

센서가 없어도 STEP 2의 **"센서 없이 시연(데모)"** 버튼으로 가상 냉각 곡선을 그려 전체 흐름을 체험할 수 있습니다.
(브라우저: Chrome · Edge · 웨일. iOS Safari는 Web Bluetooth 미지원 → 데모 모드 권장.)

## Cloudflare Pages 배포

1. 이 폴더를 Cloudflare Pages 프로젝트로 연결(또는 `npx wrangler pages deploy .`).
   - 빌드 명령 없음(정적). 출력 디렉터리는 루트(`/`).
   - `functions/` 폴더가 자동으로 Pages Functions로 배포됩니다 → `/api/evaluate` 엔드포인트 생성.
2. **환경 변수**(Pages → Settings → Environment variables)에 키 등록:
   - 기본(Gemini): `GEMINI_API_KEY` 만 설정하면 됨. (`AI_PROVIDER` 생략 시 `gemini`)
   - 모델: 기본 **`gemini-3.1-flash-lite`** (코드 기본값). `GEMINI_MODEL`로 덮어쓸 수 있음.
   - Claude로 교체: `AI_PROVIDER=claude` + `ANTHROPIC_API_KEY` (+ 선택 `CLAUDE_MODEL`)
3. **API 키는 절대 클라이언트에 두지 않습니다.** 모든 호출은 `/api/evaluate` 프록시를 거칩니다.

### 🔑 API 키 보관 규칙 (중요)
- **키를 소스 코드(`index.html`, `functions/*.js`)나 README에 절대 넣지 않습니다.** 깃에 올라가면 노출됩니다.
- **프로덕션:** Cloudflare 대시보드의 환경변수 `GEMINI_API_KEY`에만 저장.
- **로컬 테스트:** 프로젝트 루트의 **`.dev.vars`** 파일에 저장(이미 생성됨). 이 파일은 `.gitignore`에 등록되어 **GitHub로 전송되지 않습니다.**
  ```bash
  npx wrangler pages dev .   # .dev.vars의 키를 읽어 /api/evaluate가 로컬에서 동작
  ```
- 깃 저장소를 만들 때 `.dev.vars`가 추적되지 않는지 반드시 확인: `git status`에 나타나면 안 됩니다.

> 참고: 받은 키가 `AQ.…` 형식이라 표준 AI Studio 키(`AIza…`)와 다릅니다. 만약 인증 오류(401/403)가 나면 [aistudio.google.com](https://aistudio.google.com/apikey)에서 발급한 `AIza…` 키로 교체하세요.

### 개인정보 보호
- 학생 **이름·학교·반·날짜는 AI로 전송하지 않습니다.** 보고서(STEP 6, 클라이언트)에서만 사용합니다.
- AI에는 **익명화된 측정 요약 + 답변 텍스트**만 전송됩니다
  (`{ dataSummary, predictions, observeAnswers, explainAnswers }`).

## 교사 설정 (STEP 3 하단 "⚙️ 교사 설정")

| 항목 | 기본값 | 의미 |
|---|---|---|
| 측정 주기 | 2초 | 샘플링 간격(0.5~5초) |
| 자동 시작 온도 | 55 ℃ | 이 온도 이하 + 하강 추세면 자동 기록 시작 |
| 자동 종료 온도 | 33 ℃ | 이 온도 이하면 자동 기록 종료 |
| 응고점 참고 | 43 ℃ | 그래프 참고선·평가 기준 |

코드 상단 `CFG` 객체에서도 동일하게 조정할 수 있습니다(`app.js`).
