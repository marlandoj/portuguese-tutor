// "Resumo da sessão" — post-conversation reports.
// One LLM call over the transcript produces a structured debrief;
// reports persist in localStorage and surface on the Journey page.

import { chatCompletion } from "./llm";

export interface ReportCorrection {
  said: string;
  better: string;
  why: string;
}

export interface ReportVocab {
  pt: string;
  en: string;
}

export interface SessionReport {
  id: string;
  createdAt: number;
  scenario: string;
  messageCount: number;
  highlights: string[];
  corrections: ReportCorrection[];
  vocab: ReportVocab[];
  focus: string;
}

interface ReportJson {
  highlights?: unknown;
  corrections?: unknown;
  vocab?: unknown;
  focus?: unknown;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function parseReport(raw: string, scenario: string, messageCount: number): SessionReport | null {
  const match = raw.replace(/```(?:json)?/g, "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as ReportJson;
    const corrections = Array.isArray(parsed.corrections)
      ? parsed.corrections
          .map((c): ReportCorrection | null => {
            if (typeof c !== "object" || c === null) return null;
            const o = c as Record<string, unknown>;
            if (typeof o.said !== "string" || typeof o.better !== "string") return null;
            return { said: o.said, better: o.better, why: typeof o.why === "string" ? o.why : "" };
          })
          .filter((c): c is ReportCorrection => c !== null)
      : [];
    const vocab = Array.isArray(parsed.vocab)
      ? parsed.vocab
          .map((v): ReportVocab | null => {
            if (typeof v !== "object" || v === null) return null;
            const o = v as Record<string, unknown>;
            if (typeof o.pt !== "string" || typeof o.en !== "string") return null;
            return { pt: o.pt, en: o.en };
          })
          .filter((v): v is ReportVocab => v !== null)
      : [];
    return {
      id: `r-${Date.now().toString(36)}`,
      createdAt: Date.now(),
      scenario,
      messageCount,
      highlights: asStringArray(parsed.highlights).slice(0, 4),
      corrections: corrections.slice(0, 8),
      vocab: vocab.slice(0, 10),
      focus: typeof parsed.focus === "string" ? parsed.focus : "",
    };
  } catch {
    return null;
  }
}

/**
 * Generate a session debrief from the transcript. Returns null when the
 * model cannot produce usable JSON — callers treat null as "no report".
 */
export async function generateSessionReport(
  model: string,
  transcript: { role: "user" | "assistant"; content: string }[],
  scenario: string
): Promise<SessionReport | null> {
  const userTurns = transcript.filter((m) => m.role === "user").length;
  if (userTurns < 2) return null;
  const dialogue = transcript
    .slice(-40)
    .map((m) => `${m.role === "user" ? "Learner" : "Ana"}: ${m.content}`)
    .join("\n");
  const raw = await chatCompletion(model, [
    {
      role: "system",
      content: `You are a European Portuguese (Portugal) tutor writing an end-of-session debrief for a native English speaker (A1-A2).

Here is the conversation transcript:
${dialogue}

Write an honest, specific debrief. Rules:
- highlights: 2-3 things the learner genuinely did well — quote their words; no empty flattery
- corrections: EVERY grammar/vocabulary mistake the learner made (not just ones Ana corrected mid-chat) — said = their words, better = natural PT-PT, why = the rule in <= 12 words of plain English
- vocab: useful Portuguese words/phrases from the conversation the learner should keep (pt = European Portuguese, en = English gloss)
- focus: ONE concrete suggestion for the next session (a scenario, structure, or sound to practice)

Reply with ONLY a JSON object, no markdown:
{"highlights":["..."],"corrections":[{"said":"...","better":"...","why":"..."}],"vocab":[{"pt":"...","en":"..."}],"focus":"..."}`,
    },
    { role: "user", content: "Write my session debrief." },
  ]);
  return parseReport(raw, scenario, transcript.length);
}

// ---- persistence ----

const KEY = "pt_session_reports_v1";
const MAX_REPORTS = 20;

export function getReports(): SessionReport[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SessionReport[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveReport(report: SessionReport): SessionReport[] {
  const list = [report, ...getReports()].slice(0, MAX_REPORTS);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — the report still displays this session */
  }
  return list;
}

export function deleteReport(id: string): SessionReport[] {
  const list = getReports().filter((r) => r.id !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return list;
}
