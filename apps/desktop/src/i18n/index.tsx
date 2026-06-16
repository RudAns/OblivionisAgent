import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { EN } from "./en.js";

export type Lang = "zh" | "en";

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  /**
   * 翻译：中文原文即 key。
   * - zh：原样返回中文（所以漏译的字符串照常显示中文，可逐步补全，绝不会出现空白/key）。
   * - en：查 EN 表，查不到回退中文。
   * 用 {0}{1}… 做占位插值：t("会话 {0} · 终端 {1}", a, b)。
   */
  t: (zh: string, ...vals: (string | number)[]) => string;
}

const STORAGE = "oblivionis-lang";

const Ctx = createContext<I18n>({ lang: "zh", setLang: () => {}, t: (s) => s });

function fill(s: string, vals: (string | number)[]): string {
  return vals.length ? s.replace(/\{(\d+)\}/g, (m, i) => (vals[Number(i)] ?? m).toString()) : s;
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() =>
    localStorage.getItem(STORAGE) === "en" ? "en" : "zh",
  );
  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(STORAGE, l);
    try {
      document.documentElement.lang = l === "en" ? "en" : "zh-CN";
    } catch {
      /* noop */
    }
    setLangState(l);
  }, []);
  const t = useCallback<I18n["t"]>(
    (zh, ...vals) => fill(lang === "en" ? EN[zh] ?? zh : zh, vals),
    [lang],
  );
  const value = useMemo<I18n>(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 拿 { lang, setLang, t }——语言切换器用 */
export function useI18n(): I18n {
  return useContext(Ctx);
}
/** 只拿翻译函数——绝大多数组件用这个 */
export function useT(): I18n["t"] {
  return useContext(Ctx).t;
}

/** 非 hook 版翻译（给 class 组件 / 模块用）：从 localStorage 读语言，不随切换重渲染 */
export function tStatic(zh: string, ...vals: (string | number)[]): string {
  const lang = localStorage.getItem(STORAGE) === "en" ? "en" : "zh";
  return fill(lang === "en" ? EN[zh] ?? zh : zh, vals);
}
