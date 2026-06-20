import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import ReviewerView from "./ReviewerView";
import ReaderBilingual from "./ReaderBilingual";
import CitationList from "./CitationList";

const IMG = ["png", "svg", "jpg", "jpeg", "gif", "webp"];
const CITATION = ["bib", "ris", "enw", "nbib"];
const TEXT = ["md", "txt", "json", "csv", "tsv", "rdf", "log", "py", "tex"];

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

function FileArtifact({ path, skillId }: { path: string; skillId?: string }) {
  const e = ext(path);
  // reader 的 paper.md → 双语对照视图(按真实 spec 解析)
  if (skillId === "nature-reader" && base(path) === "paper.md") {
    return (
      <div className="art">
        <ReaderBilingual path={path} />
      </div>
    );
  }
  if (IMG.includes(e)) {
    return (
      <figure className="art">
        <img src={convertFileSrc(path)} alt={path} />
        <figcaption>{base(path)}</figcaption>
      </figure>
    );
  }
  if (CITATION.includes(e)) return <CitationList path={path} />;
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
  skillId,
  original,
}: {
  result: string | null;
  artifacts: string[];
  skillId?: string;
  original?: string;
}) {
  if (!result && artifacts.length === 0) {
    return <div className="dim">产物会显示在这里…</div>;
  }
  const showPolishCompare = skillId === "nature-polishing" && original && result;
  const showReviewer = skillId === "nature-reviewer" && result;
  return (
    <div className="preview">
      {showPolishCompare ? (
        <div className="compare">
          <div className="compare-col">
            <div className="result-head plain">原稿</div>
            <div className="md">
              <pre className="orig">{original}</pre>
            </div>
          </div>
          <div className="compare-col">
            <div className="result-head">润色 / 结果</div>
            <div className="md">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{result!}</ReactMarkdown>
            </div>
          </div>
        </div>
      ) : showReviewer ? (
        <div className="result-card">
          <div className="result-head">审稿报告</div>
          <ReviewerView md={result!} />
        </div>
      ) : (
        result && (
          <div className="result-card">
            <div className="result-head">最终结果</div>
            <div className="md">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
            </div>
          </div>
        )
      )}
      {artifacts.map((p) => (
        <FileArtifact key={p} path={p} skillId={skillId} />
      ))}
    </div>
  );
}
