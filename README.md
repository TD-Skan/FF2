# FantasyFooty

A GitHub Pages-only Fantasy Premier League squad predictor.

This version avoids browser CORS problems by **not calling the FPL API from the browser**. Instead, a GitHub Action downloads the FPL JSON data into the repository. The website then reads:

```text
./data/bootstrap-static.json
./data/fixtures.json
```

## Folder tree

```text
FantasyFooty/
├── index.html
├── style.css
├── script.js
├── README.md
├── .nojekyll
├── data/
│   ├── bootstrap-static.json
│   └── fixtures.json
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

## How to publish

1. Create a new GitHub repository.
2. Upload everything in this folder into the repository root.
3. Go to **Settings > Pages**.
4. Set source to branch `main` and folder `/root`.
5. Go to **Actions > Update FPL Data > Run workflow** once.
6. Refresh your GitHub Pages site and click **Load data**.

## Why this avoids CORS

GitHub Pages serves the JSON files from the same origin as the website. The browser loads local repository files instead of directly calling the FPL API.

## Prediction model

The score uses:

- expected next points
- expected this points
- form
- points per game
- fixture difficulty
- minutes played
- chance of playing
- selected-by percentage

It then builds a legal 15-player squad within budget and picks the best starting XI.

## Important

This is a transparent learning model, not official FPL advice.
