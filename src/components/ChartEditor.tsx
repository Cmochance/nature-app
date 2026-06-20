import { useEffect, useRef, useState, type ReactNode } from "react";
import { previewPlot, toDataUrl, COLOR_PRESETS } from "../api/plotApi";
import type { PlotSpec, PlotStyle, PlotData, PlotSeries, PlotGrid } from "../types/plot";
import { CMAP_PRESETS } from "../types/plot";

const CHART_TYPES = [
  { value: "line", label: "折线图 Line" },
  { value: "bar", label: "柱状图 Bar" },
  { value: "heatmap", label: "热图 Heatmap" },
  { value: "line_dual_y", label: "双 Y 轴 Dual-Y" },
];

const FONTS = ["serif", "sans-serif", "Arial", "Times New Roman", "DejaVu Serif", "DejaVu Sans", "SimSun"];

const LEGEND_LOCS = ["best", "upper right", "upper left", "lower right", "lower left", "center"];

interface Props {
  initialSpec: PlotSpec;
  initialData: PlotData;
  onBack: () => void;
}

// ── 小工具组件 ──

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
          <button
            key={c}
            type="button"
            className={"ce-swatch" + (value === c ? " on" : "")}
            style={{ background: c }}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="ce-color-input" />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="ce-color-text" />
    </div>
  );
}

// ── 主组件 ──

