# FantasyFooty Plus Configured

GitHub Pages-only FPL predictor with auto-loading data, configurable strategy, football pitch view, wildcard picks, player search, comparison tool and tooltips.

## Key behaviour

- The app auto-loads `data/bootstrap-static.json`, `data/fixtures.json` and `data/metadata.json` on page load.
- You configure budget, gameweek, formation preference and strategy before clicking **Predict team**.
- The browser never calls the FPL API directly; GitHub Actions updates the JSON files.

## Strategy options

- Balanced
- Safe / reliable
- Risky / high upside
- More money up front
- Value defence
- Differential hunter

## Setup

1. Upload all files to the repository root.
2. Confirm `.github/workflows/update-fpl.yml` exists on `main`.
3. In GitHub, enable Pages from `main` / root.
4. Run **Actions > Update FPL Data > Run workflow** once.
5. Open the Pages site. Data will auto-load.
