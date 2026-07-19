#!/usr/bin/env python3

import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))

from fetcher import fetch_all_sources
from writer import process_articles
from tracker import update_published


def main():
    print("=" * 60)
    print("AniTube Buzz - Auto Publisher (Open Source AI)")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    print("\n[Step 1] Fetching sources...")
    articles = fetch_all_sources()

    if not articles:
        print("No new articles. Exiting.")
        return

    print(f"Found {len(articles)} articles")

    print("\n[Step 2] Generating articles with local GGUF model...")
    processed = process_articles(articles)

    if not processed:
        print("No articles processed. Exiting.")
        return

    print("\n[Step 3] Updating database...")
    update_published(processed)

    print(f"\nDONE! Published {len(processed)} articles")
    for a in processed:
        print(f"  - {a['slug']}")


if __name__ == "__main__":
    main()
