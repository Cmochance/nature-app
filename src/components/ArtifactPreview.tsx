import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";

const IMG = ["png", "svg", "jpg", "jpeg", "gif", "webp"];
const TEXT = ["md", "txt", "json", "csv", "tsv", "bib", "ris", "enw", "nbib", "rdf", "log", "py", "tex"];

const ext = (p: string) => (p.split(".").pop() || "").toLowerCase();
const base = (p: string) => p.split("/").pop() || p;

function TextArtifact({ path, isMd }: { path: string; isMd: boolean }) {
  const [content, setContent] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    readTextFile(path).then(setContent).catch((e) => setErr(String(e)));
  }, [path]);
  return (
    <details className="art" open>
      <summary>{base(path)}</summary>
      {err && <div className="err">读取失败:{err}</div>}
      {content != null &&
        (isMd ? (
          <div className="md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : (
          <pre className="code">{content.slice(0, 20000)}</pre>
        ))}
    </details>
  );
}

function FileArtifact({ path }: { path: string }) {
  const e = ext(path);
  if (IMG.includes(e)) {
    return (
      <figure className="art">
        <img src={convertFileSrc(path)} alt={path} />
        <figcaption>{base(path)}</figcaption>
      </figure>
    );
  }
  if (TEXT.includes(e)) return <TextArtifact path={path} isMd={e === "md"} />;
  // 其它(docx/pptx/pdf 等)→ 用系统软件打开
  return (
    <div className="art file-row">
      <span className="fname">{base(path)}</span>
      <button onClick={() => openPath(path)}>打开</button>
    </div>
  );
}

export default function ArtifactPreview({
  result,
  artifacts,
}: {
  result: string | null;
  artifacts: string[];
}) {
  if (!result && artifacts.length === 0) {
    return <div className="dim">产物会显示在这里…</div>;
  }
  return (
    <div className="preview">
      {result && (
        <div className="result-card">
          <div className="result-head">最终结果</div>
          <div className="md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
          </div>
        </div>
      )}
      {artifacts.map((p) => (
        <FileArtifact key={p} path={p} />
      ))}
    </div>
  );
}
