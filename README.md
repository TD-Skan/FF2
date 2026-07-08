# FantasyFooty Plus

A GitHub Pages-only Fantasy Premier League predictor with:

- football pitch line-up view
- wildcard picks: differentials, value picks and high-upside picks
- player search and stat panel
- two-player comparison tool
- starting XI and full squad tables
- CSV export
- GitHub Action that updates FPL JSON data nightly

## Repository tree

```text
FantasyFooty/
├── index.html
├── style.css
├── script.js
├── README.md
├── .nojekyll
├── data/
│   ├── bootstrap-static.json
│   ├── fixtures.json
│   └── metadata.json
├── assets/
│   ├── logo.png
│   ├── icon-192.png
│   └── icon-512.png
├── exports/
│   └── .gitkeep
└── .github/
    └── workflows/
        └── update-fpl.yml
```

## Setup

1. Upload all files to the root of your GitHub repository.
2. Make sure `.github/workflows/update-fpl.yml` is present on the `main` branch.
3. Go to **Settings > Pages** and publish from `main` / root.
4. Go to **Actions > Update FPL Data > Run workflow** once.
5. Open the Pages site, click **Load data**, then **Predict team**.

## Why this works on GitHub Pages

The browser reads local JSON files from the repository:

```text
./data/bootstrap-static.json
./data/fixtures.json
./data/metadata.json
```

The browser does not call the FPL API directly, which avoids CORS errors.
