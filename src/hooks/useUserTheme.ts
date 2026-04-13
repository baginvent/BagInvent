import { useEffect, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { APP_THEMES, applyTheme, DEFAULT_THEME_ID, getStoredThemeId, AppThemeId } from "@/lib/theme";

export function useUserTheme() {
  const { user } = useAuthContext();
  const [themeId, setThemeId] = useState<AppThemeId>(DEFAULT_THEME_ID);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initialTheme = getStoredThemeId();
    const metadataTheme = (user?.user_metadata as Record<string, unknown> | undefined)?.theme;
    const nextTheme =
      typeof metadataTheme === "string" && APP_THEMES.some((theme) => theme.id === metadataTheme)
        ? metadataTheme
        : initialTheme;

    setThemeId(nextTheme as AppThemeId);
    applyTheme(nextTheme);
    setLoading(false);
  }, [user]);

  const setUserTheme = async (nextTheme: AppThemeId) => {
    setThemeId(nextTheme);
    applyTheme(nextTheme);

    if (typeof window !== "undefined") {
      window.localStorage.setItem("bag-invent-user-theme", nextTheme);
    }

    if (user) {
      await supabase.auth.updateUser({ data: { theme: nextTheme } });
    }
  };

  return {
    themeId,
    setUserTheme,
    themes: APP_THEMES,
    loading,
  };
}

export function ThemeManager() {
  useUserTheme();
  return null;
}
