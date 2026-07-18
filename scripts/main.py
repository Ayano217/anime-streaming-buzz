#!/usr/bin/env python3
"""
AniTube Buzz - Main Automation Script
Orchestrates the full article generation pipeline
"""

import sys
import os
import json
from datetime import datetime

# Add scripts directory to path
sys.path.insert(0, os.path.dirname(__file__))

from fetch_sources import fetch_all_sources
from generate_article import process_articles
from dedupe import update_published


def main():
    print("=" * 50)
    print("AniTube Buzz - Auto Publisher")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)

    # Check API key
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not api_key:
        print("ERROR: OPENROUTER_API_KEY not set!")
        print("Set this in GitHub Secrets")
        sys.exit(1)

    print(f"API Key: {'*' * 8}...{api_key[-4:] if len(api_key) > 4 else '****'}")

    # Step 1: Fetch sources
    print("\n[Step 1] Fetching RSS sources...")
    articles, published = fetch_all_sources()

    if not articles:
        print("No new articles found. Exiting.")
        return

    print(f"Found {len(articles)} new articles to process")

    # Step 2: Generate articles
    print("\n[Step 2] Generating AI articles...")
    processed = process_articles(articles)

    if not processed:
        print("No articles were processed successfully. Exiting.")
        return

    # Step 3: Update published database
    print("\n[Step 3] Updating published database...")
    update_published(processed)

    # Summary
    print("\n" + "=" * 50)
    print(f"DONE! Published {len(processed)} new articles")
    for article in processed:
        print(f"  - {article['slug']}")
    print("=" * 50)


if __name__ == "__main__":
    main()
