// ─────────────────────────────────────────────────────────────
//  Decred network data — live metrics + historical series
//  Sources: dcrdata.decred.org/api (chain data) + CoinGecko (price)
// ─────────────────────────────────────────────────────────────

const DCRDATA_BASE = 'https://dcrdata.decred.org/api';
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

// Pre-decentralized-treasury address; its balance is folded into the treasury total.
const LEGACY_TREASURY = 'Dcur2mcGjmENx4DhNqDctW5wJCVyT3Qeqkx';

const ATOMS_PER_DCR = 1e8;
const TOTAL_SUPPLY = 21_000_000; // protocol-capped maximum

/**
 * @typedef {Object} DecredData
 * @property {number} blockHeight
 * @property {number} ticketPoolSize
 * @property {number} ticketPoolValue   DCR staked in the live ticket pool
 * @property {number} coinSupply         total mined DCR
 * @property {number} mixedPercent       StakeShuffle mixed share
 * @property {number} treasuryBalance    DCR (new + legacy treasury)
 * @property {number} treasuryMonthlyBurn
 * @property {number} price              USD
 * @property {number} marketCap          USD
 * @property {number} volume24h          USD
 * @property {number} totalSupply        21,000,000
 * @property {number} unminedSupply
 * @property {number} liquidSupply
 * @property {boolean} isLive            true when at least one source responded
 */

/** Realistic fallback so the dashboard always renders, even fully offline. */
export const FALLBACK = Object.freeze({
  blockHeight: 841_250,
  ticketPoolSize: 41_200,
  ticketPoolValue: 10_234_000,
  coinSupply: 16_150_000,
  mixedPercent: 62.5,
  treasuryBalance: 872_000,
  treasuryMonthlyBurn: 22_500,
  price: 18.45,
  marketCap: 298_000_000,
  volume24h: 4_200_000,
  totalSupply: TOTAL_SUPPLY,
  unminedSupply: 4_850_000,
  liquidSupply: 4_994_000,
  isLive: false,
});

/** Fetch JSON with an abort-based timeout. Returns null on any failure. */
async function safeFetch(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Coerce a value to a finite number, or null. */
function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Fetch the current network snapshot. Always resolves to a complete
 * DecredData object (live fields overlaid on FALLBACK); never throws.
 * @returns {Promise<DecredData>}
 */
export async function fetchDecredData() {
  const [bestBlock, stakeInfo, supply, treasuryBal, legacyTreasury, priceData] = await Promise.all([
    safeFetch(`${DCRDATA_BASE}/block/best`),
    safeFetch(`${DCRDATA_BASE}/stake/pool`),
    safeFetch(`${DCRDATA_BASE}/supply`),
    safeFetch(`${DCRDATA_BASE}/treasury/balance`),
    safeFetch(`${DCRDATA_BASE}/address/${LEGACY_TREASURY}/totals`),
    safeFetch(`${COINGECKO_BASE}/simple/price?ids=decred&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`),
  ]);

  const data = { ...FALLBACK };
  let anyLive = false;

  if (bestBlock) {
    anyLive = true;
    data.blockHeight = toNumber(bestBlock.height) ?? toNumber(bestBlock.block?.height) ?? data.blockHeight;
  }

  if (stakeInfo) {
    anyLive = true;
    data.ticketPoolSize = toNumber(stakeInfo.size) ?? toNumber(stakeInfo.pool_size) ?? data.ticketPoolSize;
    data.ticketPoolValue = toNumber(stakeInfo.value) ?? toNumber(stakeInfo.pool_value) ?? data.ticketPoolValue;
  }

  if (supply) {
    anyLive = true;
    if (typeof supply === 'number') {
      data.coinSupply = supply / ATOMS_PER_DCR; // atoms → DCR
    } else {
      const minedAtoms = toNumber(supply.supply_mined) ?? toNumber(supply.supply_total) ?? toNumber(supply.coin_supply);
      if (minedAtoms !== null) data.coinSupply = minedAtoms / ATOMS_PER_DCR;
      data.mixedPercent = toNumber(supply.mixed_percent) ?? data.mixedPercent;
    }
  }

  if (treasuryBal) {
    anyLive = true;
    if (typeof treasuryBal === 'number') {
      data.treasuryBalance = treasuryBal / ATOMS_PER_DCR;
    } else {
      const balAtoms = toNumber(treasuryBal.balance) ?? toNumber(treasuryBal.total);
      if (balAtoms !== null) data.treasuryBalance = balAtoms / ATOMS_PER_DCR;

      const spentAtoms = toNumber(treasuryBal.spent);
      const spendCount = toNumber(treasuryBal.spend_count);
      if (spentAtoms !== null && spendCount !== null && spendCount > 0) {
        data.treasuryMonthlyBurn = (spentAtoms / ATOMS_PER_DCR) / spendCount;
      }
    }
  }

  // Fold in the legacy treasury address balance.
  if (legacyTreasury) {
    const legacyBalance = toNumber(legacyTreasury.dcr_unspent);
    if (legacyBalance !== null) data.treasuryBalance += legacyBalance;
  }

  if (priceData?.decred) {
    anyLive = true;
    data.price = toNumber(priceData.decred.usd) ?? data.price;
    data.marketCap = toNumber(priceData.decred.usd_market_cap) ?? data.marketCap;
    data.volume24h = toNumber(priceData.decred.usd_24h_vol) ?? data.volume24h;
  }

  data.totalSupply = TOTAL_SUPPLY;
  data.unminedSupply = Math.max(0, data.totalSupply - data.coinSupply);
  data.liquidSupply = Math.max(0, data.coinSupply - data.ticketPoolValue - data.treasuryBalance);
  data.isLive = anyLive;

  return data;
}

// ─────────────────────────────────────────────────────────────
//  Historical series for the "Squeeze Over Time" chart
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} HistoricalPoint
 * @property {Date} date
 * @property {number} circulation
 * @property {number} staked
 * @property {number} treasury
 * @property {number} locked
 * @property {number} liquid
 * @property {number} lockedPct
 */

