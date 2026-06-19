// ─────────────────────────────────────────────────────────────
//  Self-contained canvas line chart for the historical supply view.
//  Replaces Chart.js + date-fns — no external runtime dependency.
// ─────────────────────────────────────────────────────────────

import { fetchHistoricalData } from './api.js';

// Terminal / Carbon palette (mirrors css/styles.css; canvas needs literal colors).
const C = {
  teal: '#009d9a',
  tealFill: 'rgba(0, 157, 154, 0.12)',
  red: '#fa4d56',
  redFill: 'rgba(250, 77, 86, 0.08)',
  white25: 'rgba(244, 244, 244, 0.25)',
  white40: 'rgba(244, 244, 244, 0.40)',
  white15: 'rgba(244, 244, 244, 0.15)',
  white08: 'rgba(244, 244, 244, 0.08)',
};
const FONT = "10px 'IBM Plex Mono', ui-monospace, monospace";
const ASPECT = 2.8;
const PAD = { top: 14, right: 14, bottom: 26, left: 50 };

const dateFmt = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

// "Nice" axis ticks (Heckbert's algorithm).
function niceNum(range, round) {
  const exp = Math.floor(Math.log10(range));
  const frac = range / 10 ** exp;
  let nice;
  if (round) nice = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
  else nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nice * 10 ** exp;
}
function niceTicks(min, max, count = 5) {
  const range = niceNum(max - min || 1, false);
  const step = niceNum(range / (count - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) ticks.push(v);
  return { min: niceMin, max: niceMax, ticks };
}

class LineChart {
  /** @param {HTMLCanvasElement} canvas @param {import('./api.js').HistoricalPoint[]} points */
  constructor(canvas, points) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.points = points;
    this.hoverIdx = -1;
    this.tooltip = this.#buildTooltip();

    // Drawn back-to-front (matches the original dataset order semantics).
    this.series = [
      { key: 'circulation', stroke: C.white25, fill: null, width: 1, dash: [4, 4] },
      { key: 'locked', stroke: C.teal, fill: C.tealFill, width: 2.5, dash: [] },
      { key: 'liquid', stroke: C.red, fill: C.redFill, width: 1.5, dash: [] },
    ];

    const xs = points.map((p) => p.date.getTime());
    this.xMin = Math.min(...xs);
    this.xMax = Math.max(...xs);
    const maxVal = Math.max(...points.map((p) => Math.max(p.circulation, p.locked, p.liquid)));
    const y = niceTicks(0, maxVal);
    this.yMin = y.min;
    this.yMax = y.max;
    this.yTicks = y.ticks;

    this.#resize();
    this.ro = new ResizeObserver(() => this.#resize());
    this.ro.observe(canvas.parentElement);

    canvas.addEventListener('pointermove', this.#onMove);
    canvas.addEventListener('pointerleave', this.#onLeave);
  }

  destroy() {
    this.ro?.disconnect();
    this.canvas.removeEventListener('pointermove', this.#onMove);
    this.canvas.removeEventListener('pointerleave', this.#onLeave);
    this.tooltip.remove();
  }

  #buildTooltip() {
    const el = document.createElement('div');
    el.className = 'chart-tooltip';
    el.hidden = true;
    this.canvas.parentElement.appendChild(el);
    return el;
  }

  #resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.canvas.clientWidth || this.canvas.parentElement.clientWidth;
    const cssH = Math.round(cssW / ASPECT);
    this.w = cssW;
    this.h = cssH;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.height = `${cssH}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.#draw();
  }

  #x(t) {
    const { left, right } = PAD;
    return left + ((t - this.xMin) / (this.xMax - this.xMin)) * (this.w - left - right);
  }
  #y(v) {
    const { top, bottom } = PAD;
    return this.h - bottom - ((v - this.yMin) / (this.yMax - this.yMin)) * (this.h - top - bottom);
  }

  #draw() {
    const { ctx, w, h, points } = this;
    ctx.clearRect(0, 0, w, h);
    const baseline = this.#y(this.yMin);

    // Horizontal gridlines + y labels.
    ctx.font = FONT;
    ctx.textBaseline = 'middle';
    for (const v of this.yTicks) {
      const py = this.#y(v);
      ctx.strokeStyle = C.white08;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD.left, py + 0.5);
      ctx.lineTo(w - PAD.right, py + 0.5);
      ctx.stroke();
      ctx.fillStyle = C.white40;
      ctx.textAlign = 'right';
      ctx.fillText(`${(v / 1e6).toFixed(1)}M`, PAD.left - 8, py);
    }

    // Year ticks along the x-axis.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const startYear = new Date(this.xMin).getFullYear() + 1;
    const endYear = new Date(this.xMax).getFullYear();
    for (let yr = startYear; yr <= endYear; yr++) {
      const t = new Date(yr, 0, 1).getTime();
      if (t < this.xMin || t > this.xMax) continue;
      const px = this.#x(t);
      ctx.fillStyle = C.white40;
      ctx.fillText(String(yr), px, h - PAD.bottom + 8);
    }

    // Axis borders.
    ctx.strokeStyle = C.white15;
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top);
    ctx.lineTo(PAD.left, h - PAD.bottom);
    ctx.lineTo(w - PAD.right, h - PAD.bottom);
    ctx.stroke();

    // Series (fills first, then strokes), back-to-front.
    for (const s of this.series) {
      ctx.beginPath();
      points.forEach((p, i) => {
        const px = this.#x(p.date.getTime());
        const py = this.#y(p[s.key]);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      if (s.fill) {
        ctx.save();
        ctx.lineTo(this.#x(this.xMax), baseline);
        ctx.lineTo(this.#x(this.xMin), baseline);
        ctx.closePath();
        ctx.fillStyle = s.fill;
        ctx.fill();
        ctx.restore();
        // Re-trace the line path for a clean stroke.
        ctx.beginPath();
        points.forEach((p, i) => {
          const px = this.#x(p.date.getTime());
          const py = this.#y(p[s.key]);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        });
      }
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.width;
      ctx.setLineDash(s.dash);
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (this.hoverIdx >= 0) this.#drawHover();
  }

  #drawHover() {
    const { ctx, points } = this;
    const p = points[this.hoverIdx];
    const px = this.#x(p.date.getTime());

    ctx.strokeStyle = C.white15;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 0.5, PAD.top);
    ctx.lineTo(px + 0.5, this.h - PAD.bottom);
    ctx.stroke();

    for (const s of this.series) {
      const py = this.#y(p[s.key]);
      ctx.beginPath();
      ctx.arc(px, py, s.key === 'locked' ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = s.stroke;
      ctx.fill();
    }
  }

  #onMove = (e) => {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let best = -1;
    let bestDist = Infinity;
    this.points.forEach((p, i) => {
      const d = Math.abs(this.#x(p.date.getTime()) - mx);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    if (best !== this.hoverIdx) {
      this.hoverIdx = best;
      this.#draw();
    }
    this.#positionTooltip();
  };

  #onLeave = () => {
    this.hoverIdx = -1;
    this.tooltip.hidden = true;
    this.#draw();
  };

  #positionTooltip() {
    const p = this.points[this.hoverIdx];
    const liqPct = p.circulation > 0 ? (p.liquid / p.circulation) * 100 : 0;
    const row = (color, label) =>
      `<div class="ct-row"><span class="ct-dot" style="background:${color}"></span>${label}</div>`;
    this.tooltip.innerHTML =
      `<div class="ct-title">${dateFmt.format(p.date)}</div>` +
      row(C.white25, `Circulating: ${intFmt.format(p.circulation)} DCR`) +
      row(C.teal, `Locked: ${intFmt.format(p.locked)} DCR (${p.lockedPct.toFixed(1)}%)`) +
      row(C.red, `Liquid: ${intFmt.format(p.liquid)} DCR (${liqPct.toFixed(1)}%)`);
    this.tooltip.hidden = false;

    const px = this.#x(p.date.getTime());
    const offX = this.canvas.offsetLeft;
    const offY = this.canvas.offsetTop;
    const tipW = this.tooltip.offsetWidth;
    let left = offX + px + 16;
    if (px + 16 + tipW > this.w) left = offX + px - tipW - 16; // flip if no room right
    this.tooltip.style.left = `${Math.max(offX, left)}px`;
    this.tooltip.style.top = `${offY + PAD.top}px`;
  }
}

/** Load history and mount the chart, or hide the section on failure. */
export async function initChart() {
  const section = document.getElementById('chart-section');
  const loading = document.getElementById('chart-loading');
  const canvas = document.getElementById('chart-canvas');
  if (!section || !canvas) return;

  let points = [];
  try {
    points = await fetchHistoricalData();
  } catch {
    points = [];
  }

  if (!points.length) {
    section.hidden = true; // chart is supplementary — fail silently
    return;
  }

  loading?.remove();
  canvas.hidden = false;
  document.getElementById('chart-legend')?.removeAttribute('hidden');
  new LineChart(canvas, points);
}
