export const THEME_IDS = ["living-places", "artisan-study", "travel-diary"] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export interface TutorTheme {
  id: ThemeId;
  label: string;
  shortLabel: string;
  description: string;
}

export const DEFAULT_THEME: ThemeId = "living-places";
export const THEME_STORAGE_KEY = "portugues-tutor-theme";

export const TUTOR_THEMES: TutorTheme[] = [
  {
    id: "living-places",
    label: "Living Places",
    shortLabel: "Places",
    description: "Lisbon daylight and Atlantic color",
  },
  {
    id: "artisan-study",
    label: "Artisan Study",
    shortLabel: "Artisan",
    description: "Azulejo, cork, pigment, and patient craft",
  },
  {
    id: "travel-diary",
    label: "Immersive Travel Diary",
    shortLabel: "Travel",
    description: "Rail journeys from Lisbon to the coast",
  },
];

export function isThemeId(value: string | null): value is ThemeId {
  return THEME_IDS.some((theme) => theme === value);
}

export function readStoredTheme(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.tutorTheme = theme;
}
