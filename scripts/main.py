#!/usr/bin/env python3

import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))

from fetcher import fetch_all_sources
from writer import process_articles
from tracker import update_published


def main():
    print("=" * 50)
    print("AniTube Buzz - Auto Publisher")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)

    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not api_key:
        print("ERROR: OPENROUTER_API_KEY not set!")
        sys.exit(1)

    print("API Key: OK")

    print("\n[Step 1] Fetching RSS sources...")
    articles = fetch_all_sources()

    if not articles:
        print("No new articles found. Exiting.")
        return

    print(f"Found {len(articles)} new articles")

    print("\n[Step 2] Generating AI articles...")
    processed = process_articles(articles)

    if not processed:
        print("No articles processed. Exiting.")
        return

    print("\n[Step 3] Updating database...")
    update_published(processed)

    print(f"\nDONE! Published {len(processed)} articles")
    for article in processed:
        print(f"  - {article['slug']}")


if __name__ == "__main__":
    main()