export default function ChartEditor({ initialSpec, initialData, onBack }: Props) {
  const [spec, setSpec] = useState<PlotSpec>(initialSpec);
  const [data, setData] = useState<PlotData>(initialData);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const payloadRef = useRef("");

  const chartType = spec.chart_type || "line";
  const st: PlotStyle = spec.style ?? {};
  const series = data.series ?? [];

  const updateSpec = (patch: Partial<PlotSpec>) => setSpec((p) => ({ ...p, ...patch }));
  const updateStyle = (patch: Partial<PlotStyle>) =>
    setSpec((p) => ({ ...p, style: { ...p.style, ...patch } }));
  const updateSeries = (i: number, patch: Partial<PlotSeries>) =>
    setData((p) => ({ ...p, series: p.series.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));
  const updateGrid = (patch: Partial<PlotGrid>) =>
    setData((p) => ({ ...p, grid: { ...p.grid, mode: "heatmap", ...patch } }));
  // 确保 heatmap 切入时有默认 grid 数据
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

    const timer = setTimeout(async () => {
      payloadRef.current = payload;
      setLoading(true);
      setError(null);
      // heatmap 切入时如果 data.grid 不存在,注入默认矩阵
      const renderData =
        chartType === "heatmap" && !data.grid
          ? { ...data, grid: { mode: "heatmap" as const, values: [[1, 2, 3], [4, 5, 6], [7, 8, 9]], cmap: "viridis", origin: "lower" as const } }
          : data;
      try {
        const resp = await previewPlot(chartType, spec, renderData, "svg");
        setPreviewUrl(toDataUrl(resp.imageFormat, resp.imageBase64));
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
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
        <button className="link" onClick={onBack}>← 返回</button>
        <h2>图表微调</h2>
        <div className="spacer" />
        <span className={"ce-status" + (loading ? " loading" : "")}>{loading ? "渲染中…" : error ? "出错" : "已同步"}</span>
        <button onClick={() => exportChart("svg")}>导出 SVG</button>
        <button className="primary" onClick={() => exportChart("png")}>导出 PNG</button>
      </header>

      <div className="ce-body">
        {/* ── 左侧参数面板 ── */}
        <div className="ce-params">
          <Section title="全局">
            <Field label="图表类型">
              <select value={chartType} onChange={(e) => updateSpec({ chart_type: e.target.value })}>
                {CHART_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="标题">
              <input type="text" value={spec.title ?? ""} onChange={(e) => updateSpec({ title: e.target.value })} />
            </Field>
            <div className="ce-row">
              <Field label="X 轴标签">
                <input type="text" value={spec.x_label ?? ""} onChange={(e) => updateSpec({ x_label: e.target.value })} />
              </Field>
              <Field label="X 单位">
                <input type="text" value={spec.x_unit ?? ""} onChange={(e) => updateSpec({ x_unit: e.target.value })} />
              </Field>
            </div>
            <div className="ce-row">
              <Field label="Y 轴标签">
                <input type="text" value={spec.y_label ?? ""} onChange={(e) => updateSpec({ y_label: e.target.value })} />
              </Field>
              <Field label="Y 单位">
                <input type="text" value={spec.y_unit ?? ""} onChange={(e) => updateSpec({ y_unit: e.target.value })} />
              </Field>
            </div>
          </Section>

          <Section title="样式">
            <Field label="字体">
              <select value={st.font_family ?? "serif"} onChange={(e) => updateStyle({ font_family: e.target.value })}>
                {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <div className="ce-row">
              <Field label="字号">
                <input type="number" min={6} max={48} value={st.font_size ?? 12}
                  onChange={(e) => updateStyle({ font_size: +e.target.value })} />
              </Field>
              <Field label="DPI">
                <input type="number" min={72} max={600} value={st.dpi ?? 150}
                  onChange={(e) => updateStyle({ dpi: +e.target.value })} />
              </Field>
            </div>
            <div className="ce-row">
              <Field label="画布宽">
                <input type="number" min={3} max={30} step={0.5} value={st.figure_size?.[0] ?? 10}
                  onChange={(e) => updateStyle({ figure_size: [+e.target.value, st.figure_size?.[1] ?? 6] })} />
              </Field>
              <Field label="画布高">
                <input type="number" min={2} max={30} step={0.5} value={st.figure_size?.[1] ?? 6}
                  onChange={(e) => updateStyle({ figure_size: [st.figure_size?.[0] ?? 10, +e.target.value] })} />
              </Field>
            </div>
            <label className="ce-check">
              <input type="checkbox" checked={st.grid ?? true} onChange={(e) => updateStyle({ grid: e.target.checked })} />
              <span>网格</span>
            </label>
            {st.grid !== false && (
              <Field label={`网格透明度 ${st.grid_alpha ?? 0.3}`}>
                <input type="range" min={0} max={1} step={0.05} value={st.grid_alpha ?? 0.3}
                  onChange={(e) => updateStyle({ grid_alpha: +e.target.value })} />
              </Field>
            )}
          </Section>

          <Section title="图例 & 边框">
            <label className="ce-check">
              <input type="checkbox" checked={st.legend?.enabled ?? true}
                onChange={(e) => updateStyle({ legend: { ...st.legend, enabled: e.target.checked } })} />
              <span>显示图例</span>
            </label>
            {st.legend?.enabled !== false && (
              <Field label="图例位置">
                <select value={st.legend?.location ?? "best"}
                  onChange={(e) => updateStyle({ legend: { ...st.legend, location: e.target.value } })}>
                  {LEGEND_LOCS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
            )}
            <label className="ce-check">
              <input type="checkbox" checked={st.spines?.enabled ?? true}
                onChange={(e) => updateStyle({ spines: { ...st.spines, enabled: e.target.checked } })} />
              <span>显示边框</span>
            </label>
            {st.spines?.enabled !== false && (
              <div className="ce-row">
                <Field label="边框宽度">
                  <input type="number" min={0} max={5} step={0.1} value={st.spines?.width ?? 1.2}
                    onChange={(e) => updateStyle({ spines: { ...st.spines, width: +e.target.value } })} />
                </Field>
                <Field label="边框颜色">
                  <ColorPicker value={st.spines?.color ?? "#333"}
                    onChange={(v) => updateStyle({ spines: { ...st.spines, color: v } })} />
                </Field>
              </div>
            )}
          </Section>

          <Section title={`数据序列 (${series.length})`}>
            {series.map((s, i) => (
              <div key={i} className="ce-series">
                <div className="ce-series-head">
                  <input type="checkbox" checked={s.visible ?? true}
                    onChange={(e) => updateSeries(i, { visible: e.target.checked })} />
                  <input type="text" className="ce-series-name" value={s.name}
                    onChange={(e) => updateSeries(i, { name: e.target.value })} />
                </div>
                <Field label="颜色">
                  <ColorPicker value={s.color ?? "#1a1a1a"} onChange={(v) => updateSeries(i, { color: v })} />
                </Field>
                <Field label={`线宽 ${s.line_width ?? 1.5}`}>
                  <input type="range" min={0.5} max={5} step={0.25} value={s.line_width ?? 1.5}
                    onChange={(e) => updateSeries(i, { line_width: +e.target.value })} />
                </Field>
              </div>
            ))}
            {series.length === 0 && <p className="dim small">无数据序列。</p>}
          </Section>

          {chartType === "heatmap" && (
            <Section title="热图矩阵">
              <div className="ce-row">
                <Field label="Colormap">
                  <select value={grid.cmap ?? "viridis"} onChange={(e) => updateGrid({ cmap: e.target.value })}>
                    {CMAP_PRESETS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="原点">
                  <select value={grid.origin ?? "lower"} onChange={(e) => updateGrid({ origin: e.target.value as "upper" | "lower" })}>
                    <option value="lower">lower(左下)</option>
                    <option value="upper">upper(左上)</option>
                  </select>
                </Field>
              </div>
              <Field label="Colorbar 标签">
                <input type="text" value={grid.z_label ?? ""} onChange={(e) => updateGrid({ z_label: e.target.value })} placeholder="Intensity" />
              </Field>
              <div className="ce-matrix-toolbar">
                <span className="ce-matrix-size">{matrix.length}行 × {matrix[0]?.length ?? 0}列</span>
                <div className="spacer" />
                <button onClick={addRow}>+ 行</button>
                <button onClick={delRow} disabled={matrix.length <= 1}>- 行</button>
                <button onClick={addCol}>+ 列</button>
                <button onClick={delCol} disabled={(matrix[0]?.length ?? 0) <= 1}>- 列</button>
              </div>
              <div className="ce-matrix">
                {matrix.map((row, r) => (
                  <div key={r} className="ce-matrix-row">
                    {row.map((val, c) => (
                      <input
                        key={c}
                        type="number"
                        className="ce-matrix-cell"
                        value={val}
                        step="0.1"
                        onChange={(e) => setCell(r, c, +e.target.value)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* ── 右侧预览 ── */}
        <div className="ce-preview">
          {error && <div className="ce-error">{error}</div>}
          {previewUrl && (
            <img src={previewUrl} alt="chart preview" className="ce-preview-img" />
          )}
          {!previewUrl && !error && <div className="ce-placeholder">{loading ? "渲染中…" : "等待渲染"}</div>}
        </div>
      </div>
    </div>
  );
}
