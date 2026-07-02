name: Daily article fetch

on:
  schedule:
    # 23:00 UTC = 06:00 the next day in Paris (CEST, UTC+2) — adjust as you like
    - cron: "0 23 * * *"
  workflow_dispatch: {}   # lets you trigger a manual run from the Actions tab

permissions:
  contents: write

jobs:
  fetch-and-publish:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install dependencies
        run: pip install -r scripts/requirements.txt

      - name: Fetch latest articles
        run: python scripts/fetch_articles.py

      - name: Commit and push if there are changes
        run: |
          git config user.name "asean-tracker-bot"
          git config user.email "actions@users.noreply.github.com"
          git add docs/data/articles.json docs/data/last_run.json
          if git diff --cached --quiet; then
            echo "No new articles today."
          else
            git commit -m "Daily update: $(date -u +'%Y-%m-%d')"
            git push
          fi
