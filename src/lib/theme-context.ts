import { createContext } from "react";
import type { ThemeId, TutorTheme } from "@/lib/theme";

export interface ThemeContextValue {
  theme: ThemeId;
  currentTheme: TutorTheme;
  setTheme: (theme: ThemeId) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
