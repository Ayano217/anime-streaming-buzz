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
        return {
            "published_urls": [],
            "published_titles": [],
            "last_run": ""
        }


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
        'episode', 'season', 'chapter', 'adaptation', 'simulcast',
        'ova', 'movie', 'studio', 'mappa', 'wit', 'ufotable',
        'isekai', 'light novel', 'webtoon', 'otaku'
    ]
    text = f"{title} {summary}".lower()
    return any(keyword in text for keyword in keywords)


def extract_image(entry):
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

    return image


def fetch_all_sources():
    config = load_sources()
    published = load_published()

    published_urls = set(published.get("published_urls", []))
    published_titles = set(published.get("published_titles", []))

    all_articles = []

    for source in config['rss_feeds']:
        try:
            print(f"Fetching: {source['name']}")

            headers = {
                'User-Agent': 'AniTubeBuzz/1.0'
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

                if link in published_urls or title in published_titles:
                    continue

                try:
                    raw_date = str(getattr(entry, 'published', datetime.now().isoformat()))
                    pub_date = dateparser.parse(raw_date)
                    if pub_date and pub_date.tzinfo:
                        pub_date = pub_date.replace(tzinfo=None)
                    date_str = pub_date.strftime('%Y-%m-%d') if pub_date else datetime.now().strftime('%Y-%m-%d')
                except:
                    date_str = datetime.now().strftime('%Y-%m-%d')

                image = extract_image(entry)

                article = {
                    'title': title,
                    'summary': summary[:700] if summary else title,
                    'url': link,
                    'date': date_str,
                    'image': image if image else "",
                    'source': source['name'],
                    'category': source['category'],
                    'tags': source['tags'].copy()
                }

                all_articles.append(article)

        except Exception as e:
            print(f"Error fetching {source['name']}: {e}")
            continue

    # remove duplicates in current batch
    seen = set()
    unique_articles = []

    for article in all_articles:
        key = article['title'].lower()[:60]
        if key not in seen:
            seen.add(key)
            unique_articles.append(article)

    max_articles = config['settings'].get('max_articles_per_run', 1)
    final_articles = unique_articles[:max_articles]

    print(f"Total new articles: {len(final_articles)}")
    return final_articles
