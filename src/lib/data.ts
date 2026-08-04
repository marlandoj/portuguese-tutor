import lessonsJson from "@/data/lessons.json";
import vocabJson from "@/data/vocab.json";
import audioJson from "@/data/audio.json";
import soundsJson from "@/data/sounds.json";
import verbsJson from "@/data/verbs.json";
import methodJson from "@/data/method.json";
import cuesJson from "@/data/cues.json";
import missionsJson from "@/data/missions.json";
import videosJson from "@/data/videos.json";
import type {
  Lesson,
  MethodSection,
  SoundSection,
  VerbItem,
  VocabCard,
} from "@/types";

export const lessons = lessonsJson as Lesson[];
export const vocab = vocabJson as VocabCard[];
export const audioMap = audioJson as Record<string, string>;
export const sounds = soundsJson as { sections: SoundSection[] };
export const verbs = verbsJson as VerbItem[];
export const method = methodJson as {
  philosophy: MethodSection[];
  trainingSteps: MethodSection[];
  mindset: MethodSection[];
};

export const lessonById = new Map(lessons.map((l) => [l.id, l]));

export interface Cue {
  i: number; // entry index within the lesson
  s: number; // start seconds
  e: number; // end seconds
}
export const cues = cuesJson as Record<string, Cue[]>;

export function getCue(lessonId: string, entryIndex: number): Cue | null {
  const list = cues[lessonId];
  if (!list) return null;
  return list.find((c) => c.i === entryIndex) ?? null;
}

export function lessonHasCues(lessonId: string): boolean {
  return Array.isArray(cues[lessonId]) && cues[lessonId].length > 0;
}

export interface Mission {
  id: string;
  level: number;
  title: string;
  detail: string;
  xp: number;
}
export const missions = missionsJson as Mission[];
export const videos = videosJson as Record<string, string>;

export function audioUrl(lessonId: string): string | null {
  const p = audioMap[lessonId];
  return p ? `${import.meta.env.BASE_URL}${p}` : null;
}

export function levelLabel(level: number): string {
  return ["", "Level 1 — Sobrevivência", "Level 2 — Vida Diária", "Level 3 — Conexões"][level] ?? `Level ${level}`;
}

export function levelDescription(level: number): string {
  return [
    "",
    "Survival-travel speaking for Portugal: restaurants, taxis, hotels, the mercado, the beach and small talk.",
    "Daily-life independence: phone calls, doctor and pharmacy visits, work talk, recommendations and casual check-ins.",
    "Deeper connections: casual speech and slang, grelhadas, meeting the family, opinions and storytelling.",
  ][level] ?? "";
}

export function speakerName(speaker: string): "you" | "partner" | "none" {
  if (speaker === "K" || speaker === "YOU") return "you";
  if (speaker) return "partner";
  return "none";
}

export function dayLessons(level: number): Lesson[] {
  return lessons
    .filter((l) => l.level === level && l.kind === "day")
    .sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
}

export function scenarioLessons(level: number): Lesson[] {
  return lessons.filter((l) => l.level === level && l.kind === "scenario");
}
