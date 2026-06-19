// ─────────────────────────────────────────────────────────────
//  Maps a DecredData snapshot onto the static DOM, and runs the
//  reveal animations (hero count-up, bar fills, new-block glitch).
//  Every derived metric mirrors the original App.tsx computations.
// ─────────────────────────────────────────────────────────────

import { formatUSD } from './api.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };
const setHTML = (id, v) => { const el = $(id); if (el) el.innerHTML = v; };
const setWidth = (id, pct) => { const el = $(id); if (el) el.style.width = `${pct}%`; };

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const intFmt = new Intl.NumberFormat('en-US'); // comma grouping, locale-independent

/** rAF count-up with ease-out cubic, matching the original 1800ms hero animation. */
function countUp(el, target, duration = 1800) {
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - (1 - p) ** 3;
    el.textContent = (eased * target).toFixed(1);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * @param {import('./api.js').DecredData} data
 * @param {{ firstReveal?: boolean }} [opts]
 */
export function hydrate(data, { firstReveal = false } = {}) {
  const {
    blockHeight, ticketPoolSize, ticketPoolValue, coinSupply, mixedPercent,
    treasuryBalance, treasuryMonthlyBurn, price, marketCap, volume24h,
    totalSupply, unminedSupply, liquidSupply, isLive,
  } = data;

  // ── Derived metrics (verbatim from App.tsx) ──
  const totalMined = coinSupply;
  const totalLocked = ticketPoolValue + treasuryBalance;
  const lockedPctOfMined = totalMined > 0 ? (totalLocked / totalMined) * 100 : 0;
  const lockedRatio = liquidSupply > 0 ? (totalLocked / liquidSupply).toFixed(1) : '0.0';

  const nextReductionBlock = Math.ceil((blockHeight || 1) / 6144) * 6144;
  const minutesToReduction = (nextReductionBlock - (blockHeight || 0)) * 5;
  const daysToReduction = Math.floor(minutesToReduction / (24 * 60));
  const hoursToReduction = Math.floor((minutesToReduction % (24 * 60)) / 60);

  const liquidDisplay = (liquidSupply / 1e6).toFixed(2);
  const totalMinedDisplay = (totalMined / 1e6).toFixed(1);

  const stakedPct = (ticketPoolValue / totalSupply) * 100;
  const treasuryPct = (treasuryBalance / totalSupply) * 100;
  const liquidPct = (liquidSupply / totalSupply) * 100;
  const minedShare = totalMined / totalSupply; // for legend "% of mined" reconversion

  const burn = treasuryMonthlyBurn || 22500;
  const liquidMcap = (liquidSupply * price) / 1e6;
  const mcap = marketCap / 1e6;

  // ── Header ──
  setText('block-height', intFmt.format(Math.round(blockHeight)));
  setText('current-date', dateFmt.format(new Date()));
  const status = $('header-status');
  if (status) {
    status.classList.toggle('offline', !isLive);
    status.innerHTML = isLive
      ? '<span class="live-dot"></span>Live &middot; dcrdata.decred.org'
      : '<span class="live-dot"></span>Reconnecting&hellip;';
  }

  // ── Hero ──
  const heroVal = $('hero-pct-value');
  if (heroVal) {
    // Animate only when visible — rAF is paused in hidden tabs, so set the
    // final value directly there (and for reduced-motion) to avoid a stale 0.0.
    if (firstReveal && !reduceMotion && !document.hidden) countUp(heroVal, lockedPctOfMined);
    else heroVal.textContent = lockedPctOfMined.toFixed(1);
  }
  setText('hero-total-mined', totalMinedDisplay);
  setText('hero-liquid', liquidDisplay);

  // ── Ratio ──
  setText('ratio-locked', lockedRatio);

  // ── Ticker ──
  setText('tk-price', formatUSD(price));
  setText('tk-mcap', `$${mcap.toFixed(0)}M`);
  setText('tk-vol', `$${(volume24h / 1e6).toFixed(2)}M`);
  setText('tk-liqmcap', `$${liquidMcap.toFixed(0)}M`);
  setText('tk-emission', `${daysToReduction}d ${hoursToReduction}h`);

  // ── Squeeze bar ──
  setText('sq-staked-val', `${(ticketPoolValue / 1e6).toFixed(1)}M`);
  setText('sq-unmined-val', `${(unminedSupply / 1e6).toFixed(1)}M`);
  setText('sq-liquid-val', liquidDisplay);
  setText('sq-treasury-val', (treasuryBalance / 1e3).toFixed(0));
  setWidth('sq-staked', stakedPct);
  setWidth('sq-treasury', treasuryPct);
  setWidth('sq-liquid', liquidPct);

  const liqLabel = $('sq-liquid-label');
  const trsLabel = $('sq-treasury-label');
  if (liqLabel) liqLabel.style.left = `${stakedPct + treasuryPct + liquidPct / 2}%`;
  if (trsLabel) trsLabel.style.left = `${stakedPct + treasuryPct / 2}%`;
  if (firstReveal) { liqLabel?.classList.add('show'); trsLabel?.classList.add('show'); }

  setText('lg-staked', (stakedPct / minedShare).toFixed(1));
  setText('lg-treasury', (treasuryPct / minedShare).toFixed(1));
  setText('lg-liquid', (liquidPct / minedShare).toFixed(1));

  // ── Why this matters ──
  setText('why-locked-pct', lockedPctOfMined.toFixed(0));
  setText('why-liq-mcap', liquidMcap.toFixed(0));
  setText('why-mcap', mcap.toFixed(0));

  // ── Comparison: cross-chain ──
  setText('cmp-dcr-pct', lockedPctOfMined.toFixed(1));
  setWidth('cmp-dcr-bar', lockedPctOfMined);
  if (firstReveal) {
    document.querySelectorAll('.compare-bar-fill[data-fill]').forEach((el) => {
      el.style.width = `${el.dataset.fill}%`;
    });
  }

  // ── Comparison: dilution ──
  setText('dil-dcr-circ', ((coinSupply / totalSupply) * 100).toFixed(1));
  setText('dil-dcr-mcap', mcap.toFixed(0));
  setText('dil-dcr-fdv', ((totalSupply * price) / 1e6).toFixed(0));

  // ── Network fundamentals ──
  setText('m-stake-val', ((ticketPoolValue / coinSupply) * 100).toFixed(1));
  setText('m-stake-sub', (ticketPoolValue / 1e6).toFixed(1));
  setText('m-runway-mo', Math.floor(treasuryBalance / burn));
  setText('m-runway-yr', (treasuryBalance / burn / 12).toFixed(1));
  setHTML('m-treasury-sub',
    `${(treasuryBalance / 1e3).toFixed(1)}K DCR &middot; <span class="hl">${formatUSD(treasuryBalance * price)}</span>`);
  setText('m-pool-size', intFmt.format(Math.round(ticketPoolSize)));
  setText('m-pool-pct', `${((ticketPoolSize / 40960) * 100).toFixed(0)}%`);
  setText('m-mix-val', (mixedPercent || 0).toFixed(1));

  // ── Closing ──
  setText('cl-locked-pct', ((ticketPoolValue / coinSupply) * 100).toFixed(0));
  setText('cl-liquid-pct', ((liquidSupply / coinSupply) * 100).toFixed(1));
}

/** Flash the hero glitch animation (called when a new block arrives). */
export function flashNewBlock() {
  if (reduceMotion) return;
  const hero = $('hero-number');
  if (!hero) return;
  hero.classList.remove('glitch-anim');
  void hero.offsetWidth; // restart the animation
  hero.classList.add('glitch-anim');
  hero.addEventListener('animationend', () => hero.classList.remove('glitch-anim'), { once: true });
}
