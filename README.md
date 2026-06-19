# DECRED.SUPPLY — Network Dashboard

> **"No VCs. No pre-mine. Just code."**

A live, cinematic dashboard for the Decred network, focusing on strictly enforced protocol constraints:

* **Network Health**: Real-time ticker and network stats (stake participation, treasury runway, ticket pool metrics)
* **Protocol-Enforced Lockup**: Visualizes total minted supply versus strictly locked DCR (PoS tickets + treasury)
* **Cross-Chain Comparisons**: Shows how Decred's fair distribution compares to VC-heavy or pure-PoW networks

## Live Preview

Explore the live dashboard at [decred.supply](https://decred.supply/).

## Architecture — buildless

There is **no build step**. The site is plain static files — hand-written HTML, CSS, and
native ES-module JavaScript — with **zero runtime dependencies** (no React, no Vite, no
bundler, no Chart.js). The historical chart is drawn on a `<canvas>` by hand.

```
index.html               # markup + meta
dcr.svg, favicon.ico     # site icons (kept at root)
CNAME                    # custom-domain mapping
assets/
  css/styles.css         # one stylesheet
  images/                # Decred logo
  js/
    api.js               # data fetching + fallback + formatting
    chart.js             # custom canvas line chart + historical loader
    hydrate.js           # writes live data into the DOM + animations
    main.js              # entry point: first load, reveal, 30s polling
```

## Running locally

ES modules and `fetch` require HTTP (they don't work from a `file://` URL), so serve the
folder with any static server:

```bash
# Python (built in)
python3 -m http.server 8080

# …or Node
npx serve .
```

Then open <http://localhost:8080/>.

## Deployment (GitHub Pages)

No build or `gh-pages` package needed — just serve the repository root:

1. Push your changes.
2. In **Settings → Pages**, set the source to your branch and the **`/` (root)** folder.
3. The `CNAME` file at the repo root keeps the `decred.supply` custom domain mapped.

Any static host (Netlify, Cloudflare Pages, S3, nginx) works the same way: point it at the
repo root, no build command.

## Data Sources

* Live network metrics: `dcrdata.decred.org/api`
* Price, market cap & volume: CoinGecko API

If a source is unreachable, the dashboard renders from built-in fallback estimates and the
header shows a dimmed "reconnecting" state instead of failing.
