import { useEffect, useState } from "react";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { useI18n } from "../i18n";

// 按 nature-reader 的 paper.md 块格式解析:
//   **Source:** p.1 S001 / **Original:** ... / **中文:** ...
interface Block { source: string; original: string; zh: string; }

function parsePaperMd(md: string): Block[] {
  const parts = md.split(/(?=\*\*Source:\*\*)/);
  const blocks: Block[] = [];
  for (const p of parts) {
    if (!/\*\*Source:\*\*/.test(p)) continue;
    const source = (p.match(/\*\*Source:\*\*\s*(.*)/) || [])[1]?.trim() || "";
    const original = (p.match(/\*\*Original:\*\*\s*([\s\S]*?)(?=\*\*中文:\*\*|$)/) || [])[1]?.trim() || "";
    const zh = (p.match(/\*\*中文:\*\*\s*([\s\S]*?)$/) || [])[1]?.trim() || "";
    blocks.push({ source, original, zh });
  }
  return blocks;
}

export default function ReaderBilingual({ path }: { path: string }) {
  const { lang } = useI18n();
  const zh = lang === "zh";
  const [content, setContent] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    readTextFile(path).then(setContent).catch((e) => setErr(String(e)));
  }, [path]);

  if (err) return <div className="line-err">{(zh ? "读取失败:" : "Failed to read: ") + err}</div>;
  if (content == null) return <div className="dim">{zh ? "读取中…" : "Loading…"}</div>;

  const blocks = parsePaperMd(content);
  if (blocks.length === 0) return <div className="code-block"><pre>{content.slice(0, 20000)}</pre></div>;

  return (
    <div className="bilingual">
      {blocks.map((b, i) => (
        <div key={i} className="bi-row">
          {b.source && <div className="bi-src">{b.source}</div>}
          <div className="bi-cols">
            <div className="bi-en">{b.original}</div>
            <div className="bi-zh">{b.zh}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
