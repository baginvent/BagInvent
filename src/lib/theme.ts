export type AppThemeId = "default" | "green" | "blue" | "purple" | "orange";

export interface AppTheme {
  id: AppThemeId;
  label: string;
  primary: string;
  primaryForeground: string;
  sidebarBackground: string;
  sidebarForeground: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  ring: string;
  accent?: string;
}

export const APP_THEMES: AppTheme[] = [
  {
    id: "default",
    label: "Default",
    primary: "0 53% 58%",
    primaryForeground: "0 0% 100%",
    sidebarBackground: "18 8% 13%",
    sidebarForeground: "30 18% 91%",
    sidebarPrimary: "0 53% 58%",
    sidebarPrimaryForeground: "0 0% 100%",
    sidebarAccent: "0 53% 58%",
    ring: "0 53% 58%",
    accent: "28 22% 92%",
  },
  {
    id: "green",
    label: "Mint",
    primary: "143 53% 46%",
    primaryForeground: "0 0% 100%",
    sidebarBackground: "145 20% 16%",
    sidebarForeground: "0 0% 100%",
    sidebarPrimary: "143 53% 46%",
    sidebarPrimaryForeground: "0 0% 100%",
    sidebarAccent: "143 53% 46%",
    ring: "143 53% 46%",
    accent: "126 49% 58%",
  },
  {
    id: "blue",
    label: "Sky",
    primary: "218 61% 49%",
    primaryForeground: "0 0% 100%",
    sidebarBackground: "215 18% 16%",
    sidebarForeground: "0 0% 100%",
    sidebarPrimary: "218 61% 49%",
    sidebarPrimaryForeground: "0 0% 100%",
    sidebarAccent: "218 61% 49%",
    ring: "218 61% 49%",
    accent: "39 83% 62%",
  },
  {
    id: "purple",
    label: "Violet",
    primary: "252 62% 58%",
    primaryForeground: "0 0% 100%",
    sidebarBackground: "265 18% 18%",
    sidebarForeground: "0 0% 100%",
    sidebarPrimary: "252 62% 58%",
    sidebarPrimaryForeground: "0 0% 100%",
    sidebarAccent: "252 62% 58%",
    ring: "252 62% 58%",
    accent: "218 61% 49%",
  },
  {
    id: "orange",
    label: "Amber",
    primary: "33 100% 50%",
    primaryForeground: "0 0% 0%",
    sidebarBackground: "35 20% 14%",
    sidebarForeground: "0 0% 100%",
    sidebarPrimary: "33 100% 50%",
    sidebarPrimaryForeground: "0 0% 0%",
    sidebarAccent: "33 100% 50%",
    ring: "33 100% 50%",
    accent: "47 92% 62%",
  },
];

export const DEFAULT_THEME_ID: AppThemeId = "default";
const THEME_STORAGE_KEY = "bag-invent-user-theme";

export const getThemeById = (id: string): AppTheme => {
  return APP_THEMES.find((theme) => theme.id === id) ?? APP_THEMES[0];
};

export const getStoredThemeId = (): AppThemeId => {
  const stored = typeof window !== "undefined" ? window.localStorage.getItem(THEME_STORAGE_KEY) : null;
  return (stored && (APP_THEMES.some((theme) => theme.id === stored) ? stored : DEFAULT_THEME_ID)) as AppThemeId;
};

export const applyTheme = (themeId: string) => {
  const theme = getThemeById(themeId);
  const root = document.documentElement;

  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--primary-foreground", theme.primaryForeground);
  root.style.setProperty("--sidebar-background", theme.sidebarBackground);
  root.style.setProperty("--sidebar-foreground", theme.sidebarForeground);
  root.style.setProperty("--sidebar-primary", theme.sidebarPrimary);
  root.style.setProperty("--sidebar-primary-foreground", theme.sidebarPrimaryForeground);
  root.style.setProperty("--sidebar-accent", theme.sidebarAccent);
  root.style.setProperty("--sidebar-accent-foreground", theme.primaryForeground);
  root.style.setProperty("--sidebar-border", theme.sidebarBackground);
  root.style.setProperty("--sidebar-ring", theme.ring);
  root.style.setProperty("--ring", theme.ring);
  root.style.setProperty("--accent", theme.accent ?? theme.primary);
  root.style.setProperty("--accent-foreground", theme.primaryForeground);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme.id);
  }
};
