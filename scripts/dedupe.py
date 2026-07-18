#!/usr/bin/env python3
"""
AniTube Buzz - Duplicate Detection
Prevents publishing duplicate articles
"""

import json
import os
from datetime import datetime


def load_published():
    """Load published articles database"""
    published_path = os.path.join(
        os.path.dirname(__file__), '..', 'data', 'published.json'
    )
    try:
        with open(published_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return {
            "published_urls": [],
            "published_titles": [],
            "last_run": ""
        }


def update_published(processed_articles):
    """Update published database with new articles"""
    published_path = os.path.join(
        os.path.dirname(__file__), '..', 'data', 'published.json'
    )

    published = load_published()

    for article in processed_articles:
        url = article.get('url', '')
        title = article.get('title', '')

        if url and url not in published['published_urls']:
            published['published_urls'].append(url)

        if title and title not in published['published_titles']:
            published['published_titles'].append(title)

    # Keep only last 500 entries to prevent file bloat
    published['published_urls'] = published['published_urls'][-500:]
    published['published_titles'] = published['published_titles'][-500:]
    published['last_run'] = datetime.now().isoformat()

    with open(published_path, 'w', encoding='utf-8') as f:
        json.dump(published, f, indent=2, ensure_ascii=False)

    print(f"Updated published database: {len(published['published_urls'])} URLs tracked")


def is_duplicate(title, url, published):
    """Check if article is duplicate"""
    if url in published.get('published_urls', []):
        return True

    if title in published.get('published_titles', []):
        return True

    # Fuzzy check - similar titles
    title_lower = title.lower()
    for pub_title in published.get('published_titles', []):
        pub_lower = pub_title.lower()
        if title_lower[:40] == pub_lower[:40]:
            return True

    return False


if __name__ == "__main__":
    data = load_published()
    print(f"Tracked URLs: {len(data['published_urls'])}")
    print(f"Tracked titles: {len(data['published_titles'])}")
    print(f"Last run: {data['last_run']}")
