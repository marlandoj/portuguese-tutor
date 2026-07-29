export interface LessonEntry {
  speaker: string;
  jp: string;
  romaji: string;
  en: string;
  flags: string[];
}

export interface Lesson {
  id: string;
  level: number;
  kind: "day" | "scenario";
  day: number | null;
  title: string;
  sourceFile: string;
  entries: LessonEntry[];
  notes: string[];
}

export interface VocabCard {
  id: string;
  level: number;
  lessonId: string;
  lessonTitle: string;
  jp: string;
  romaji: string;
  en: string;
  speaker: string;
  flags: string[];
}

export interface QuizQuestion {
  type: "jp2en" | "en2jp" | "roma2jp";
  prompt: string;
  promptSub: string;
  options: string[];
  answer: number;
}

export interface Quiz {
  lessonId: string;
  level: number;
  title: string;
  questions: QuizQuestion[];
}

export interface SoundItem {
  sound: string;
  example: string;
  note: string;
}

export interface SoundSection {
  title: string;
  items: SoundItem[];
}

export interface VerbItem {
  infinitive: string;
  meaning: string;
  present: string;
  preterite: string;
}

export interface GrammarExample {
  jp: string;
  romaji: string;
  en: string;
}

export interface GrammarPoint {
  id: string;
  level: number;
  title: string;
  pattern: string;
  explanation: string;
  examples: GrammarExample[];
  tip?: string;
}

export interface MethodSection {
  title: string;
  body: string;
  step?: number;
}
