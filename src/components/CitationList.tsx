import { useEffect, useState } from "react";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { useI18n } from "../i18n";
import { Icon } from "../icons";
import { ext } from "../lib";

interface Entry { title?: string; authors?: string; year?: string; doi?: string; }

const clean = (s: string) => s.replace(/[{}]/g, "").trim();

// 括号配平的 BibTeX 字段提取:支持 {... {nested} ...} 与 "..." 与裸值,不再被首个内层 } 截断。
function bibField(chunk: string, name: string): string | undefined {
  const re = new RegExp(name + "\\s*=\\s*", "i");
  const m = re.exec(chunk);
  if (!m) return undefined;
  const i = m.index + m[0].length;
  const open = chunk[i];
  if (open === "{") {
    let depth = 0;
    for (let j = i; j < chunk.length; j++) {
      if (chunk[j] === "{") depth++;
      else if (chunk[j] === "}") { depth--; if (depth === 0) return clean(chunk.slice(i + 1, j)); }
    }
    return clean(chunk.slice(i + 1));
  }
  if (open === '"') {
    const end = chunk.indexOf('"', i + 1);
    return end > 0 ? clean(chunk.slice(i + 1, end)) : undefined;
  }
  const mm = chunk.slice(i).match(/^([^,\n]+)/);
  return mm ? clean(mm[1]) : undefined;
}

function parseBib(t: string): Entry[] {
  const out: Entry[] = [];
  for (const chunk of t.split(/@\w+\s*\{/).slice(1)) {
    out.push({ title: bibField(chunk, "title"), authors: bibField(chunk, "author"), year: bibField(chunk, "year"), doi: bibField(chunk, "doi") });
  }
  return out;
}

function parseRis(t: string): Entry[] {
  const out: Entry[] = [];
  let cur: Entry & { _au?: string[] } = { _au: [] };
  const push = () => { if (cur.title || cur._au?.length) out.push({ ...cur, authors: cur._au?.join("; ") }); cur = { _au: [] }; };
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
    const e: Entry = {};
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
  if (e === ".bib") return parseBib(text);
  if (e === ".ris" || e === ".nbib") return parseRis(text);
  if (e === ".enw") return parseEnw(text);
  return [];
}

export default function CitationList({ path }: { path: string }) {
  const { t, lang } = useI18n();
  const zh = lang === "zh";
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    readTextFile(path).then(setText).catch((e) => setErr(String(e)));
  }, [path]);

  const entries = text ? parse(path, text) : [];

  return (
    <div>
      {err && <div className="line-err">{(zh ? "读取失败:" : "Failed to read: ") + err}</div>}
      <div className="cite-actions">
        <button className="btn-ghost" onClick={() => openPath(path).catch(() => {})}>
          <Icon name="externalLink" />{t("cite.exportZotero")}
        </button>
        {entries.length > 0 && <span className="dim" style={{ fontSize: 12, alignSelf: "center" }}>{zh ? `${entries.length} 条引用` : `${entries.length} refs`}</span>}
      </div>
      {entries.length > 0 ? (
        <ol className="cite-list">
          {entries.map((e, i) => (
            <li className="cite-item" key={i}>
              <div className="cite-title">{e.title || (zh ? "(无标题)" : "(untitled)")}</div>
              <div className="cite-meta">{[e.authors, e.year].filter(Boolean).join(" · ")}</div>
              {e.doi && <div className="cite-doi">{e.doi}</div>}
            </li>
          ))}
        </ol>
      ) : (
        text != null && <div className="code-block"><pre>{text.slice(0, 8000)}</pre></div>
      )}
    </div>
  );
}
