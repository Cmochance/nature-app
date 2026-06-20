# Backend: Python (matplotlib / seaborn)

**Python-only execution rule.** When the user has selected Python, do all figure drawing, previewing, exporting, and visual QA in Python. Do not call R/ggplot2, ComplexHeatmap, patchwork, or any R graphics device to create a temporary preview, fallback export, or layout approximation. If Python or required Python plotting packages are missing, stop before rendering and report the missing dependency. You may still write the Python script, provide `pip`/environment install commands, or ask permission to install dependencies, but do not cross-render the figure in R.

## Python quick-start

```python
import matplotlib as mpl
import matplotlib.pyplot as plt

mpl.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Arial", "Helvetica", "DejaVu Sans", "sans-serif"],
    "svg.fonttype": "none",     # editable text in SVG
    "pdf.fonttype": 42,         # editable TrueType text in PDF
    "font.size": 7,             # use 15-24 only for large slide-sized panels
    "axes.spines.right": False,
    "axes.spines.top": False,
    "axes.linewidth": 0.8,
    "legend.frameon": False,
})

def save_pub_py(fig, filename, dpi=600):
    fig.savefig(f"{filename}.svg", bbox_inches="tight")
    fig.savefig(f"{filename}.pdf", bbox_inches="tight")
    fig.savefig(f"{filename}.tiff", dpi=dpi, bbox_inches="tight")
```

Use `text.usetex = True` only when LaTeX is installed and math-rich labels are required.

## Export plot parameters (mandatory)

Every figure script must also emit `plot_spec.json` and `plot_data.json` alongside the rendered image. These two files let the Nature App chart editor adjust visual details (colors, fonts, line widths, axis ranges, legend, spines) in real time via local matplotlib re-rendering — no LLM round-trip needed.

```python
import json

def export_plot_params(spec: dict, data: dict, prefix: str = ""):
    """Export structured parameters for the Nature App chart editor."""
    with open(f"{prefix}plot_spec.json", "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False, indent=2)
    with open(f"{prefix}plot_data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
```

Call `export_plot_params(spec, data)` at the end of the script, right before or after `save_pub_py`. The `spec` and `data` dicts must follow this schema (camelCase keys are optional in the Python dict; the editor reads snake_case as shown):

**`plot_spec` — all visual parameters that can be fine-tuned:**

```json
{
  "schema_version": 1,
  "chart_type": "line",
  "title": "Figure title",
  "x_label": "Time", "y_label": "Absorbance",
  "x_unit": "s", "y_unit": "a.u.",
  "style": {
    "figure_size": [8, 5], "dpi": 150,
    "font_family": "serif", "font_size": 12,
    "grid": true, "grid_alpha": 0.3,
    "legend": {"enabled": true, "location": "best"},
    "spines": {"enabled": true, "width": 1.2, "color": "#333333"}
  }
}
```

**`plot_data` — the actual plotted series:**

```json
{
  "schema_version": 1,
  "series": [
    {"name": "Sample A", "x": [0, 1, 2, 3], "y": [0.1, 0.5, 0.8, 0.3],
     "color": "#1a1a1a", "line_width": 2.0, "visible": true},
    {"name": "Sample B", "x": [0, 1, 2, 3], "y": [0.2, 0.6, 0.9, 0.4],
     "color": "#c73e3a", "line_width": 1.5, "visible": true}
  ]
}
```

Set `chart_type` to `"line"`, `"bar"`, `"heatmap"`, or `"line_dual_y"` so the editor loads the correct render template. Extract `x` and `y` arrays from the same data you plotted. If a panel has many series, include only the major ones (the editor is for style fine-tuning, not data exploration). For multi-panel figures, export the parameters of the primary panel.

## Going deeper

- `references/api.md` — Python PALETTE, helper function signatures, validation rules.
- `references/common-patterns.md` — hero panels, legend-only axes, dark image plates, asymmetric layouts.
- `references/chart-types.md` — radar, 3D sphere, fill_between, scatter patterns.
- `references/tutorials.md` — end-to-end walkthroughs for bars, trends, heatmaps.
- `references/demos.md` — bundled figures4papers Python scripts and output previews.
