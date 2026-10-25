export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "orithos-theme";

export function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme, withTransition = false) {
  const root = document.documentElement;
  if (withTransition) root.classList.add("theme-transition");
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  if (withTransition) {
    window.setTimeout(() => root.classList.remove("theme-transition"), 220);
  }
}

