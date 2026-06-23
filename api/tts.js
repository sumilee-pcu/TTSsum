const openaiVoices = ["marin", "cedar", "coral", "nova", "shimmer", "sage", "verse", "alloy", "ash", "ballad", "echo", "fable", "onyx"];
const geminiVoices = ["Kore", "Puck", "Zephyr", "Charon", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "지원하지 않는 요청입니다." });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const provider = ["openai", "gemini"].includes(body.provider) ? body.provider : "openai";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const style = typeof body.style === "string" ? body.style.trim() : "";
    const fileName = `tts-${new Date().toISOString().replace(/[:.]/g, "-")}.${provider === "openai" ? "mp3" : "wav"}`;

    if (!text) {
      res.status(400).json({ error: "변환할 텍스트를 입력하세요." });
      return;
    }

    if (provider === "openai") {
      const voice = openaiVoices.includes(body.voice) ? body.voice : "marin";
      const speed = clampFloat(Number(body.speed || 1), 0.25, 4);
      const audio = await createOpenAiSpeech({ text, voice, style, speed });
      const upload = await uploadToSupabase({ fileName, contentType: "audio/mpeg", audio });
      res.status(200).json({
        fileName,
        url: upload.url,
        dataUrl: upload.url ? undefined : `data:audio/mpeg;base64,${Buffer.from(audio).toString("base64")}`,
        provider,
        voice,
        speed,
        size: audio.byteLength
      });
      return;
    }

    const voice = geminiVoices.includes(body.voice) ? body.voice : "Kore";
    const wav = await createGeminiWav({ text, voice, style });
    const upload = await uploadToSupabase({ fileName, contentType: "audio/wav", audio: wav });
    res.status(200).json({
      fileName,
      url: upload.url,
      dataUrl: upload.url ? undefined : `data:audio/wav;base64,${Buffer.from(wav).toString("base64")}`,
      provider,
      voice,
      model: process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview",
      size: wav.byteLength
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "음성 파일을 만들지 못했습니다." });
  }
}

async function createOpenAiSpeech({ text, voice, style, speed }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY가 필요합니다.");
  }

  if (text.length > 4096) {
    throw new Error("OpenAI 음성은 한 번에 4,096자까지 변환할 수 있습니다.");
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voice,
      input: text,
      instructions: style || "Speak naturally, warmly, and clearly. Use a conversational Korean narration style.",
      response_format: "mp3",
      speed
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI TTS 실패: ${response.status} ${await response.text()}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function createGeminiWav({ text, voice, style }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY가 필요합니다.");
  }

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
      model: process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview",
      input,
      response_format: { type: "audio" },
      generation_config: {
        speech_config: [{ voice }]
      }
    })
  });

  const data = await response.json().catch(async () => ({ raw: await response.text() }));
  if (!response.ok) {
    throw new Error(`Gemini TTS 실패: ${response.status} ${JSON.stringify(data)}`);
  }

  const audioData = data.output_audio?.data || data.outputAudio?.data;
  if (!audioData) {
    throw new Error("Gemini 응답에 오디오 데이터가 없습니다.");
  }

  return createWavBuffer(Buffer.from(audioData, "base64"));
}

async function uploadToSupabase({ fileName, contentType, audio }) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "tts-outputs";

  if (!supabaseUrl || !serviceKey) {
    return { url: null };
  }

  const path = `public/${fileName}`;
  const uploadUrl = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${bucket}/${path}`;
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "content-type": contentType,
      "x-upsert": "true"
    },
    body: audio
  });

  if (!response.ok) {
    throw new Error(`Supabase 업로드 실패: ${response.status} ${await response.text()}`);
  }

  return {
    url: `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${path}`
  };
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

function clampFloat(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