const atomicToDCR = (atomic) => atomic / ATOMS_PER_DCR;

/** Cumulative balance keyed by ISO date (YYYY-MM-DD) from an IO time series. */
function cumulativeByDate(io) {
  const byDate = {};
  if (io?.time) {
    let running = 0;
    for (let i = 0; i < io.time.length; i++) {
      running += io.received[i] - io.sent[i];
      byDate[io.time[i].split('T')[0]] = running;
    }
  }
  return byDate;
}

/**
 * Build a weekly-sampled history of circulating / staked / treasury / locked /
 * liquid supply. Returns [] if the core stake series is unavailable.
 * @returns {Promise<HistoricalPoint[]>}
 */
export async function fetchHistoricalData() {
  const [stakeRes, treasuryIO, legacyIO] = await Promise.all([
    safeFetch(`${DCRDATA_BASE}/chart/stake-participation?axis=time&bin=day`, 15000),
    safeFetch(`${DCRDATA_BASE}/treasury/io/day`, 15000),
    safeFetch(`${DCRDATA_BASE}/address/${LEGACY_TREASURY}/amountflow/day`, 15000),
  ]);

  if (!stakeRes?.t?.length) return [];

  const treasuryByDate = cumulativeByDate(treasuryIO);
  const legacyByDate = cumulativeByDate(legacyIO);

  const firstTreasuryDate = treasuryIO?.time?.[0]
    ? new Date(treasuryIO.time[0]).getTime()
    : new Date('2021-05-08').getTime();

  let lastNewTreasury = 0;
  let lastLegacy = 0;

  const pointAt = (i) => {
    const timestamp = stakeRes.t[i];
    const date = new Date(timestamp * 1000);
    const dateKey = date.toISOString().split('T')[0];

    if (treasuryByDate[dateKey] !== undefined) lastNewTreasury = treasuryByDate[dateKey];
    if (legacyByDate[dateKey] !== undefined) lastLegacy = legacyByDate[dateKey];

    let treasury = 0;
    if (timestamp * 1000 >= firstTreasuryDate) treasury = lastNewTreasury + lastLegacy;
    else if (lastLegacy > 0) treasury = lastLegacy;

    const circulation = atomicToDCR(stakeRes.circulation[i]);
    const staked = atomicToDCR(stakeRes.poolval[i]);
    const locked = staked + treasury;
    const liquid = circulation - locked;
    const lockedPct = circulation > 0 ? (locked / circulation) * 100 : 0;

    return { date, circulation, staked, treasury, locked, liquid, lockedPct };
  };

  // Sample every 7 days to keep the series manageable.
  const result = [];
  for (let i = 0; i < stakeRes.t.length; i += 7) result.push(pointAt(i));

  // Always include the final data point.
  const lastIdx = stakeRes.t.length - 1;
  if (lastIdx % 7 !== 0) result.push(pointAt(lastIdx));

  return result;
}

// ─────────────────────────────────────────────────────────────
//  Formatting
// ─────────────────────────────────────────────────────────────

/** Compact USD: $1.23B / $45.6M / $7.8K / $9.01 */
export function formatUSD(value) {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}
