// Pronunciation coaching: turn "what the recognizer heard" into one concrete
// articulation tip, powered by the existing chat provider. No new APIs —
// Deepgram/browser alternatives + confidence carry the uncertainty signal.

import { chatCompletion } from "./llm";
import { normalizePt, similarity, type SpeechAlt } from "./speech";

export type PronVerdict = "great" | "close" | "off" | "unclear";

export interface PronFeedback {
  verdict: PronVerdict;
  /** The single most valuable word to practice, in its correct form. */
  focusWord: string;
  /** What the recognizer heard for that word (may match focusWord). */
  heardAs: string;
  /** One concrete mouth/articulation instruction for an English speaker. */
  tip: string;
  /** Hyphenated syllables, stressed syllable in caps, e.g. "o-bri-GA-du". */
  slowForm: string;
}

/** Classic English-speaker trouble spots in European Portuguese, given to the
 *  assessor so its tips are specific rather than generic. */
const TROUBLE_SPOTS = `
- ão/õe/ãe are NASAL diphthongs: air through the nose, never "ow"/"oy" (pão ≠ "pow", cão ≠ "cow")
- lh = palatal L, tongue flat against the palate (like Italian "gli"), not "lee" (filho, olho, trabalho)
- nh = palatal N (like "canyon"), not "n+h" (vinho, senhora, ninho)
- final -o is reduced to "oo" (obrigado → "o-bri-GA-doo"), final -e nearly disappears
- initial r and rr are guttural/uvular in Portugal, never the English tapped r (rua, carro)
- unstressed e before consonants often becomes "uh" or vanishes (telefone, pequeno)
- ç/ss/s between vowels = soft "s"; single s between vowels = "z" (casa ≠ caça)
- x and final -l are dark/velarized (Brasil, azul, Portugal)
- d/t before "i" or final "-e" stay pure in Portugal — no "jee/chee" palatalization (that is Brazilian)
- ã (estar, manhã) is nasal "uh", not "an"`;

interface AssessorJson {
  verdict?: string;
  focusWord?: string;
  heardAs?: string;
  tip?: string;
  slowForm?: string;
}

/**
 * Assess one spoken utterance. Returns null when the assessor cannot produce
 * usable JSON — callers treat null as "no card", never as an error.
 */
export async function assessPronunciation(
  model: string,
  said: string,
  alternatives: SpeechAlt[]
): Promise<PronFeedback | null> {
  const altLines = alternatives
    .slice(0, 3)
    .map((a, i) => `  ${i + 1}. "${a.transcript}" (confidence ${a.confidence.toFixed(2)})`)
    .join("\n");
  const raw = await chatCompletion(model, [
    {
      role: "system",
      content: `You are a European Portuguese (Portugal) pronunciation assessor for a native English speaker (A1-A2).

A speech recognizer listened to the learner and produced these alternatives:
${altLines || `  1. "${said}"`}

Infer what the learner INTENDED to say, then judge the likely pronunciation quality:
- "great": the top transcript is clean, natural Portuguese and high confidence — no card needed
- "close": one word was probably mispronounced (recognizer hesitated, or heard a near-miss)
- "off": the transcript suggests a clear mispronunciation worth correcting now
- "unclear": too noisy or ambiguous to judge

When verdict is "close" or "off", pick the SINGLE most valuable word to practice and give ONE concrete articulation tip for an English speaker (max 20 words, plain English, no IPA). Base tips on these known trouble spots:
${TROUBLE_SPOTS}

Reply with ONLY a JSON object, no markdown:
{"verdict":"great|close|off|unclear","focusWord":"","heardAs":"","tip":"","slowForm":""}
- focusWord: correct Portuguese spelling of the word to practice ("" when great/unclear)
- heardAs: what the recognizer heard for that word
- slowForm: focusWord hyphenated by syllable with the stressed syllable in CAPS, e.g. "o-bri-GA-du"`,
    },
    { role: "user", content: said },
  ]);

  const match = raw.replace(/```(?:json)?/g, "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as AssessorJson;
    const verdict = (["great", "close", "off", "unclear"] as const).find(
      (v) => v === parsed.verdict
    );
    if (!verdict) return null;
    return {
      verdict,
      focusWord: (parsed.focusWord ?? "").trim(),
      heardAs: (parsed.heardAs ?? "").trim(),
      tip: (parsed.tip ?? "").trim(),
      slowForm: (parsed.slowForm ?? "").trim(),
    };
  } catch {
    return null;
  }
}

/** 0-100 score for a retry attempt against the focus word or full target. */
export function retryScore(target: string, heard: string): number {
  return similarity(target, heard);
}

/** True when a retry is close enough to celebrate. */
export function retryPassed(score: number): boolean {
  return score >= 80;
}

/** Slow spoken model of a word. Uses the browser voice at reduced rate so the
 *  pacing cue survives; the natural server voice stays on the normal replay. */
export function speakSlowly(text: string, onend?: () => void): void {
  const synth = window.speechSynthesis;
  if (!synth) {
    onend?.();
    return;
  }
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "pt-PT";
  const voices = synth.getVoices().filter((v) => v.lang.startsWith("pt"));
  if (voices.length) {
    utterance.voice = voices.find((v) => v.lang.startsWith("pt-PT")) ?? voices[0];
  }
  utterance.rate = 0.6;
  if (onend) utterance.onend = onend;
  synth.speak(utterance);
}

/** Whole-utterance normalized equality check used by the quick great-path. */
export function transcriptsAgree(first: string, second: string): boolean {
  return normalizePt(first) === normalizePt(second);
}
