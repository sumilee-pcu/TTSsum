const form = document.querySelector("#ttsForm");
const textInput = document.querySelector("#textInput");
const providerSelect = document.querySelector("#providerSelect");
const voiceSelect = document.querySelector("#voiceSelect");
const voiceStatus = document.querySelector("#voiceStatus");
const speedField = document.querySelector("#speedField");
const speedInput = document.querySelector("#speedInput");
const speedValue = document.querySelector("#speedValue");
const rateInput = document.querySelector("#rateInput");
const rateField = document.querySelector("#rateField");
const rateValue = document.querySelector("#rateValue");
const styleField = document.querySelector("#styleField");
const styleInput = document.querySelector("#styleInput");
const charCount = document.querySelector("#charCount");
const charLimit = document.querySelector("#charLimit");
const submitButton = document.querySelector("#submitButton");
const resultPanel = document.querySelector("#resultPanel");
const resultMeta = document.querySelector("#resultMeta");
const audioPlayer = document.querySelector("#audioPlayer");
const downloadLink = document.querySelector("#downloadLink");
let voiceData = null;

updateCounts();
loadVoices();

textInput.addEventListener("input", updateCounts);
providerSelect.addEventListener("change", renderVoices);
speedInput.addEventListener("input", () => {
  speedValue.textContent = `${Number(speedInput.value).toFixed(2).replace(/0$/, "")}x`;
});
rateInput.addEventListener("input", () => {
  rateValue.textContent = rateInput.value;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = textInput.value.trim();

  if (!text) {
    setStatus("텍스트를 입력하세요", true);
    textInput.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "만드는 중...";
  setStatus("MP3 생성 중", false);
  resultPanel.hidden = true;

  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: providerSelect.value,
        text,
        voice: voiceSelect.value,
        style: styleInput.value.trim(),
        speed: Number(speedInput.value),
        rate: Number(rateInput.value)
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "변환에 실패했습니다.");

    const audioUrl = data.url || data.dataUrl;
    audioPlayer.src = audioUrl;
    downloadLink.href = audioUrl;
    downloadLink.download = data.fileName;
    const speedText = data.provider === "openai" ? `${data.speed}x` : data.provider === "gemini" ? data.model : `${data.rate} wpm`;
    resultMeta.textContent = `${data.voice} · ${speedText} · ${formatBytes(data.size)}`;
    resultPanel.hidden = false;
    setStatus("완료", false);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "MP3 만들기";
  }
});

async function loadVoices() {
  try {
    const response = await fetch("/api/voices");
    voiceData = await response.json();
    if (!response.ok) throw new Error(voiceData.error || "음성 목록을 불러오지 못했습니다.");

    renderVoices();
  } catch (error) {
    setStatus(error.message, true);
  }
}

function renderVoices() {
  if (!voiceData) return;
  const isOpenAi = providerSelect.value === "openai";
  const isGemini = providerSelect.value === "gemini";
  const providerData = isOpenAi ? voiceData.openai : isGemini ? voiceData.gemini : voiceData.local;
  const voices = providerData.voices;
  voiceSelect.replaceChildren(
    ...voices.map((voice) => {
      const option = document.createElement("option");
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.sample || voice.locale})`;
      if (isOpenAi && voice.name === "marin") option.selected = true;
      if (isGemini && voice.name === "Kore") option.selected = true;
      if (!isOpenAi && voice.locale.startsWith("ko")) option.selected = true;
      return option;
    })
  );

  speedField.hidden = !isOpenAi;
  styleField.hidden = !isOpenAi && !isGemini;
  rateField.hidden = isOpenAi || isGemini;
  const limit = isOpenAi ? 4096 : isGemini ? 24000 : 8000;
  textInput.maxLength = limit;
  charLimit.textContent = limit.toLocaleString("ko-KR");
  updateCounts();

  if (isOpenAi && !providerData.enabled) {
    setStatus("OPENAI_API_KEY 필요", true);
  } else if (isGemini && !providerData.enabled) {
    setStatus("GEMINI_API_KEY 필요", true);
  } else {
    setStatus(isOpenAi || isGemini ? `${providerData.model}` : `${voices.length}개 Mac 음성`, false);
  }
}

function updateCounts() {
  charCount.textContent = textInput.value.length.toLocaleString("ko-KR");
}

function setStatus(message, isError) {
  voiceStatus.textContent = message;
  voiceStatus.style.background = isError ? "#fdecec" : "";
  voiceStatus.style.color = isError ? "#9b1c1c" : "";
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
