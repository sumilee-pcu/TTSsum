import { createServer } from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT || 3107);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = resolve(process.cwd());
const PUBLIC_DIR = join(ROOT, "public");
const OUTPUT_DIR = join(ROOT, "outputs");
const TMP_DIR = join(ROOT, ".tmp");
const LOCAL_CLONE_PYTHON = join(ROOT, ".venv-mlx-tts", "bin", "python");
const LOCAL_CLONE_REFERENCE = join(ROOT, "local-voice", "reference", "sumilee_latest.wav");
const LOCAL_CLONE_MODEL = process.env.LOCAL_CLONE_MODEL || "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit";
const LOCAL_CLONE_REF_TEXT = "1회차 화요일에 김남희 선생님 강의를 대부분 들으셨을 텐데요. 이번 연수도 강의형이 아니라 같이 해보는 실습과 그리고 또 이제 어느 절차로 진행이 되는지 그 부분 안내를 집중적으로 해 드리도록 하겠습니다.";
let openAiTtsModel = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
let geminiTtsModel = process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";
const OPENAI_VOICES = [
  { name: "marin", locale: "natural", sample: "자연스럽고 안정적인 음성" },
  { name: "cedar", locale: "natural", sample: "깊고 차분한 음성" },
  { name: "coral", locale: "natural", sample: "밝고 선명한 음성" },
  { name: "nova", locale: "natural", sample: "부드럽고 명료한 음성" },
  { name: "shimmer", locale: "natural", sample: "따뜻하고 가벼운 음성" },
  { name: "sage", locale: "natural", sample: "차분하고 균형 잡힌 음성" },
  { name: "verse", locale: "natural", sample: "표현력 있는 음성" },
  { name: "alloy", locale: "natural", sample: "중립적인 음성" },
  { name: "ash", locale: "natural", sample: "낮고 안정적인 음성" },
  { name: "ballad", locale: "natural", sample: "부드러운 낭독 음성" },
  { name: "echo", locale: "natural", sample: "또렷한 음성" },
  { name: "fable", locale: "natural", sample: "스토리텔링에 맞는 음성" },
  { name: "onyx", locale: "natural", sample: "묵직한 음성" }
];
const GEMINI_VOICES = [
  { name: "Kore", locale: "natural", sample: "Firm" },
  { name: "Puck", locale: "natural", sample: "Upbeat" },
  { name: "Zephyr", locale: "natural", sample: "Bright" },
  { name: "Charon", locale: "natural", sample: "Informative" },
  { name: "Fenrir", locale: "natural", sample: "Excitable" },
  { name: "Leda", locale: "natural", sample: "Youthful" },
  { name: "Orus", locale: "natural", sample: "Firm" },
  { name: "Aoede", locale: "natural", sample: "Breezy" },
  { name: "Callirrhoe", locale: "natural", sample: "Easy-going" },
  { name: "Autonoe", locale: "natural", sample: "Bright" },
  { name: "Enceladus", locale: "natural", sample: "Breathy" },
  { name: "Iapetus", locale: "natural", sample: "Clear" },
  { name: "Umbriel", locale: "natural", sample: "Easy-going" },
  { name: "Algieba", locale: "natural", sample: "Smooth" },
  { name: "Despina", locale: "natural", sample: "Smooth" },
  { name: "Erinome", locale: "natural", sample: "Clear" },
  { name: "Algenib", locale: "natural", sample: "Gravelly" },
  { name: "Rasalgethi", locale: "natural", sample: "Informative" },
  { name: "Laomedeia", locale: "natural", sample: "Upbeat" },
  { name: "Achernar", locale: "natural", sample: "Soft" },
  { name: "Alnilam", locale: "natural", sample: "Firm" },
  { name: "Schedar", locale: "natural", sample: "Even" },
  { name: "Gacrux", locale: "natural", sample: "Mature" },
  { name: "Pulcherrima", locale: "natural", sample: "Forward" },
  { name: "Achird", locale: "natural", sample: "Friendly" },
  { name: "Zubenelgenubi", locale: "natural", sample: "Casual" },
  { name: "Vindemiatrix", locale: "natural", sample: "Gentle" },
  { name: "Sadachbia", locale: "natural", sample: "Lively" },
  { name: "Sadaltager", locale: "natural", sample: "Knowledgeable" },
  { name: "Sulafat", locale: "natural", sample: "Warm" }
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".ico": "image/x-icon"
};

