"use client";

/*
 * Theme — light/dark mode with a smooth transition. The choice is stored in
 * localStorage; the inline script in layout.tsx applies it to <html> before
 * first paint so there is no flash of the wrong theme.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Icon } from "@/components/icons";

type Theme = "light" | "dark";

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => {},
});

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = localStorage.getItem("slp_theme");
    const prefers = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme((stored === "dark" || stored === "light" ? stored : prefers) as Theme);
  }, []);

  useEffect(() => {
    apply(theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      localStorage.setItem("slp_theme", next);
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** The toggle button — a small icon button styled by .btn-icon in globals.css. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const mountedState = typeof window !== "undefined";
  return (
    <button
      type="button"
      className="btn-icon"
      onClick={toggle}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      suppressHydrationWarning
    >
      {mountedState ? <Icon name={theme === "dark" ? "sun" : "moon"} size={18} /> : null}
    </button>
  );
}
