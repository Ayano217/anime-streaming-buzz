#!/usr/bin/env python3

import feedparser
import requests
import json
import os
import re
from datetime import datetime
from dateutil import parser as dateparser


def load_sources():
    path = os.path.join(os.path.dirname(__file__), '..', 'data', 'sources.json')
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_published():
    path = os.path.join(os.path.dirname(__file__), '..', 'data', 'published.json')
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return {"published_urls": [], "published_titles": [], "last_run": ""}


def clean_html(text):
    if not text:
        return ""
    clean = re.sub(r'<[^>]+>', '', text)
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean


def is_anime_related(title, summary):
    keywords = [
        'anime', 'manga', 'manhwa', 'webtoon', 'crunchyroll',
        'funimation', 'one piece', 'naruto', 'demon slayer',
        'attack on titan', 'jujutsu', 'solo leveling', 'blue lock',
        'chainsaw man', 'my hero academia', 'bleach', 'dragon ball',
        'season', 'episode', 'chapter', 'adaptation', 'simulcast',
        'ova', 'movie', 'studio', 'mappa', 'wit', 'ufotable'
    ]
    text = f"{title} {summary}".lower()
    return any(kw in text for kw in keywords)


def fetch_all_sources():
    config = load_sources()
    published = load_published()
    published_urls = set(published.get("published_urls", []))
    published_titles = set(published.get("published_titles", []))

    all_articles = []

    for source in config['rss_feeds']:
        try:
            print(f"Fetching: {source['name']}")

            headers = {'User-Agent': 'AniTubeBuzz/1.0'}
            response = requests.get(source['url'], headers=headers, timeout=15)
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

                if link in published_urls or title in published_titles:
                    continue

                try:
                    pub_date = dateparser.parse(
                        str(getattr(entry, 'published', datetime.now().isoformat()))
                    )
                    if pub_date and pub_date.tzinfo:
                        pub_date = pub_date.replace(tzinfo=None)
                    date_str = pub_date.strftime('%Y-%m-%d') if pub_date else datetime.now().strftime('%Y-%m-%d')
                except:
                    date_str = datetime.now().strftime('%Y-%m-%d')

                image = ""
                if hasattr(entry, 'media_thumbnail') and entry.media_thumbnail:
                    image = entry.media_thumbnail[0].get('url', '')
                elif hasattr(entry, 'media_content') and entry.media_content:
                    image = entry.media_content[0].get('url', '')

                if not image:
    anime_seeds = [
        'anime-city', 'anime-sunset', 'anime-sky',
        'manga-art', 'tokyo-night', 'japan-temple',
        'sakura-tree', 'neon-city', 'anime-world',
        'cyber-tokyo', 'anime-school', 'fantasy-world',
        'dragon-realm', 'sword-hero', 'magic-girl',
        'mecha-battle', 'ninja-shadow', 'demon-fight',
        'ocean-adventure', 'space-anime'
    ]
    import random
    seed = random.choice(anime_seeds)
    image = f"https://picsum.photos/seed/{seed}/800/450"

                all_articles.append({
                    'title': title,
                    'summary': summary[:500] if summary else title,
                    'url': link,
                    'date': date_str,
                    'image': image,
                    'source': source['name'],
                    'category': source['category'],
                    'tags': source['tags'].copy()
                })

        except Exception as e:
            print(f"Error fetching {source['name']}: {e}")
            continue

    # Remove duplicates
    seen = set()
    unique = []
    for a in all_articles:
        key = a['title'].lower()[:50]
        if key not in seen:
            seen.add(key)
            unique.append(a)

    max_articles = config['settings'].get('max_articles_per_run', 3)
    result = unique[:max_articles]

    print(f"Total new articles: {len(result)}")
    return result
