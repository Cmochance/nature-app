import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "dark" | "light";
export type ThemePref = Theme | "system";

const STORE_KEY = "nature-theme";

function systemTheme(): Theme {
  if (typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}
function resolve(pref: ThemePref): Theme {
  return pref === "system" ? systemTheme() : pref;
}

interface ThemeCtx {
  theme: Theme;
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(() => {
    const saved = (typeof localStorage !== "undefined" && localStorage.getItem(STORE_KEY)) as ThemePref | null;
    return saved ?? "dark";
  });
  const [theme, setTheme] = useState<Theme>(() => resolve(pref));

  // pref 变化时重新解析
  useEffect(() => { setTheme(resolve(pref)); }, [pref]);

  // 跟随系统时,监听系统主题变化
  useEffect(() => {
    if (pref !== "system" || typeof matchMedia === "undefined") return;
    const mq = matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setTheme(systemTheme());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  // 唯一写 data-theme 的地方
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);

  function setPref(p: ThemePref) {
    setPrefState(p);
    try { localStorage.setItem(STORE_KEY, p); } catch { /* ignore */ }
  }

  return <Ctx.Provider value={{ theme, pref, setPref }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used within ThemeProvider");
  return c;
}
