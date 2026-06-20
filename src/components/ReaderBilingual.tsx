import { useEffect, useState } from "react";
import { readTextFile } from "@tauri-apps/plugin-fs";

// 按 nature-reader/references/output-spec.md 的真实 paper.md 块格式解析:
//   **Source:** p.1 S001
//   **Original:** ...
//   **中文:** ...
interface Block {
  source: string;
  original: string;
  zh: string;
}

function parsePaperMd(md: string): Block[] {
  const parts = md.split(/(?=\*\*Source:\*\*)/);
  const blocks: Block[] = [];
  for (const p of parts) {
    if (!/\*\*Source:\*\*/.test(p)) continue;
    const source = (p.match(/\*\*Source:\*\*\s*(.*)/) || [])[1]?.trim() || "";
    const original =
      (p.match(/\*\*Original:\*\*\s*([\s\S]*?)(?=\*\*中文:\*\*|$)/) || [])[1]?.trim() || "";
    const zh = (p.match(/\*\*中文:\*\*\s*([\s\S]*?)$/) || [])[1]?.trim() || "";
    blocks.push({ source, original, zh });
  }
  return blocks;
}

export default function ReaderBilingual({ path }: { path: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    readTextFile(path).then(setContent).catch((e) => setErr(String(e)));
  }, [path]);

  if (err) return <div className="err">读取 paper.md 失败:{err}</div>;
  if (content == null) return <div className="dim">读取 paper.md…</div>;

  const blocks = parsePaperMd(content);
  // 解析不出双语块 → 回落纯文本(不强行套格式)
  if (blocks.length === 0) return <pre className="orig">{content.slice(0, 20000)}</pre>;

  return (
    <div className="bilingual">
      <div className="result-head">paper.md · 双语对照</div>
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
