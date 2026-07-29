// Gamification: XP, streaks, belt ranks, speak-attempt history
// All stored in localStorage.

const XP_KEY = "pt_xp_v1";
const ATTEMPTS_KEY = "pt_speak_attempts_v1";

export interface XpState {
  total: number;
  events: { d: string; kind: string; xp: number }[]; // d = YYYY-MM-DD local
}

export interface SpeakAttempt {
  t: number;
  lessonId: string;
  line: string;
  score: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

function todayStr(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getXp(): XpState {
  return read(XP_KEY, { total: 0, events: [] });
}

export function logActivity(kind: string, xp: number): XpState {
  const s = getXp();
  s.total += xp;
  s.events.push({ d: todayStr(), kind, xp });
  if (s.events.length > 2000) s.events = s.events.slice(-2000);
  write(XP_KEY, s);
  return s;
}

export function getStreak(state?: XpState): number {
  const s = state ?? getXp();
  const days = new Set(s.events.map((e) => e.d));
  let streak = 0;
  // streak counts back from today (or yesterday if nothing today yet)
  let cursor = days.has(todayStr()) ? 0 : -1;
  while (days.has(todayStr(cursor))) {
    streak++;
    cursor--;
  }
  return streak;
}

export interface Belt {
  name: string;
  jp: string;
  minXp: number;
  color: string;
}

export const BELTS: Belt[] = [
  { name: "White belt", jp: "Branca", minXp: 0, color: "bg-stone-200 text-stone-700" },
  { name: "Yellow belt", jp: "Amarela", minXp: 200, color: "bg-yellow-200 text-yellow-900" },
  { name: "Orange belt", jp: "Laranja", minXp: 500, color: "bg-orange-200 text-orange-900" },
  { name: "Green belt", jp: "Verde", minXp: 1000, color: "bg-green-200 text-green-900" },
  { name: "Blue belt", jp: "Azul", minXp: 2000, color: "bg-sky-200 text-sky-900" },
  { name: "Brown belt", jp: "Marrom", minXp: 4000, color: "bg-amber-300 text-amber-950" },
  { name: "Black belt", jp: "Preta", minXp: 7000, color: "bg-stone-900 text-white" },
];

export function getBelt(totalXp?: number): { belt: Belt; next: Belt | null; progress: number } {
  const xp = totalXp ?? getXp().total;
  let belt = BELTS[0];
  let next: Belt | null = null;
  for (let i = 0; i < BELTS.length; i++) {
    if (xp >= BELTS[i].minXp) {
      belt = BELTS[i];
      next = BELTS[i + 1] ?? null;
    }
  }
  const progress = next ? (xp - belt.minXp) / (next.minXp - belt.minXp) : 1;
  return { belt, next, progress: Math.min(1, progress) };
}

// ---- speak attempt history ----

export function getAttempts(): SpeakAttempt[] {
  return read(ATTEMPTS_KEY, []);
}

export function logAttempt(a: SpeakAttempt): SpeakAttempt[] {
  const list = getAttempts();
  list.push(a);
  if (list.length > 500) list.splice(0, list.length - 500);
  write(ATTEMPTS_KEY, list);
  return list;
}

// ---- learner settings ----

const SETTINGS_KEY = "pt_settings_v1";

export interface Settings {
  model: string;
  voiceReplies: boolean;
}

const SETTINGS_DEFAULTS: Settings = {
  model: "openai/gpt-4o-mini",
  voiceReplies: true,
};

export function getSettings(): Settings {
  const stored = read<Partial<Settings> & Record<string, unknown>>(SETTINGS_KEY, {});
  const settings: Settings = {
    model: typeof stored.model === "string" ? stored.model : SETTINGS_DEFAULTS.model,
    voiceReplies:
      typeof stored.voiceReplies === "boolean"
        ? stored.voiceReplies
        : SETTINGS_DEFAULTS.voiceReplies,
  };
  write(SETTINGS_KEY, settings);
  return settings;
}

export function saveSettings(s: Settings) {
  write(SETTINGS_KEY, s);
}
