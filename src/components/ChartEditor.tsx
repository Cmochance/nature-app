import { useEffect, useRef, useState, type ReactNode } from "react";
import { previewPlot, toDataUrl, COLOR_PRESETS } from "../api/plotApi";
import type { PlotSpec, PlotStyle, PlotData, PlotSeries, PlotGrid } from "../types/plot";
import { CMAP_PRESETS } from "../types/plot";
import { useI18n } from "../i18n";

// chart_type 值 → i18n key(值发给后端,标签随界面语言)
const CHART_TYPES = [
  { value: "line", key: "ce.typeLine" },
  { value: "bar", key: "ce.typeBar" },
  { value: "heatmap", key: "ce.typeHeatmap" },
  { value: "line_dual_y", key: "ce.typeDualY" },
];

// 字体名 / matplotlib 图例位置是技术标识符,保留不译
const FONTS = ["serif", "sans-serif", "Arial", "Times New Roman", "DejaVu Serif", "DejaVu Sans", "SimSun"];
const LEGEND_LOCS = ["best", "upper right", "upper left", "lower right", "lower left", "center"];

interface Props {
  initialSpec: PlotSpec;
  initialData: PlotData;
  onBack: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="ce-section" open>
      <summary>{title}</summary>
      <div className="ce-section-body">{children}</div>
    </details>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="ce-field">
      <span className="ce-field-label">{label}</span>
      {children}
    </label>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="ce-color">
      <div className="ce-swatches">
        {COLOR_PRESETS.map((c) => (
          <button key={c} type="button" className={"ce-swatch" + (value === c ? " on" : "")} style={{ background: c }} onClick={() => onChange(c)} />
        ))}
      </div>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="ce-color-input" />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="ce-color-text" />
    </div>
  );
}

