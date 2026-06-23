const openaiVoices = [
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

const geminiVoices = [
  "Kore",
  "Puck",
  "Zephyr",
  "Charon",
  "Fenrir",
  "Leda",
  "Orus",
  "Aoede",
  "Callirrhoe",
  "Autonoe",
  "Enceladus",
  "Iapetus",
  "Umbriel",
  "Algieba",
  "Despina",
  "Erinome",
  "Algenib",
  "Rasalgethi",
  "Laomedeia",
  "Achernar",
  "Alnilam",
  "Schedar",
  "Gacrux",
  "Pulcherrima",
  "Achird",
  "Zubenelgenubi",
  "Vindemiatrix",
  "Sadachbia",
  "Sadaltager",
  "Sulafat"
].map((name) => ({ name, locale: "natural", sample: "Gemini voice" }));

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "지원하지 않는 요청입니다." });
    return;
  }

  res.status(200).json({
    openai: {
      enabled: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voices: openaiVoices
    },
    gemini: {
      enabled: Boolean(process.env.GEMINI_API_KEY),
      model: process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview",
      voices: geminiVoices
    },
    local: {
      enabled: false,
      voices: []
    }
  });
}
