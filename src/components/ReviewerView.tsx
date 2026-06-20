import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// 按 nature-reviewer/references/report-structure.md 的真实段落契约切分。
const SECTIONS = [
  "Review setup",
  "Reviewer 1",
  "Reviewer 2",
  "Reviewer 3",
  "Cross-review synthesis",
  "Risk",
];

function matchSection(line: string): string | null {
  const t = line
    .replace(/^[#*\s>\-]+/, "")
    .replace(/[*:#]+$/, "")
    .trim()
    .toLowerCase();
  for (const s of SECTIONS) {
    if (t.startsWith(s.toLowerCase())) return s;
  }
  return null;
}

function splitSections(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  let current: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (current) out[current] = buf.join("\n").trim();
    buf = [];
  };
  for (const line of md.split("\n")) {
    const m = matchSection(line);
    if (m) {
      flush();
      current = m;
      continue;
    }
    if (current) buf.push(line);
  }
  flush();
  return out;
}

const Md = ({ t }: { t?: string }) => (
  <div className="md">
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{t || "_(空)_"}</ReactMarkdown>
  </div>
);

export default function ReviewerView({ md }: { md: string }) {
  const sec = splitSections(md);
  const hasReviewers = sec["Reviewer 1"] || sec["Reviewer 2"] || sec["Reviewer 3"];
  // 切不出预期段落 → 回落整段 markdown(不强行套格式)
  if (!hasReviewers) {
    return <Md t={md} />;
  }
  return (
    <div className="reviewer">
      {sec["Review setup"] && (
        <div className="rv-block">
          <div className="result-head plain">Review setup</div>
          <Md t={sec["Review setup"]} />
        </div>
      )}
      <div className="rv-cols">
        {["Reviewer 1", "Reviewer 2", "Reviewer 3"].map((r) => (
          <div key={r} className="rv-col">
            <div className="result-head">{r}</div>
            <Md t={sec[r]} />
          </div>
        ))}
      </div>
      {sec["Cross-review synthesis"] && (
        <div className="rv-block">
          <div className="result-head">Cross-review synthesis</div>
          <Md t={sec["Cross-review synthesis"]} />
        </div>
      )}
      {sec["Risk"] && (
        <div className="rv-block">
          <div className="result-head plain">Risk / unsupported claims</div>
          <Md t={sec["Risk"]} />
        </div>
      )}
    </div>
  );
}
