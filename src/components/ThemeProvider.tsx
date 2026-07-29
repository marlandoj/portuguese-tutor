import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ThemeContext } from "@/lib/theme-context";
import {
  applyTheme,
  DEFAULT_THEME,
  readStoredTheme,
  THEME_STORAGE_KEY,
  TUTOR_THEMES,
  type ThemeId,
} from "@/lib/theme";

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    if (typeof document !== "undefined") {
      const initial = document.documentElement.dataset.tutorTheme;
      if (initial && TUTOR_THEMES.some((item) => item.id === initial)) {
        return initial as ThemeId;
      }
    }
    return readStoredTheme();
  });

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      return;
    }
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      currentTheme: TUTOR_THEMES.find((item) => item.id === theme) ?? TUTOR_THEMES[0],
      setTheme: (nextTheme: ThemeId) => {
        if (TUTOR_THEMES.some((item) => item.id === nextTheme)) {
          setThemeState(nextTheme);
        } else {
          setThemeState(DEFAULT_THEME);
        }
      },
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
