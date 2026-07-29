import { Palette } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/hooks/use-theme";
import { TUTOR_THEMES, type ThemeId } from "@/lib/theme";

export default function ThemeSelector() {
  const { theme, currentTheme, setTheme } = useTheme();

  return (
    <div className="theme-selector-wrap">
      <label htmlFor="tutor-theme" className="theme-selector-label">
        <Palette aria-hidden="true" className="h-4 w-4" />
        Theme
      </label>
      <Select value={theme} onValueChange={(value) => setTheme(value as ThemeId)}>
        <SelectTrigger id="tutor-theme" aria-label="Cultural visual theme" className="theme-selector-trigger">
          <SelectValue aria-label={currentTheme.label}>
            <span className="theme-selector-value">{currentTheme.shortLabel}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" align="end" className="theme-selector-content">
          {TUTOR_THEMES.map((item) => (
            <SelectItem key={item.id} value={item.id} className="theme-selector-item">
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