async function main() {
  await loadEnv();
  openAiTtsModel = process.env.OPENAI_TTS_MODEL || openAiTtsModel;
  geminiTtsModel = process.env.GEMINI_TTS_MODEL || geminiTtsModel;
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(TMP_DIR, { recursive: true });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);

      if (req.method === "GET" && url.pathname === "/api/voices") {
        return json(res, 200, {
          openai: {
            enabled: Boolean(process.env.OPENAI_API_KEY),
            model: openAiTtsModel,
            voices: OPENAI_VOICES
          },
          gemini: {
            enabled: Boolean(process.env.GEMINI_API_KEY),
            model: geminiTtsModel,
            voices: GEMINI_VOICES
          },
          local: {
            enabled: true,
            voices: await getVoices()
          },
          clone: {
            enabled: await localCloneReady(),
            model: LOCAL_CLONE_MODEL,
            voices: [
              { name: "sumilee-latest", locale: "ko-KR", sample: "최신 강의에서 추출한 이수미 교수 음성" }
            ]
          }
        });
      }

      if (req.method === "POST" && url.pathname === "/api/tts") {
        return handleTts(req, res);
      }

      if (req.method === "GET" && url.pathname.startsWith("/outputs/")) {
        return serveFile(res, OUTPUT_DIR, url.pathname.replace("/outputs/", ""));
      }

      if (req.method === "GET") {
        const fileName = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        return serveFile(res, PUBLIC_DIR, fileName);
      }

      json(res, 405, { error: "지원하지 않는 요청입니다." });
    } catch (error) {
      console.error(error);
      json(res, 500, { error: "서버에서 처리 중 오류가 발생했습니다." });
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`TTS MP3 app: http://${HOST}:${PORT}`);
  });
}

