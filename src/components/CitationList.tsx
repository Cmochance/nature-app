import { useEffect, useState } from "react";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";

interface Entry {
  title?: string;
  authors?: string;
  year?: string;
  doi?: string;
}

const base = (p: string) => p.split("/").pop() || p;
const ext = (p: string) => (p.split(".").pop() || "").toLowerCase();

function parseBib(t: string): Entry[] {
  const out: Entry[] = [];
  for (const chunk of t.split(/@\w+\s*\{/).slice(1)) {
    const field = (name: string) =>
      (chunk.match(new RegExp(name + "\\s*=\\s*[{\"]([^}\"]*)", "i")) || [])[1]?.trim();
    out.push({
      title: field("title"),
      authors: field("author"),
      year: field("year"),
      doi: field("doi"),
    });
  }
  return out;
}

function parseRis(t: string): Entry[] {
  const out: Entry[] = [];
  let cur: Entry & { _au?: string[] } = { _au: [] };
  const push = () => {
    if (cur.title || cur._au?.length) {
      out.push({ ...cur, authors: cur._au?.join("; ") });
    }
    cur = { _au: [] };
  };
  for (const line of t.split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/);
    if (!m) continue;
    const [, tag, val] = m;
    if (tag === "TY") push();
    else if (tag === "TI" || tag === "T1") cur.title = val.trim();
    else if (tag === "AU" || tag === "A1") cur._au?.push(val.trim());
    else if (tag === "PY" || tag === "Y1") cur.year = val.trim().slice(0, 4);
    else if (tag === "DO") cur.doi = val.trim();
    else if (tag === "ER") push();
  }
  push();
  return out;
}

function parseEnw(t: string): Entry[] {
  const out: Entry[] = [];
  for (const chunk of t.split(/\n(?=%0)/)) {
    const au: string[] = [];
    let e: Entry = {};
    for (const line of chunk.split(/\r?\n/)) {
      const m = line.match(/^%(.)\s(.*)$/);
      if (!m) continue;
      const [, k, v] = m;
      if (k === "T") e.title = v.trim();
      else if (k === "A") au.push(v.trim());
      else if (k === "D") e.year = v.trim();
      else if (k === "R") e.doi = v.trim();
    }
    if (e.title || au.length) out.push({ ...e, authors: au.join("; ") });
  }
  return out;
}

function parse(path: string, text: string): Entry[] {
  const e = ext(path);
  if (e === "bib") return parseBib(text);
  if (e === "ris" || e === "nbib") return parseRis(text);
  if (e === "enw") return parseEnw(text);
  return [];
}

export default function CitationList({ path }: { path: string }) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    readTextFile(path).then(setText).catch((e) => setErr(String(e)));
  }, [path]);

  const entries = text ? parse(path, text) : [];

  return (
    <details className="art" open>
      <summary>
        {base(path)} {entries.length > 0 && `· ${entries.length} 条引用`}
      </summary>
      {err && <div className="err">读取失败:{err}</div>}
      <div className="cite-actions">
        <button onClick={() => openPath(path)} title="用系统默认程序打开(若 Zotero 关联了该格式即导入)">
          打开 / 导入 Zotero
        </button>
      </div>
      {entries.length > 0 ? (
        <ol className="cite-list">
          {entries.map((e, i) => (
            <li key={i}>
              <div className="cite-title">{e.title || "(无标题)"}</div>
              <div className="cite-meta">
                {[e.authors, e.year].filter(Boolean).join(" · ")}
                {e.doi && (
                  <>
                    {" · "}
                    <span className="cite-doi">{e.doi}</span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        text != null && <pre className="code">{text.slice(0, 8000)}</pre>
      )}
    </details>
  );
}
