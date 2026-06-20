import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

# Nature-ready styling parameters
plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Arial", "Helvetica", "DejaVu Sans", "sans-serif"],
    "svg.fonttype": "none",     # editable text in SVG
    "pdf.fonttype": 42,         # editable TrueType text in PDF
    "font.size": 8,             # Nature standard font size is 7-8pt
    "axes.spines.right": False,
    "axes.spines.top": False,
    "axes.linewidth": 0.8,
    "legend.frameon": False,
    "xtick.major.size": 3,
    "xtick.major.width": 0.8,
    "ytick.major.size": 3,
    "ytick.major.width": 0.8,
})

def draw_bar_chart():
    categories = ['A', 'B', 'C']
    values = [3, 5, 2]
    
    # Use Nature-inspired color palette
    # A: blue_main (#0F4D92), B: green_3 (#8BCF8B), C: red_strong (#B64342)
    colors = ['#0F4D92', '#8BCF8B', '#B64342']
    
    # Create figure (single-column width is typically 89mm, which is ~3.5 inches)
    fig, ax = plt.subplots(figsize=(3.5, 3), dpi=300)
    
    # Draw bars
    bars = ax.bar(categories, values, color=colors, width=0.55, edgecolor='none', zorder=3)
    
    # Enable subtle horizontal gridlines behind the bars
    ax.grid(axis='y', linestyle='--', linewidth=0.5, color='#CFCECE', alpha=0.5, zorder=0)
    
    # Set labels and limits
    ax.set_ylabel('Value', fontsize=9, fontweight='medium', color='#272727')
    ax.set_ylim(0, 6)
    ax.set_yticks([0, 1, 2, 3, 4, 5, 6])
    
    # Customize tick labels
    ax.tick_params(axis='both', which='major', colors='#272727', labelsize=8)
    
    # Add values on top of the bars
    for bar in bars:
        height = bar.get_height()
        ax.text(
            bar.get_x() + bar.get_width() / 2.0,
            height + 0.12,
            f'{height}',
            ha='center',
            va='bottom',
            fontsize=8,
            fontweight='bold',
            color='#272727'
        )
        
    # Adjust layout
    plt.tight_layout()
    
    # Save the figure to the project root (as requested: chart.png)
    # Also save PDF and SVG for publication completeness
    output_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(output_dir, '..'))
    
    png_path = os.path.join(project_root, 'chart.png')
    pdf_path = os.path.join(project_root, 'chart.pdf')
    svg_path = os.path.join(project_root, 'chart.svg')
    
    fig.savefig(png_path, dpi=300, bbox_inches='tight')
    fig.savefig(pdf_path, bbox_inches='tight')
    fig.savefig(svg_path, bbox_inches='tight')
    
    plt.close(fig)
    print(f"Successfully saved figures to:\n- {png_path}\n- {pdf_path}\n- {svg_path}")

if __name__ == '__main__':
    draw_bar_chart()
