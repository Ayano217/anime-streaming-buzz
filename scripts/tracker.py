#!/usr/bin/env python3

import json
import os
from datetime import datetime


def update_published(processed_articles):
    path = os.path.join(
        os.path.dirname(__file__), '..', 'data', 'published.json'
    )

    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except:
        data = {"published_urls": [], "published_titles": [], "last_run": ""}

    for article in processed_articles:
        url = article.get('url', '')
        title = article.get('title', '')
        if url and url not in data['published_urls']:
            data['published_urls'].append(url)
        if title and title not in data['published_titles']:
            data['published_titles'].append(title)

    data['published_urls'] = data['published_urls'][-500:]
    data['published_titles'] = data['published_titles'][-500:]
    data['last_run'] = datetime.now().isoformat()

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Database updated: {len(data['published_urls'])} URLs tracked")
