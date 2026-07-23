#!/usr/bin/env python3

import os
import json
import re
import time
import requests
from slugify import slugify
from urllib.parse import quote_plus


def jikan_get(endpoint, params=None):
    base = "https://api.jikan.moe/v4"
    url = f"{base}/{endpoint}"

    for _ in range(3):
        try:
            res = requests.get(url, params=params, timeout=15)
            if res.status_code == 429:
                time.sleep(3)
                continue
            if res.status_code == 200:
                return res.json()
        except Exception as e:
            print(f"Jikan error: {e}")
        time.sleep(2)

    return None


def clean_title_for_search(title):
    clean = re.sub(r'[^\w\s:-]', '', title).strip()
    parts = re.split(r'[:\-]', clean)

    candidates = []
    if parts:
        candidates.append(parts[0].strip())

    candidates.extend([
        clean,
        ' '.join(clean.split()[:4]),
        ' '.join(clean.split()[:3]),
        ' '.join(clean.split()[:2]),
    ])

    noise = {
        'episode', 'season', 'chapter', 'review', 'recap',
        'news', 'confirmed', 'trailer', 'official', 'update',
        'anime', 'manga', 'movie', 'film', 'revealed'
    }

    final_terms = []
    for c in candidates:
        words = [w for w in c.split() if w.lower() not in noise]
        term = ' '.join(words).strip()
        if term and term not in final_terms and len(term) > 2:
            final_terms.append(term[:50])

    return final_terms[:5]


def get_anime_full(title):
    terms = clean_title_for_search(title)

    for term in terms:
        data = jikan_get("anime", {"q": term, "limit": 1})
        if data and data.get("data"):
            anime = data["data"][0]
            mal_id = anime.get("mal_id")

            result = {
                "mal_id": mal_id,
                "title": anime.get("title", ""),
                "title_en": anime.get("title_english", ""),
                "title_jp": anime.get("title_japanese", ""),
                "type": anime.get("type", ""),
                "episodes": anime.get("episodes", "Unknown"),
                "status": anime.get("status", "Unknown"),
                "score": anime.get("score", "N/A"),
                "scored_by": anime.get("scored_by", 0),
                "rank": anime.get("rank", "N/A"),
                "popularity": anime.get("popularity", "N/A"),
                "members": anime.get("members", 0),
                "synopsis": (anime.get("synopsis") or "")[:900],
                "background": (anime.get("background") or "")[:500],
                "genres": [g["name"] for g in anime.get("genres", [])],
                "themes": [t["name"] for t in anime.get("themes", [])],
                "studios": [s["name"] for s in anime.get("studios", [])],
                "producers": [p["name"] for p in anime.get("producers", [])],
                "source": anime.get("source", ""),
                "duration": anime.get("duration", ""),
                "rating": anime.get("rating", ""),
                "season": anime.get("season", ""),
                "year": anime.get("year", ""),
                "aired": anime.get("aired", {}).get("string", ""),
                "image": (
                    anime.get("images", {}).get("webp", {}).get("large_image_url", "")
                    or anime.get("images", {}).get("jpg", {}).get("large_image_url", "")
                ),
                "trailer_embed": anime.get("trailer", {}).get("embed_url", ""),
                "trailer_url": anime.get("trailer", {}).get("url", ""),
                "url": anime.get("url", ""),
                "characters": [],
            }

            if mal_id:
                time.sleep(1)
                chars = jikan_get(f"anime/{mal_id}/characters")
                if chars and chars.get("data"):
                    for c in chars["data"][:10]:
                        char = c.get("character", {})
                        vas = c.get("voice_actors", [])
                        ja_va = next((v for v in vas if v.get("language") == "Japanese"), None)
                        en_va = next((v for v in vas if v.get("language") == "English"), None)

                        result["characters"].append({
                            "name": char.get("name", ""),
                            "role": c.get("role", ""),
                            "va_jp": ja_va.get("person", {}).get("name", "") if ja_va else "",
                            "va_en": en_va.get("person", {}).get("name", "") if en_va else ""
                        })

            return result
        time.sleep(1)

    return None


def get_youtube_id(anime_info):
    if not anime_info:
        return None

    for key in ["trailer_embed", "trailer_url"]:
        url = anime_info.get(key, "")
        if url:
            match = re.search(r'(?:v=|embed/|youtu\.be/)([a-zA-Z0-9_-]{11})', url)
            if match:
                return match.group(1)

    return None


def get_official_links(title, anime_info=None):
    query = quote_plus(title)
    links = {
        "crunchyroll": f"https://www.crunchyroll.com/search?q={query}",
        "netflix": f"https://www.netflix.com/search?q={query}",
        "amazon": f"https://www.amazon.com/s?k={query}+anime",
        "hidive": f"https://www.hidive.com/search?q={query}"
    }
    if anime_info and anime_info.get("url"):
        links["mal"] = anime_info["url"]
    return links