export default function ChartEditor({ initialSpec, initialData, onBack }: Props) {
  const { t } = useI18n();
  const [spec, setSpec] = useState<PlotSpec>(initialSpec);
  const [data, setData] = useState<PlotData>(initialData);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const payloadRef = useRef("");
  const reqIdRef = useRef(0);

  const chartType = spec.chart_type || "line";
  const st: PlotStyle = spec.style ?? {};
  const series = data.series ?? [];

  const updateSpec = (patch: Partial<PlotSpec>) => setSpec((p) => ({ ...p, ...patch }));
  const updateStyle = (patch: Partial<PlotStyle>) => setSpec((p) => ({ ...p, style: { ...p.style, ...patch } }));
  const updateSeries = (i: number, patch: Partial<PlotSeries>) =>
    setData((p) => ({ ...p, series: p.series.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));
  const updateGrid = (patch: Partial<PlotGrid>) =>
    setData((p) => ({ ...p, grid: { ...p.grid, mode: "heatmap", ...patch } }));
  const grid: PlotGrid = data.grid ?? { mode: "heatmap", values: [[1, 2, 3], [4, 5, 6], [7, 8, 9]], cmap: "viridis", origin: "lower" };
  const matrix: number[][] = grid.values ?? [];
  const setCell = (r: number, c: number, v: number) => {
    const next = matrix.map((row) => [...row]);
    if (next[r]) next[r][c] = v;
    updateGrid({ values: next });
  };
  const addRow = () => updateGrid({ values: [...matrix, Array(matrix[0]?.length ?? 3).fill(0)] });
  const delRow = () => updateGrid({ values: matrix.slice(0, -1) });
  const addCol = () => updateGrid({ values: matrix.map((row) => [...row, 0]) });
  const delCol = () => updateGrid({ values: matrix.map((row) => row.slice(0, -1)) });

  // 防抖预览:参数变化 → 400ms → 本地渲染
  useEffect(() => {
    const payload = JSON.stringify({ chartType, spec, data });
    if (payload === payloadRef.current) return;
    const myId = ++reqIdRef.current;
    const timer = setTimeout(async () => {
      payloadRef.current = payload;
      setLoading(true);
      setError(null);
      const renderData =
        chartType === "heatmap" && !data.grid
          ? { ...data, grid: { mode: "heatmap" as const, values: [[1, 2, 3], [4, 5, 6], [7, 8, 9]], cmap: "viridis", origin: "lower" as const } }
          : data;
      try {
        const resp = await previewPlot(chartType, spec, renderData, "svg");
        if (myId !== reqIdRef.current) return;
        setPreviewUrl(toDataUrl(resp.imageFormat, resp.imageBase64));
      } catch (e) {
        if (myId !== reqIdRef.current) return;
        setError(String(e));
      } finally {
        if (myId === reqIdRef.current) setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [chartType, spec, data]);

  async function exportChart(fmt: "svg" | "png") {
    try {
      const renderData =
        chartType === "heatmap" && !data.grid
          ? { ...data, grid: { mode: "heatmap" as const, values: [[1, 2, 3], [4, 5, 6], [7, 8, 9]], cmap: "viridis", origin: "lower" as const } }
          : data;
      const resp = await previewPlot(chartType, spec, renderData, fmt);
      const url = toDataUrl(resp.imageFormat, resp.imageBase64);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chart.${fmt}`;
      a.click();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="chart-editor">
      <header className="ce-header">
        <button className="link" onClick={onBack}>← {t("common.back")}</button>
        <h2>{t("ce.title")}</h2>
        <div className="spacer" />
        <span className={"ce-status" + (loading ? " loading" : "")}>{loading ? t("ce.rendering") : error ? t("ce.errored") : t("ce.synced")}</span>
        <button onClick={() => exportChart("svg")}>{t("ce.export")} SVG</button>
        <button className="primary" onClick={() => exportChart("png")}>{t("ce.export")} PNG</button>
      </header>

      <div className="ce-body">
        <div className="ce-params">
          <Section title={t("ce.secGlobal")}>
            <Field label={t("ce.chartType")}>
              <select value={chartType} onChange={(e) => updateSpec({ chart_type: e.target.value })}>
                {CHART_TYPES.map((ct) => <option key={ct.value} value={ct.value}>{t(ct.key)}</option>)}
              </select>
            </Field>
            <Field label={t("ce.fTitle")}>
              <input type="text" value={spec.title ?? ""} onChange={(e) => updateSpec({ title: e.target.value })} />
            </Field>
            <div className="ce-row">
              <Field label={t("ce.xLabel")}>
                <input type="text" value={spec.x_label ?? ""} onChange={(e) => updateSpec({ x_label: e.target.value })} />
              </Field>
              <Field label={t("ce.xUnit")}>
                <input type="text" value={spec.x_unit ?? ""} onChange={(e) => updateSpec({ x_unit: e.target.value })} />
              </Field>
            </div>
            <div className="ce-row">
              <Field label={t("ce.yLabel")}>
                <input type="text" value={spec.y_label ?? ""} onChange={(e) => updateSpec({ y_label: e.target.value })} />
              </Field>
              <Field label={t("ce.yUnit")}>
                <input type="text" value={spec.y_unit ?? ""} onChange={(e) => updateSpec({ y_unit: e.target.value })} />
              </Field>
            </div>
          </Section>

          <Section title={t("ce.secStyle")}>
            <Field label={t("ce.font")}>
              <select value={st.font_family ?? "serif"} onChange={(e) => updateStyle({ font_family: e.target.value })}>
                {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <div className="ce-row">
              <Field label={t("ce.fontSize")}>
                <input type="number" min={6} max={48} value={st.font_size ?? 12} onChange={(e) => updateStyle({ font_size: +e.target.value })} />
              </Field>
              <Field label="DPI">
                <input type="number" min={72} max={600} value={st.dpi ?? 150} onChange={(e) => updateStyle({ dpi: +e.target.value })} />
              </Field>
            </div>
            <div className="ce-row">
              <Field label={t("ce.figW")}>
                <input type="number" min={3} max={30} step={0.5} value={st.figure_size?.[0] ?? 10}
                  onChange={(e) => updateStyle({ figure_size: [+e.target.value, st.figure_size?.[1] ?? 6] })} />
              </Field>
              <Field label={t("ce.figH")}>
                <input type="number" min={2} max={30} step={0.5} value={st.figure_size?.[1] ?? 6}
                  onChange={(e) => updateStyle({ figure_size: [st.figure_size?.[0] ?? 10, +e.target.value] })} />
              </Field>
            </div>
            <label className="ce-check">
              <input type="checkbox" checked={st.grid ?? true} onChange={(e) => updateStyle({ grid: e.target.checked })} />
              <span>{t("ce.grid")}</span>
            </label>
            {st.grid !== false && (
              <Field label={`${t("ce.gridAlpha")} ${st.grid_alpha ?? 0.3}`}>
                <input type="range" min={0} max={1} step={0.05} value={st.grid_alpha ?? 0.3} onChange={(e) => updateStyle({ grid_alpha: +e.target.value })} />
              </Field>
            )}
          </Section>

          <Section title={t("ce.secLegend")}>
            <label className="ce-check">
              <input type="checkbox" checked={st.legend?.enabled ?? true} onChange={(e) => updateStyle({ legend: { ...st.legend, enabled: e.target.checked } })} />
              <span>{t("ce.showLegend")}</span>
            </label>
            {st.legend?.enabled !== false && (
              <Field label={t("ce.legendLoc")}>
                <select value={st.legend?.location ?? "best"} onChange={(e) => updateStyle({ legend: { ...st.legend, location: e.target.value } })}>
                  {LEGEND_LOCS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
            )}
            <label className="ce-check">
              <input type="checkbox" checked={st.spines?.enabled ?? true} onChange={(e) => updateStyle({ spines: { ...st.spines, enabled: e.target.checked } })} />
              <span>{t("ce.showSpines")}</span>
            </label>
            {st.spines?.enabled !== false && (
              <div className="ce-row">
                <Field label={t("ce.spineWidth")}>
                  <input type="number" min={0} max={5} step={0.1} value={st.spines?.width ?? 1.2} onChange={(e) => updateStyle({ spines: { ...st.spines, width: +e.target.value } })} />
                </Field>
                <Field label={t("ce.spineColor")}>
                  <ColorPicker value={st.spines?.color ?? "#333"} onChange={(v) => updateStyle({ spines: { ...st.spines, color: v } })} />
                </Field>
              </div>
            )}
          </Section>

          <Section title={`${t("ce.secSeries")} (${series.length})`}>
            {series.map((s, i) => (
              <div key={i} className="ce-series">
                <div className="ce-series-head">
                  <input type="checkbox" checked={s.visible ?? true} onChange={(e) => updateSeries(i, { visible: e.target.checked })} />
                  <input type="text" className="ce-series-name" value={s.name} onChange={(e) => updateSeries(i, { name: e.target.value })} />
                </div>
                <Field label={t("ce.color")}>
                  <ColorPicker value={s.color ?? "#1a1a1a"} onChange={(v) => updateSeries(i, { color: v })} />
                </Field>
                <Field label={`${t("ce.lineWidth")} ${s.line_width ?? 1.5}`}>
                  <input type="range" min={0.5} max={5} step={0.25} value={s.line_width ?? 1.5} onChange={(e) => updateSeries(i, { line_width: +e.target.value })} />
                </Field>
              </div>
            ))}
            {series.length === 0 && <p className="dim small">{t("ce.noSeries")}</p>}
          </Section>

          {chartType === "heatmap" && (
            <Section title={t("ce.secMatrix")}>
              <div className="ce-row">
                <Field label="Colormap">
                  <select value={grid.cmap ?? "viridis"} onChange={(e) => updateGrid({ cmap: e.target.value })}>
                    {CMAP_PRESETS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label={t("ce.origin")}>
                  <select value={grid.origin ?? "lower"} onChange={(e) => updateGrid({ origin: e.target.value as "upper" | "lower" })}>
                    <option value="lower">{t("ce.originLower")}</option>
                    <option value="upper">{t("ce.originUpper")}</option>
                  </select>
                </Field>
              </div>
              <Field label={t("ce.cbarLabel")}>
                <input type="text" value={grid.z_label ?? ""} onChange={(e) => updateGrid({ z_label: e.target.value })} placeholder="Intensity" />
              </Field>
              <div className="ce-matrix-toolbar">
                <span className="ce-matrix-size">{t("ce.rowsCols", { r: matrix.length, c: matrix[0]?.length ?? 0 })}</span>
                <div className="spacer" />
                <button onClick={addRow}>{t("ce.addRow")}</button>
                <button onClick={delRow} disabled={matrix.length <= 1}>{t("ce.delRow")}</button>
                <button onClick={addCol}>{t("ce.addCol")}</button>
                <button onClick={delCol} disabled={(matrix[0]?.length ?? 0) <= 1}>{t("ce.delCol")}</button>
              </div>
              <div className="ce-matrix">
                {matrix.map((row, r) => (
                  <div key={r} className="ce-matrix-row">
                    {row.map((val, c) => (
                      <input key={c} type="number" className="ce-matrix-cell" value={val} step="0.1" onChange={(e) => setCell(r, c, +e.target.value)} />
                    ))}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        <div className="ce-preview">
          {error && <div className="ce-error">{error}</div>}
          {previewUrl && <img src={previewUrl} alt="chart preview" className="ce-preview-img" />}
          {!previewUrl && !error && <div className="ce-placeholder">{loading ? t("ce.rendering") : t("ce.waiting")}</div>}
        </div>
      </div>
    </div>
  );
}
