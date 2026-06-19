// ─────────────────────────────────────────────────────────────
//  Entry point: first load → reveal, then poll every 30s.
// ─────────────────────────────────────────────────────────────

import { fetchDecredData, FALLBACK } from './api.js';
import { hydrate, flashNewBlock } from './hydrate.js';
import { initChart } from './chart.js';

const POLL_INTERVAL = 30_000;

let prevBlockHeight = null;
let revealed = false;

async function update() {
  // fetchDecredData is fallback-merged and shouldn't throw; guard anyway so a
  // surprise failure can never leave the splash hanging forever.
  let data;
  try {
    data = await fetchDecredData();
  } catch {
    data = { ...FALLBACK };
  }
  const firstReveal = !revealed;

  if (firstReveal) {
    reveal(data);
  } else {
    hydrate(data, { firstReveal: false });
    if (prevBlockHeight !== null && data.blockHeight > prevBlockHeight) flashNewBlock();
  }

  prevBlockHeight = data.blockHeight;
}

function reveal(data) {
  revealed = true;
  const splash = document.getElementById('splash');
  const dashboard = document.getElementById('dashboard');

  splash?.remove();
  dashboard.hidden = false;

  // Commit the width:0% baseline (a forced reflow) before hydrate sets the
  // target widths, so the CSS width transitions play on first reveal — without
  // gating hydration on requestAnimationFrame (which is paused in hidden tabs).
  void dashboard.offsetHeight;
  hydrate(data, { firstReveal: true });

  initChart(); // loads history independently; hides its section on failure
}

update();
setInterval(update, POLL_INTERVAL);