def build_article(source_data, anime_info, video_id):
    title = source_data.get("title", "Anime News")
    date = source_data.get("date", "2026-01-01")
    slug = slugify(title[:80])
    full_slug = f"{date.replace('-', '')[:8]}-{slug}"

    image = ""
    if anime_info:
        image = anime_info.get("image", "")
    if not image:
        image = source_data.get("image", "")

    excerpt = source_data.get("summary", "")[:155]
    if anime_info and anime_info.get("synopsis"):
        excerpt = anime_info["synopsis"][:155]

    tags = source_data.get("tags", ["anime", "news"])
    if anime_info:
        tags += [g.lower() for g in anime_info.get("genres", [])[:3]]
    clean_tags = []
    for t in tags:
        tt = re.sub(r'[^a-z0-9-]', '', t.lower().replace(' ', '-').replace('/', '-'))
        if tt and tt not in clean_tags:
            clean_tags.append(tt)

    md = f"""---
title: "{title.replace('"', "'")}"
excerpt: "{excerpt.replace('"', "'")}"
category: "{source_data.get('category', 'News')}"
tags: {json.dumps(clean_tags[:8])}
author: "AniTube Buzz"
date: "{date}"
image: "{image}"
imageAlt: "{title.replace('"', "'")}"
featured: false
trending: false
draft: false
source: "{source_data.get('url', '')}"
---

"""

    md += f"## {title}\n\n"
    md += f"{source_data.get('summary', '')}\n\n"

    if anime_info:
        if anime_info.get("synopsis"):
            md += "## Synopsis\n\n"
            md += f"{anime_info['synopsis']}\n\n"

        if anime_info.get("background"):
            md += f"*{anime_info['background']}*\n\n"

        md += "## Anime Information\n\n"
        md += "| Detail | Info |\n"
        md += "|--------|------|\n"
        md += f"| Japanese Title | {anime_info.get('title_jp', 'N/A')} |\n"
        md += f"| English Title | {anime_info.get('title_en', 'N/A')} |\n"
        md += f"| Type | {anime_info.get('type', 'N/A')} |\n"
        md += f"| Episodes | {anime_info.get('episodes', '?')} |\n"
        md += f"| Status | {anime_info.get('status', 'N/A')} |\n"
        md += f"| Score | {anime_info.get('score', 'N/A')}/10 |\n"
        md += f"| Rank | #{anime_info.get('rank', 'N/A')} |\n"
        md += f"| Popularity | #{anime_info.get('popularity', 'N/A')} |\n"
        md += f"| Members | {anime_info.get('members', 0):,} |\n"
        md += f"| Genres | {', '.join(anime_info.get('genres', []))} |\n"
        md += f"| Themes | {', '.join(anime_info.get('themes', []))} |\n"
        md += f"| Studios | {', '.join(anime_info.get('studios', []))} |\n"
        md += f"| Producers | {', '.join(anime_info.get('producers', []))} |\n"
        md += f"| Source | {anime_info.get('source', 'N/A')} |\n"
        md += f"| Duration | {anime_info.get('duration', 'N/A')} |\n"
        md += f"| Aired | {anime_info.get('aired', 'N/A')} |\n"
        md += f"| Rating | {anime_info.get('rating', 'N/A')} |\n\n"

        if anime_info.get("characters"):
            md += "## Main Characters & Voice Cast\n\n"
            md += "| Character | Role | Japanese VA | English VA |\n"
            md += "|-----------|------|-------------|------------|\n"
            for char in anime_info["characters"]:
                md += f"| {char['name']} | {char['role']} | {char['va_jp'] or 'TBA'} | {char['va_en'] or 'TBA'} |\n"
            md += "\n"

    if video_id:
        md += "## Official Trailer\n\n"
        md += (
            f'<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;margin:20px 0;">\n'
            f'<iframe style="position:absolute;top:0;left:0;width:100%;height:100%;" '
            f'src="https://www.youtube.com/embed/{video_id}" '
            f'title="Official Trailer" frameborder="0" '
            f'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" '
            f'allowfullscreen></iframe>\n'
            f'</div>\n\n'
        )

    links = get_official_links(title, anime_info)
    md += "## Where to Watch\n\n"
    md += "- [Watch on Crunchyroll](" + links["crunchyroll"] + ")\n"
    md += "- [Watch on Netflix](" + links["netflix"] + ")\n"
    md += "- [Watch on Amazon Prime](" + links["amazon"] + ")\n"
    md += "- [Watch on HIDIVE](" + links["hidive"] + ")\n"
    if "mal" in links:
        md += "- [View on MyAnimeList](" + links["mal"] + ")\n"
    md += "\n"

    md += "## Why This Matters\n\n"
    md += "This update is important for anime fans because it provides new official information about the series, its production, cast, and streaming availability.\n\n"

    md += "## What to Expect Next\n\n"
    md += "Stay tuned for more official updates, trailers, cast news, and release information as they are announced.\n\n"

    md += f"---\n\n*Source: [{source_data.get('source', 'AniTube Buzz')}]({source_data.get('url', '/')}) | AniTube Buzz*\n"

    return full_slug, md


def save_article(slug, content):
    posts_dir = os.path.join(os.path.dirname(__file__), "..", "src", "content", "posts")
    os.makedirs(posts_dir, exist_ok=True)
    path = os.path.join(posts_dir, f"{slug}.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Saved: {path}")
    return path


def process_articles(articles):
    if not articles:
        return []

    processed = []

    for i, article in enumerate(articles):
        print(f"\n{'='*60}")
        print(f"Article {i+1}/{len(articles)}: {article['title'][:60]}")
        print(f"{'='*60}")

        print("Fetching Jikan data...")
        anime_info = get_anime_full(article['title'])
        time.sleep(2)

        print("Getting trailer...")
        video_id = get_youtube_id(anime_info)

        slug, markdown = build_article(article, anime_info, video_id)
        path = save_article(slug, markdown)

        processed.append({
            "slug": slug,
            "title": article["title"],
            "url": article["url"],
            "filepath": path
        })

        if i < len(articles) - 1:
            time.sleep(3)

    return processed
