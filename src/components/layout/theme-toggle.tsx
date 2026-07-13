"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

const STORAGE_KEY = "taxforge-theme";

export function ThemeToggle() {
  // Mirrors whatever the inline bootstrap script in layout.tsx already
  // applied, so this never causes a hydration flash of the wrong icon.
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // localStorage unavailable (private browsing etc.) — theme just won't persist, no crash.
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex h-6 w-6 items-center justify-center rounded-sm text-ink-faint transition-colors hover:bg-panel-raised hover:text-ink"
    >
      {isDark ? <Sun size={13} strokeWidth={1.75} /> : <Moon size={13} strokeWidth={1.75} />}
    </button>
  );
}
