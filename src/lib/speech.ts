// Portuguese text normalization + similarity scoring for speaking practice

import { requestTranscription } from "./api";

export function normalizePt(input: string): string {
  let text = input.toLowerCase();
  // strip accents/diacritics: ç -> c, ã -> a, é -> e, ...
  text = text.normalize("NFD").replace(/[̀-ͯ]/g, "");
  // strip punctuation and whitespace
  text = text.replace(/[\s。、！？!?・「」『』（）()….,:;：；'"«»\-—]/g, "");
  return text;
}

export function levenshtein(first: string, second: string): number {
  const firstLength = first.length;
  const secondLength = second.length;
  if (firstLength === 0) return secondLength;
  if (secondLength === 0) return firstLength;
  let previous = Array.from({ length: secondLength + 1 }, (_, index) => index);
  let current = new Array<number>(secondLength + 1).fill(0);
  for (let firstIndex = 1; firstIndex <= firstLength; firstIndex += 1) {
    current[0] = firstIndex;
    for (let secondIndex = 1; secondIndex <= secondLength; secondIndex += 1) {
      current[secondIndex] = Math.min(
        previous[secondIndex] + 1,
        current[secondIndex - 1] + 1,
        previous[secondIndex - 1] +
          (first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1)
      );
    }
    [previous, current] = [current, previous];
  }
  return previous[secondLength];
}

/** 0-100 similarity between what was heard and the target phrase */
export function similarity(target: string, heard: string): number {
  const normalizedTarget = normalizePt(target);
  const normalizedHeard = normalizePt(heard);
  if (!normalizedTarget || !normalizedHeard) return 0;
  const score = (first: string, second: string) =>
    1 - levenshtein(first, second) / Math.max(first.length, second.length, 1);
  return Math.max(0, Math.round(score(normalizedTarget, normalizedHeard) * 100));
}

// ---- minimal Web Speech API plumbing ----

export interface SpeechAlt {
  transcript: string;
  confidence: number;
}

export function getSpeechRecognition():
  | (new () => import("@/types/speech").SpeechRecognitionLike)
  | null {
  const browser = window as unknown as {
    SpeechRecognition?: new () => import("@/types/speech").SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => import("@/types/speech").SpeechRecognitionLike;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null;
}

/** Listen once in European Portuguese; resolves with up to 3 alternatives.
 *  Uses the server transcription proxy (Deepgram Nova), else browser SR. */
export function listenPt(timeoutMilliseconds = 15_000): Promise<SpeechAlt[]> {
  return listenDeepgram(timeoutMilliseconds).catch((error: unknown) => {
    if (error instanceof DeepgramMicError) throw error;
    return listenBrowser(timeoutMilliseconds);
  });
}

/** Marker error: mic-level failures (denied, no device) should NOT fall back */
class DeepgramMicError extends Error {}

/**
 * Server-proxied Deepgram STT with silence detection.
 * Records from the mic, auto-stops ~1.1s after speech ends (feels instant),
 * then POSTs the clip to the transcription proxy (~300ms round trip).
 */
export function listenDeepgram(timeoutMilliseconds = 15_000): Promise<SpeechAlt[]> {
  return new Promise((resolve, reject) => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      reject(new Error("MediaRecorder is not available in this browser. Use Chrome or Edge."));
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const context = new AudioContext();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
        const recorder = new MediaRecorder(stream, { mimeType });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };

        let finished = false;
        let heardSpeech = false;
        let lastLoudAt = performance.now();
        const startedAt = performance.now();
        const samples = new Uint8Array(analyser.frequencyBinCount);

        const cleanup = () => {
          stream.getTracks().forEach((track) => track.stop());
          void context.close().catch(() => undefined);
        };

        recorder.onstop = () => {
          cleanup();
          if (!heardSpeech || chunks.length === 0) {
            resolve([]);
            return;
          }
          const audio = new Blob(chunks, { type: mimeType });
          void requestTranscription(audio, mimeType).then(resolve).catch(reject);
        };

        const finish = () => {
          if (finished) return;
          finished = true;
          if (recorder.state === "recording") recorder.stop();
          else cleanup();
        };

        const poll = () => {
          if (finished) return;
          analyser.getByteTimeDomainData(samples);
          let rootMeanSquare = 0;
          for (const value of samples) {
            const delta = value - 128;
            rootMeanSquare += delta * delta;
          }
          rootMeanSquare = Math.sqrt(rootMeanSquare / samples.length);
          const now = performance.now();
          if (rootMeanSquare > 12) {
            heardSpeech = true;
            lastLoudAt = now;
          }
          const silentFor = now - lastLoudAt;
          const elapsed = now - startedAt;
          if (
            (heardSpeech && silentFor > 1_100) ||
            (!heardSpeech && elapsed > 6_000) ||
            elapsed > timeoutMilliseconds
          ) {
            finish();
            return;
          }
          requestAnimationFrame(poll);
        };

        recorder.onerror = () => {
          finish();
          reject(new Error("Microphone recording failed."));
        };

        recorder.start(250);
        poll();
      })
      .catch(() => {
        reject(
          new DeepgramMicError(
            "Microphone access denied. Allow the mic in your browser and retry."
          )
        );
      });
  });
}

/** Browser SpeechRecognition fallback (Chrome/Edge) */
function listenBrowser(timeoutMilliseconds = 15_000): Promise<SpeechAlt[]> {
  return new Promise((resolve, reject) => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      reject(new Error("Speech recognition is not available in this browser. Use Chrome or Edge."));
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "pt-PT";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    const timer = setTimeout(() => {
      recognition.abort();
      reject(new Error("Timed out waiting for speech — try again and speak right after the beep."));
    }, timeoutMilliseconds);
    recognition.onresult = (event) => {
      clearTimeout(timer);
      const alternatives: SpeechAlt[] = [];
      const result = event.results[0];
      for (let index = 0; index < result.length; index += 1) {
        alternatives.push({
          transcript: result[index].transcript,
          confidence: result[index].confidence,
        });
      }
      resolve(alternatives);
    };
    recognition.onerror = (event) => {
      clearTimeout(timer);
      const code = (event as { error?: string }).error ?? "";
      reject(
        new Error(
          code === "not-allowed"
            ? "Microphone access denied. Allow the mic in your browser and retry."
            : code === "no-speech"
              ? "No speech detected — speak louder or closer to the mic."
              : `Speech recognition error: ${code || "unknown"}`
        )
      );
    };
    recognition.onend = () => clearTimeout(timer);
    recognition.start();
  });
}
