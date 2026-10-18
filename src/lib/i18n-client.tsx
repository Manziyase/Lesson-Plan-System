"use client";

/*
 * Client i18n context — the React equivalent of the legacy I18N object:
 * localStorage keeps the choice across sessions; a signed-in user's server
 * profile (user.language) wins once known. Views simply call t("…").
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { I18N, isSupportedLang, type LangCode } from "./i18n";

type Ctx = { lang: LangCode; t: (key: string, vars?: Record<string, string | number>) => string; setLang: (l: LangCode) => void };

const LangContext = createContext<Ctx>({ lang: "en", t: (k) => k, setLang: () => {} });

export function LangProvider({ initial, children }: { initial?: LangCode; children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(initial && isSupportedLang(initial) ? initial : "en");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("slp_lang") : null;
    if (stored && isSupportedLang(stored)) setLangState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: LangCode) => {
    setLangState(l);
    localStorage.setItem("slp_lang", l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let s = (I18N[lang] && I18N[lang][key]) || key;
      if (vars) for (const k of Object.keys(vars)) s = s.split("{" + k + "}").join(String(vars[k]));
      return s;
    },
    [lang]
  );

  return <LangContext.Provider value={{ lang, t, setLang }}>{children}</LangContext.Provider>;
}

export function useI18n() {
  return useContext(LangContext);
}

export const LangSelect = ({ value, onChange, className }: { value: string; onChange: (l: LangCode) => void; className?: string }) => (
  <select className={className} value={value} onChange={(e) => onChange(e.target.value as LangCode)} aria-label="Language">
    <option value="en">English</option>
    <option value="fr">Français</option>
    <option value="rw">Kinyarwanda</option>
  </select>
);
