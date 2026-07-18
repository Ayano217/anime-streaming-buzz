#!/usr/bin/env python3
"""
AniTube Buzz - RSS Feed Fetcher
Fetches anime news from RSS feeds
"""

import feedparser
import requests
import json
import os
import re
from datetime import datetime, timezone
from dateutil import parser as dateparser


def load_sources():
    """Load source configuration"""
    sources_path = os.path.join(
        os.path.dirname(__file__), '..', 'data', 'sources.json'
    )
    with open(sources_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_published():
    """Load already published articles"""
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


def save_published(data):
    """Save published articles list"""
    published_path = os.path.join(
        os.path.dirname(__file__), '..', 'data', 'published.json'
    )
    with open(published_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def clean_html(text):
    """Remove HTML tags from text"""
    if not text:
        return ""
    clean = re.sub(r'<[^>]+>', '', text)
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean


def is_anime_related(title, summary):
    """Check if content is anime/manga/manhwa related"""
    keywords = [
        'anime', 'manga', 'manhwa', 'webtoon', 'crunchyroll',
        'funimation', 'netflix anime', 'one piece', 'naruto',
        'demon slayer', 'attack on titan', 'jujutsu', 'solo leveling',
        'blue lock', 'chainsaw man', 'my hero academia', 'mha',
        'bleach', 'dragon ball', 'hunter x hunter', 'hxh',
        'fullmetal', 'sword art', 'danmachi', 're:zero',
        'season', 'episode', 'chapter', 'adaptation', 'simulcast',
        'ova', 'movie', 'film', 'studio', 'mappa', 'wit', 'ufotable',
        'manhwa', 'korean webtoon', 'light novel'
    ]
    text = f"{title} {summary}".lower()
    return any(kw in text for kw in keywords)


def fetch_rss_feed(source):
    """Fetch and parse a single RSS feed"""
    articles = []

    try:
        print(f"Fetching: {source['name']}")

        headers = {
            'User-Agent': 'AniTubeBuzz/1.0 (Anime News Aggregator)'
        }

        response = requests.get(
            source['url'],
            headers=headers,
            timeout=15
        )
        response.raise_for_status()

        feed = feedparser.parse(response.content)

        for entry in feed.entries[:10]:
            title = clean_html(getattr(entry, 'title', ''))
            summary = clean_html(getattr(entry, 'summary', ''))
            link = getattr(entry, 'link', '')

            if not title or not link:
                continue

            if not is_anime_related(title, summary):
                continue

            # Parse date
            try:
                pub_date = dateparser.parse(
                    str(getattr(entry, 'published', datetime.now().isoformat()))
                )
                if pub_date and pub_date.tzinfo:
                    pub_date = pub_date.replace(tzinfo=None)
                date_str = pub_date.strftime('%Y-%m-%d') if pub_date else datetime.now().strftime('%Y-%m-%d')
            except:
                date_str = datetime.now().strftime('%Y-%m-%d')

            # Get image
            image = ""
            if hasattr(entry, 'media_thumbnail') and entry.media_thumbnail:
                image = entry.media_thumbnail[0].get('url', '')
            elif hasattr(entry, 'media_content') and entry.media_content:
                image = entry.media_content[0].get('url', '')
            elif hasattr(entry, 'enclosures') and entry.enclosures:
                for enc in entry.enclosures:
                    if 'image' in enc.get('type', ''):
                        image = enc.get('href', '')
                        break

            # Fallback image
            if not image:
                seed = re.sub(r'[^a-z0-9]', '', title.lower())[:20]
                image = f"https://picsum.photos/seed/{seed}/800/450"

            articles.append({
                'title': title,
                'summary': summary[:500] if summary else title,
                'url': link,
                'date': date_str,
                'image': image,
                'source': source['name'],
                'category': source['category'],
                'tags': source['tags'].copy()
            })

        print(f"Found {len(articles)} anime articles from {source['name']}")

    except Exception as e:
        print(f"Error fetching {source['name']}: {e}")

    return articles


def fetch_all_sources():
    """Fetch from all configured sources"""
    config = load_sources()
    published = load_published()

    all_articles = []

    for source in config['rss_feeds']:
        articles = fetch_rss_feed(source)
        all_articles.extend(articles)

    # Filter already published
    new_articles = []
    for article in all_articles:
        url_published = article['url'] in published['published_urls']
        title_published = article['title'] in published['published_titles']

        if not url_published and not title_published:
            new_articles.append(article)

    # Remove duplicates within current batch
    seen_titles = set()
    unique_articles = []
    for article in new_articles:
        title_key = article['title'].lower()[:50]
        if title_key not in seen_titles:
            seen_titles.add(title_key)
            unique_articles.append(article)

    # Limit per run
    max_articles = config['settings'].get('max_articles_per_run', 3)
    final_articles = unique_articles[:max_articles]

    print(f"\nTotal new articles to process: {len(final_articles)}")
    return final_articles, published


if __name__ == "__main__":
    articles, _ = fetch_all_sources()
    for a in articles:
        print(f"\nTitle: {a['title']}")
        print(f"Source: {a['source']}")
        print(f"Category: {a['category']}")