async function handleTts(req, res) {
  const body = await readJson(req);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const voice = typeof body.voice === "string" ? body.voice.trim() : "";
  const provider = ["openai", "gemini", "local", "clone"].includes(body.provider) ? body.provider : "openai";
  const style = typeof body.style === "string" ? body.style.trim() : "";
  const speed = clampFloat(Number(body.speed || 1), 0.25, 4);
  const rate = clamp(Number(body.rate || 180), 80, 320);

  if (text.length < 1) {
    return json(res, 400, { error: "변환할 텍스트를 입력하세요." });
  }

  if (provider === "openai" && !process.env.OPENAI_API_KEY) {
    return json(res, 400, { error: "고품질 음성을 쓰려면 OPENAI_API_KEY가 필요합니다. .env 파일에 키를 넣고 서버를 다시 시작하세요." });
  }

  if (provider === "gemini" && !process.env.GEMINI_API_KEY) {
    return json(res, 400, { error: "Gemini 음성을 쓰려면 GEMINI_API_KEY가 필요합니다. .env 파일에 키를 넣고 서버를 다시 시작하세요." });
  }

  if (provider === "clone" && !(await localCloneReady())) {
    return json(res, 500, { error: "로컬 복제 음성 환경이나 참조 음성을 찾지 못했습니다." });
  }

  if (text.length > 4096 && provider === "openai") {
    return json(res, 400, { error: "고품질 음성은 한 번에 4,096자까지 변환할 수 있습니다." });
  }

  if (text.length > 24000 && provider === "gemini") {
    return json(res, 400, { error: "Gemini 음성은 긴 원고 품질 유지를 위해 한 번에 24,000자 이하로 나눠 변환하세요." });
  }

  if (text.length > 8000 && provider === "local") {
    return json(res, 400, { error: "Mac 기본 음성은 한 번에 8,000자까지 변환할 수 있습니다." });
  }

  if (text.length > 2000 && provider === "clone") {
    return json(res, 400, { error: "내 목소리 로컬 합성은 한 번에 2,000자 이하로 나눠 변환하세요." });
  }

  const id = randomUUID();
  const mp3Name = `tts-${new Date().toISOString().replace(/[:.]/g, "-")}.mp3`;
  const mp3Path = join(OUTPUT_DIR, mp3Name);

  if (provider === "openai") {
    const selectedVoice = OPENAI_VOICES.some((item) => item.name === voice) ? voice : "marin";
    try {
      await createOpenAiSpeech({ text, voice: selectedVoice, style, speed, mp3Path });
      const stat = await fs.stat(mp3Path);
      return json(res, 200, {
        fileName: mp3Name,
        url: `/outputs/${mp3Name}`,
        provider,
        voice: selectedVoice,
        speed,
        size: stat.size
      });
    } catch (error) {
      console.error(error);
      return json(res, 500, { error: "고품질 음성 파일을 만들지 못했습니다. API 키, 결제 상태, 네트워크를 확인하세요." });
    }
  }

  if (provider === "gemini") {
    const selectedVoice = GEMINI_VOICES.some((item) => item.name === voice) ? voice : "Kore";
    const wavPath = join(TMP_DIR, `${id}.wav`);
    try {
      await createGeminiSpeech({ text, voice: selectedVoice, style, wavPath });
      await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", wavPath, "-codec:a", "libmp3lame", "-q:a", "3", mp3Path]);
      const stat = await fs.stat(mp3Path);
      return json(res, 200, {
        fileName: mp3Name,
        url: `/outputs/${mp3Name}`,
        provider,
        voice: selectedVoice,
        model: geminiTtsModel,
        size: stat.size
      });
    } catch (error) {
      console.error(error);
      return json(res, 500, { error: "Gemini 음성 파일을 만들지 못했습니다. API 키, 지역/결제 상태, 네트워크를 확인하세요." });
    } finally {
      await Promise.allSettled([fs.rm(wavPath, { force: true })]);
    }
  }

  if (provider === "clone") {
    const wavPrefix = `clone-${id}`;
    const wavPath = join(TMP_DIR, `${wavPrefix}_000.wav`);
    try {
      await run(LOCAL_CLONE_PYTHON, [
        "-m", "mlx_audio.tts.generate",
        "--model", LOCAL_CLONE_MODEL,
        "--text", text,
        "--lang_code", "Korean",
        "--ref_audio", LOCAL_CLONE_REFERENCE,
        "--ref_text", LOCAL_CLONE_REF_TEXT,
        "--speed", String(speed),
        "--output_path", TMP_DIR,
        "--file_prefix", wavPrefix,
        "--audio_format", "wav"
      ]);
      await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", wavPath, "-codec:a", "libmp3lame", "-q:a", "2", mp3Path]);
      const stat = await fs.stat(mp3Path);
      return json(res, 200, {
        fileName: mp3Name,
        url: `/outputs/${mp3Name}`,
        provider,
        voice: "sumilee-latest",
        model: LOCAL_CLONE_MODEL,
        speed,
        size: stat.size
      });
    } catch (error) {
      console.error(error);
      return json(res, 500, { error: "내 목소리 로컬 음성을 만들지 못했습니다. 서버 로그에서 MLX/Metal 상태를 확인하세요." });
    } finally {
      await Promise.allSettled([fs.rm(wavPath, { force: true })]);
    }
  }

  const voices = await getVoices();
  const selectedVoice = voices.some((item) => item.name === voice) ? voice : defaultVoice(voices);
  const txtPath = join(TMP_DIR, `${id}.txt`);
  const aiffPath = join(TMP_DIR, `${id}.aiff`);

  try {
    await fs.writeFile(txtPath, text, "utf8");
    await run("say", ["-v", selectedVoice, "-r", String(rate), "-f", txtPath, "-o", aiffPath]);
    await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", aiffPath, "-codec:a", "libmp3lame", "-q:a", "3", mp3Path]);
    const stat = await fs.stat(mp3Path);
    json(res, 200, {
      fileName: mp3Name,
      url: `/outputs/${mp3Name}`,
      provider,
      voice: selectedVoice,
      rate,
      size: stat.size
    });
  } catch (error) {
    console.error(error);
    json(res, 500, { error: "음성 파일을 만들지 못했습니다. macOS say 또는 ffmpeg 상태를 확인하세요." });
  } finally {
    await Promise.allSettled([fs.rm(txtPath, { force: true }), fs.rm(aiffPath, { force: true })]);
  }
}

