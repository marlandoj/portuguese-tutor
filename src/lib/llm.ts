import { requestChat, requestSpeech, type ChatMessage } from "./api";

export type ChatMsg = ChatMessage;

export async function chatCompletion(model: string, messages: ChatMsg[]): Promise<string> {
  return await requestChat(model, messages);
}

/** One-line English translation of a Portuguese utterance (used to add silent
 *  written support lines under Ana's live-call transcripts). */
export async function translateToEnglish(model: string, ptText: string): Promise<string> {
  const res = await chatCompletion(model, [
    {
      role: "system",
      content:
        "You are a concise translator. Translate the European Portuguese text to natural English. Reply with ONLY the English translation — no quotes, no explanation.",
    },
    { role: "user", content: ptText },
  ]);
  return res.trim();
}

let currentAudio: HTMLAudioElement | null = null;
let speechGeneration = 0;

/** Stop whatever is currently speaking (browser synth or server audio). */
export function stopSpeaking(): void {
  speechGeneration += 1;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    // Ignore unavailable browser speech synthesis.
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

/** European Portuguese speech output.
 *  Uses the server-proxied natural voice when available, else the browser's
 *  built-in pt-PT voice. Always safe to call. */
export function speakPt(text: string, onend?: () => void): void {
  stopSpeaking();
  const generation = speechGeneration;
  // strip english support lines for cleaner speech
  const spoken = text.split("\n")[0].trim();
  if (!spoken) {
    onend?.();
    return;
  }
  void speakServer(spoken, generation, onend);
}

function speakBrowser(text: string, generation: number, onend?: () => void): void {
  if (generation !== speechGeneration) return;
  const synth = window.speechSynthesis;
  if (!synth) {
    onend?.();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "pt-PT";
  const voices = synth.getVoices().filter((voice) => voice.lang.startsWith("pt"));
  if (voices.length) {
    utterance.voice = voices.find((voice) => voice.lang.startsWith("pt-PT")) ?? voices[0];
  }
  utterance.rate = 0.95;
  if (onend) utterance.onend = onend;
  synth.speak(utterance);
}

async function speakServer(text: string, generation: number, onend?: () => void): Promise<void> {
  try {
    const blob = await requestSpeech(text);
    if (generation !== speechGeneration) return;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    const finish = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      onend?.();
    };
    audio.onended = finish;
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      speakBrowser(text, generation, onend);
    };
    await audio.play();
  } catch {
    speakBrowser(text, generation, onend);
  }
}
