# TTS MP3 Maker

텍스트를 입력하면 MP3 파일을 만드는 로컬 웹 앱입니다.

- 기본: OpenAI Speech API의 고품질 AI 음성으로 MP3 생성
- 선택: Gemini API TTS Preview로 MP3 생성
- 로컬 복제: Qwen3-TTS + MLX로 최신 강의의 이수미 교수 음성을 복제해 완전 로컬 MP3 생성
- 보조: API 키가 없을 때 테스트용으로 macOS 내장 `say` 음성 사용

## 실행

먼저 `.env` 파일을 만들고 API 키를 넣습니다.

```bash
cp .env.example .env
```

`.env` 안의 `OPENAI_API_KEY` 또는 `GEMINI_API_KEY` 값을 본인 키로 바꾼 뒤 실행합니다.

```bash
npm start
```

브라우저에서 `http://127.0.0.1:3107`을 엽니다.

### 내 목소리 로컬 합성

로컬 복제 엔진은 Apple Silicon Mac에서 동작합니다. 참조 음성은
`local-voice/reference/sumilee_latest.wav`, 전용 환경은 `.venv-mlx-tts`를 사용합니다.
최초 실행 시 `mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit` 모델을 내려받고,
이후에는 Hugging Face 로컬 캐시를 재사용합니다. 웹 화면에서
`내 목소리 · 완전 로컬`을 선택하면 API 키나 외부 TTS 호출 없이 MP3를 생성합니다.
참조 WAV는 개인 음성 자료이므로 Git에 포함되지 않습니다.

## Vercel 배포

이 앱은 Vercel 서버리스 함수에서도 동작합니다.

필수 환경 변수:

```bash
OPENAI_API_KEY=...
OPENAI_TTS_MODEL=gpt-4o-mini-tts
```

선택 환경 변수:

```bash
GEMINI_API_KEY=...
GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=tts-outputs
LOCAL_TTS_API_URL=https://tts-api.example.com
CF_ACCESS_CLIENT_ID=...
CF_ACCESS_CLIENT_SECRET=...
```

`LOCAL_TTS_API_URL`이 설정되면 Vercel API가 Cloudflare Tunnel 뒤의 M5 Max로
음성 복제 요청을 전달합니다. Cloudflare Access Service Token은 Vercel 환경변수에만
저장하고 브라우저 코드나 GitHub 저장소에는 넣지 않습니다. 이 값이 없으면 Vercel
화면에서 로컬 복제 엔진은 숨겨지고 OpenAI/Gemini 엔진만 표시됩니다.

Supabase 환경 변수를 넣으면 생성 파일을 Storage에 저장하고 공개 URL을 반환합니다. Supabase를 설정하지 않으면 Vercel 함수가 오디오를 base64 data URL로 반환해 브라우저에서 바로 재생/다운로드합니다.

## 요구 사항

- OpenAI API 키
- Gemini API 키: Gemini TTS 사용 시 필요
- Node.js 18 이상
- macOS `say`, `ffmpeg`: Mac 기본 음성 fallback 사용 시 필요

OpenAI Speech API는 기본적으로 MP3를 출력하며, 이 앱은 `gpt-4o-mini-tts`와 `marin` 음성을 기본값으로 사용합니다.
Gemini TTS는 24kHz PCM 오디오를 반환하므로 서버리스 배포에서는 WAV 파일로 반환합니다. 로컬 Node 서버에서는 `ffmpeg`가 있으면 MP3로 변환합니다. 현재 Gemini TTS는 Preview 기능입니다.

생성된 MP3는 `outputs/` 폴더에 저장됩니다.