async function createOpenAiSpeech({ text, voice, style, speed, mp3Path }) {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: openAiTtsModel,
      voice,
      input: text,
      instructions: style || "Speak naturally, warmly, and clearly. Use a conversational Korean narration style.",
      response_format: "mp3",
      speed
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI speech failed: ${response.status} ${detail}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(mp3Path, buffer);
}

async function createGeminiSpeech({ text, voice, style, wavPath }) {
  const input = [
    "Synthesize speech from the transcript below. Do not speak these instructions aloud.",
    style ? `Director's notes: ${style}` : "Director's notes: Natural Korean narration, warm and clear, with steady pacing.",
    "Transcript:",
    text
  ].join("\n\n");

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY,
      "content-type": "application/json",
      "api-revision": "2026-05-20"
    },
    body: JSON.stringify({
      model: geminiTtsModel,
      input,
      response_format: { type: "audio" },
      generation_config: {
        speech_config: [{ voice }]
      }
    })
  });

  const data = await response.json().catch(async () => ({ raw: await response.text() }));
  if (!response.ok) {
    throw new Error(`Gemini speech failed: ${response.status} ${JSON.stringify(data)}`);
  }

  const audioData = data.output_audio?.data || data.outputAudio?.data;
  if (!audioData) {
    throw new Error(`Gemini speech response did not include output_audio.data: ${JSON.stringify(data).slice(0, 1000)}`);
  }

  const pcm = Buffer.from(audioData, "base64");
  await fs.writeFile(wavPath, createWavBuffer(pcm));
}

function createWavBuffer(pcm, channels = 1, sampleRate = 24000, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function loadEnv() {
  const envPath = join(ROOT, ".env");
  try {
    const env = await fs.readFile(envPath, "utf8");
    for (const line of env.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

let voiceCache = null;
async function localCloneReady() {
  try {
    await Promise.all([fs.access(LOCAL_CLONE_PYTHON), fs.access(LOCAL_CLONE_REFERENCE)]);
    return true;
  } catch {
    return false;
  }
}

async function getVoices() {
  if (voiceCache) return voiceCache;
  const output = await run("say", ["-v", "?"]);
  voiceCache = output.stdout
    .split("\n")
    .map((line) => {
      const match = line.match(/^(.+?)\s{2,}([a-zA-Z_-]+)\s+#\s*(.*)$/);
      if (!match) return null;
      return {
        name: match[1].trim(),
        locale: match[2].trim(),
        sample: match[3].trim()
      };
    })
    .filter(Boolean)
    .sort((a, b) => scoreVoice(b) - scoreVoice(a) || a.name.localeCompare(b.name));
  return voiceCache;
}

function scoreVoice(voice) {
  if (voice.locale.startsWith("ko")) return 4;
  if (voice.locale.startsWith("en")) return 3;
  if (voice.locale.startsWith("ja") || voice.locale.startsWith("zh")) return 2;
  return 1;
}

function defaultVoice(voices) {
  return voices.find((voice) => voice.locale.startsWith("ko"))?.name || voices[0]?.name || "Yuna";
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampFloat(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function readJson(req) {
  return new Promise((resolveJson, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 10000) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      try {
        resolveJson(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: ROOT });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with ${code}: ${stderr}`));
      }
    });
  });
}

async function serveFile(res, baseDir, requestedFile) {
  const safePath = normalize(requestedFile).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = resolve(baseDir, safePath);
  if (!filePath.startsWith(resolve(baseDir))) {
    return json(res, 403, { error: "잘못된 파일 경로입니다." });
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error("Not a file");
    res.writeHead(200, {
      "content-type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
      "content-length": stat.size
    });
    createReadStream(filePath).pipe(res);
  } catch {
    json(res, 404, { error: "파일을 찾을 수 없습니다." });
  }
}

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
