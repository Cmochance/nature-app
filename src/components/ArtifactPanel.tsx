import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useI18n } from "../i18n";
import { Icon } from "../icons";
import { ext, fileName, dirOf } from "../lib";
import ReaderBilingual from "./ReaderBilingual";
import ReviewerView from "./ReviewerView";
import CitationList from "./CitationList";

const IMG = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"];
const TEXT = [".md", ".markdown", ".txt"];
const CODE = [".py", ".r", ".json", ".csv", ".tsv", ".yaml", ".yml", ".tex"];
const CITE = [".bib", ".ris", ".nbib", ".enw"];

interface Props {
  result: string | null;
  artifacts: string[];
  skillId: string | null;
  original: string;
  nonce: number;
  canRefine: boolean;
  refineBasedOn: string | null;
  onRefine: (text: string) => void;
}

export default function ArtifactPanel({ result, artifacts, skillId, original, nonce, canRefine, refineBasedOn, onRefine }: Props) {
  const { t, lang } = useI18n();
  const tabs: string[] = [...(result ? ["__result__"] : []), ...artifacts];
  const [active, setActive] = useState<string | null>(null);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [refineText, setRefineText] = useState("");

  useEffect(() => {
    if (active && tabs.includes(active)) return;
    const firstImg = artifacts.find((p) => IMG.includes(ext(p)));
    setActive(firstImg ?? tabs[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifacts.length, result]);

  useEffect(() => {
    artifacts.forEach((p) => {
      const e = ext(p);
      if ((TEXT.includes(e) || CODE.includes(e) || CITE.includes(e)) && !(p in texts) && !(p in errs)) {
        readTextFile(p)
          .then((tx) => setTexts((m) => ({ ...m, [p]: tx })))
          .catch((err) => setErrs((m) => ({ ...m, [p]: String(err) })));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifacts]);

  if (tabs.length === 0) {
    return (
      <>
        <div className="art-head"><span className="title">{t("art.title")}</span></div>
        <div className="art-body"><div className="art-empty">{t("art.empty")}</div></div>
      </>
    );
  }

  const isReviewer = skillId === "nature-reviewer";
  const isPolish = skillId === "nature-polishing";

  return (
    <>
      <div className="art-head">
        <span className="title">{t("art.title")}</span>
        <span className="num">{artifacts.length}</span>
      </div>

      <div className="art-tabs">
        {tabs.map((p) => {
          const label = p === "__result__" ? t("art.result") : fileName(p);
          const icon = p === "__result__" ? "shield" : IMG.includes(ext(p)) ? "image" : CODE.includes(ext(p)) ? "code" : "file";
          return (
            <button key={p} className={"art-tab" + (active === p ? " active" : "")} onClick={() => setActive(p)}>
              <Icon name={icon} />{label}
            </button>
          );
        })}
      </div>

      <div className="art-body">
        {active === "__result__" && result && (
          isReviewer ? <ReviewerView md={result} />
          : isPolish ? (
            <div className="compare">
              <div className="compare-col">
                <div className="col-head">{t("art.original")}</div>
                <div className="md" style={{ whiteSpace: "pre-wrap", padding: "10px 12px" }}>{original}</div>
              </div>
              <div className="compare-col">
                <div className="col-head">{t("art.polished")}</div>
                <div className="md" style={{ padding: "10px 12px" }}><ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown></div>
              </div>
            </div>
          )
          : <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown></div>
        )}

        {active && active !== "__result__" && (
          <ArtifactView path={active} texts={texts} errs={errs} t={t} lang={lang} skillId={skillId} nonce={nonce} />
        )}

        {active && active !== "__result__" && (
          <div className="art-actions">
            <button className="btn" onClick={() => openPath(dirOf(active)).catch(() => {})}><Icon name="folder" />{t("art.reveal")}</button>
            <button className="btn" onClick={() => openPath(active).catch(() => {})}><Icon name="externalLink" />{t("art.openEditor")}</button>
          </div>
        )}

        {canRefine && (
          <div className="refine-card">
            <div className="h"><Icon name="wand" />{t("art.iterate")}{refineBasedOn ? ` · ${t("art.iterateBasedOn", { file: refineBasedOn })}` : ""}</div>
            <div className="row">
              <input
                value={refineText}
                onChange={(e) => setRefineText(e.target.value)}
                placeholder={t("art.iteratePh")}
                onKeyDown={(e) => { if (e.key === "Enter" && refineText.trim()) { onRefine(refineText); setRefineText(""); } }}
              />
              <button disabled={!refineText.trim()} onClick={() => { onRefine(refineText); setRefineText(""); }}>{t("art.generate")}</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ArtifactView({ path, texts, errs, t, lang, skillId, nonce }: {
  path: string; texts: Record<string, string>; errs: Record<string, string>;
  t: (k: string) => string; lang: string; skillId: string | null; nonce: number;
}) {
  const e = ext(path);

  if (skillId === "nature-reader" && TEXT.includes(e)) return <ReaderBilingual path={path} />;
  if (skillId === "nature-citation" && CITE.includes(e)) return <CitationList path={path} />;
  if (skillId === "nature-reviewer" && TEXT.includes(e)) {
    if (errs[path]) return <ReadError path={path} err={errs[path]} lang={lang} />;
    const tx = texts[path];
    return tx == null ? <span className="dim">{t("art.loading")}</span> : <ReviewerView md={tx} />;
  }

  if (IMG.includes(e)) {
    return (
      <figure className="fig">
        <img src={convertFileSrc(path) + "?v=" + nonce} alt={fileName(path)} />
        <figcaption>{fileName(path)}</figcaption>
      </figure>
    );
  }
  if (TEXT.includes(e)) {
    if (errs[path]) return <ReadError path={path} err={errs[path]} lang={lang} />;
    const tx = texts[path];
    return <div className="md">{tx == null ? <span className="dim">{t("art.loading")}</span> : <ReactMarkdown remarkPlugins={[remarkGfm]}>{tx}</ReactMarkdown>}</div>;
  }
  if (CODE.includes(e)) {
    if (errs[path]) return <ReadError path={path} err={errs[path]} lang={lang} />;
    const tx = texts[path];
    return <div className="code-block"><pre>{tx ?? t("art.loading")}</pre></div>;
  }
  if (CITE.includes(e)) return <CitationList path={path} />;

  return (
    <div className="art-actions">
      <button className="btn primary" onClick={() => openPath(path).catch(() => {})}><Icon name="externalLink" />{t("art.openEditor")}</button>
    </div>
  );
}

function ReadError({ path, err, lang }: { path: string; err: string; lang: string }) {
  const zh = lang === "zh";
  return (
    <div className="line-err">
      {(zh ? "读取失败:" : "Failed to read: ") + err}
      <div style={{ marginTop: 8 }}>
        <button className="btn-ghost" onClick={() => openPath(path).catch(() => {})}>
          <Icon name="externalLink" />{zh ? "用系统程序打开" : "Open externally"}
        </button>
      </div>
    </div>
  );
}
