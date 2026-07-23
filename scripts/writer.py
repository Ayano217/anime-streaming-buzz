#!/usr/bin/env python3

import os
import json
import re
import time
import random
import requests
from slugify import slugify


def jikan_get(endpoint, params=None):
    """Call Jikan API with retry"""
    base = "https://api.jikan.moe/v4"
    url = f"{base}/{endpoint}"

    for attempt in range(3):
        try:
            res = requests.get(url, params=params, timeout=15)
            if res.status_code == 429:
                print("Rate limited, waiting 4s...")
                time.sleep(4)
                continue
            if res.status_code == 200:
                return res.json()
            print(f"Jikan {res.status_code}: {endpoint}")
        except Exception as e:
            print(f"Jikan error: {e}")
        time.sleep(2)
    return None


def get_anime_full(title):
    """Get complete anime data from Jikan"""
    clean = re.sub(r'[^\w\s]', '', title)[:60]
    search_terms = [clean, ' '.join(clean.split()[:3]), ' '.join(clean.split()[:2])]

    for term in search_terms:
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
                "episodes": anime.get("episodes", "?"),
                "status": anime.get("status", ""),
                "score": anime.get("score", "N/A"),
                "scored_by": anime.get("scored_by", 0),
                "rank": anime.get("rank", "N/A"),
                "popularity": anime.get("popularity", "N/A"),
                "members": anime.get("members", 0),
                "synopsis": (anime.get("synopsis") or "")[:800],
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
                "recommendations": [],
            }

            # Get characters
            if mal_id:
                time.sleep(1)
                chars = jikan_get(f"anime/{mal_id}/characters")
                if chars and chars.get("data"):
                    for c in chars["data"][:12]:
                        char = c.get("character", {})
                        vas = c.get("voice_actors", [])
                        ja_va = next((v for v in vas if v.get("language") == "Japanese"), None)
                        en_va = next((v for v in vas if v.get("language") == "English"), None)

                        result["characters"].append({
                            "name": char.get("name", ""),
                            "image": char.get("images", {}).get("jpg", {}).get("image_url", ""),
                            "role": c.get("role", ""),
                            "va_jp": ja_va.get("person", {}).get("name", "") if ja_va else "",
                            "va_en": en_va.get("person", {}).get("name", "") if en_va else "",
                        })

                # Get recommendations
                time.sleep(1)
                recs = jikan_get(f"anime/{mal_id}/recommendations")
                if recs and recs.get("data"):
                    for r in recs["data"][:5]:
                        entry = r.get("entry", {})
                        result["recommendations"].append({
                            "title": entry.get("title", ""),
                            "image": entry.get("images", {}).get("jpg", {}).get("image_url", ""),
                            "url": entry.get("url", ""),
                        })

            print(f"Full data for: {result['title']}")
            return result
        time.sleep(1)

    return None


def get_youtube_id(anime_info):
    """Extract YouTube video ID"""
    if not anime_info:
        return None

    for key in ["trailer_embed", "trailer_url"]:
        url = anime_info.get(key, "")
        if url:
            match = re.search(r'(?:v=|embed/|youtu\.be/)([a-zA-Z0-9_-]{11})', url)
            if match:
                return match.group(1)

    # Fallback YouTube search
    try:
        title = anime_info.get("title", "")
        query = f"{title} anime official trailer"
        url = f"https://www.youtube.com/results?search_query={query.replace(' ', '+')}"
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        res = requests.get(url, headers=headers, timeout=10)
        if res.status_code == 200:
            ids = re.findall(r'"videoId":"([a-zA-Z0-9_-]{11})"', res.text)
            if ids:
                return ids[0]
    except:
        pass

    return None


def get_streaming_links(title):
    query = title.replace(' ', '+')
    return {
        "crunchyroll": f"https://www.crunchyroll.com/search?q={query}",
        "netflix": f"https://www.netflix.com/search?q={query}",
        "amazon": f"https://www.amazon.com/s?k={query}+anime",
        "hidive": f"https://www.hidive.com/search?q={query}",
    }


def build_rich_article(source_data, anime_info, video_id):
    """Build wiki-style rich article"""

    title = source_data.get("title", "Unknown")
    slug_title = title[:60]
    slug = slugify(slug_title)[:80]
    date = source_data.get("date", "2026-01-01")
    date_prefix = date.replace("-", "")[:8]
    full_slug = f"{date_prefix}-{slug}"

    # Image
    image = ""
    if anime_info:
        image = anime_info.get("image", "")
    if not image:
        image = source_data.get("image", "")
    if not image:
        image = f"https://picsum.photos/seed/{slug[:15]}/800/450"

    # Tags
    tags = source_data.get("tags", ["anime", "news"])
    if anime_info:
        tags = list(set(tags + [g.lower() for g in anime_info.get("genres", [])][:3]))
    clean_tags = [re.sub(r'[^a-z0-9-]', '', t.lower().replace(' ', '-')) for t in tags]
    clean_tags = [t for t in clean_tags if t][:8]

    # Excerpt
    excerpt = source_data.get("summary", "")[:155]
    if anime_info and anime_info.get("synopsis"):
        excerpt = anime_info["synopsis"][:155]

    title_clean = slug_title.replace('"', "'")
    excerpt_clean = excerpt.replace('"', "'")

    # Build markdown
    md = f"""---
title: "{title_clean}"
excerpt: "{excerpt_clean}"
category: "{source_data.get('category', 'News')}"
tags: {json.dumps(clean_tags)}
author: "AniTube Buzz"
date: "{date}"
image: "{image}"
imageAlt: "{title_clean}"
featured: false
trending: false
draft: false
source: "{source_data.get('url', '')}"
---

"""

    # Article header
    md += f"## {title}\n\n"
    md += f"{source_data.get('summary', '')}\n\n"

    if anime_info:
        # Synopsis
        if anime_info.get("synopsis"):
            md += f"## Synopsis\n\n"
            md += f"> {anime_info['synopsis']}\n\n"

        if anime_info.get("background"):
            md += f"*{anime_info['background']}*\n\n"

        # Info table
        genres = ', '.join(anime_info.get('genres', []))
        themes = ', '.join(anime_info.get('themes', []))
        studios = ', '.join(anime_info.get('studios', []))
        producers = ', '.join(anime_info.get('producers', []))

        md += "## Anime Information\n\n"
        md += "| Detail | Info |\n"
        md += "|--------|------|\n"
        md += f"| 🇯🇵 Japanese Title | {anime_info.get('title_jp', 'N/A')} |\n"
        md += f"| 🇺🇸 English Title | {anime_info.get('title_en', 'N/A')} |\n"
        md += f"| 📺 Type | {anime_info.get('type', 'N/A')} |\n"
        md += f"| 🎬 Episodes | {anime_info.get('episodes', '?')} |\n"
        md += f"| 📊 Status | {anime_info.get('status', 'N/A')} |\n"
        md += f"| ⭐ Score | {anime_info.get('score', 'N/A')}/10 ({anime_info.get('scored_by', 0):,} votes) |\n"
        md += f"| 🏆 Rank | #{anime_info.get('rank', 'N/A')} |\n"
        md += f"| 📈 Popularity | #{anime_info.get('popularity', 'N/A')} |\n"
        md += f"| 👥 Members | {anime_info.get('members', 0):,} |\n"
        md += f"| 🎭 Genres | {genres} |\n"
        md += f"| 🎨 Themes | {themes} |\n"
        md += f"| 🏢 Studios | {studios} |\n"
        md += f"| 🎬 Producers | {producers} |\n"
        md += f"| 📖 Source | {anime_info.get('source', 'N/A')} |\n"
        md += f"| ⏱️ Duration | {anime_info.get('duration', 'N/A')} |\n"
        md += f"| 📅 Aired | {anime_info.get('aired', 'N/A')} |\n"
        md += f"| 🔞 Rating | {anime_info.get('rating', 'N/A')} |\n\n"

        # Characters
        if anime_info.get("characters"):
            md += "## Characters & Voice Cast\n\n"
            md += "| Character | Role | Japanese VA | English VA |\n"
            md += "|-----------|------|-------------|------------|\n"
            for char in anime_info["characters"]:
                md += (
                    f"| {char['name']} "
                    f"| {char['role']} "
                    f"| {char['va_jp'] or 'TBA'} "
                    f"| {char['va_en'] or 'TBA'} |\n"
                )
            md += "\n"

    # Trailer
    if video_id:
        md += "## Official Trailer\n\n"
        md += (
            f'<div style="position:relative;padding-bottom:56.25%;height:0;'
            f'overflow:hidden;border-radius:12px;margin:20px 0;">\n'
            f'<iframe style="position:absolute;top:0;left:0;width:100%;height:100%;" '
            f'src="https://www.youtube.com/embed/{video_id}" '
            f'title="Official Trailer" frameborder="0" '
            f'allow="accelerometer;autoplay;clipboard-write;encrypted-media;'
            f'gyroscope;picture-in-picture" allowfullscreen></iframe>\n'
            f'</div>\n\n'
        )

    # Streaming links
    links = get_streaming_links(title)
    md += "## Where to Watch\n\n"
    md += "> ✅ Support the creators — use official platforms.\n\n"
    md += (
        f'<a href="{links["crunchyroll"]}" target="_blank" rel="noopener" '
        f'style="display:inline-block;padding:10px 20px;background:#F47521;'
        f'color:#fff;border-radius:8px;font-weight:bold;margin:5px;text-decoration:none;">'
        f'🟠 Crunchyroll</a>\n'
    )
    md += (
        f'<a href="{links["netflix"]}" target="_blank" rel="noopener" '
        f'style="display:inline-block;padding:10px 20px;background:#E50914;'
        f'color:#fff;border-radius:8px;font-weight:bold;margin:5px;text-decoration:none;">'
        f'🔴 Netflix</a>\n'
    )
    md += (
        f'<a href="{links["hidive"]}" target="_blank" rel="noopener" '
        f'style="display:inline-block;padding:10px 20px;background:#00A0E4;'
        f'color:#fff;border-radius:8px;font-weight:bold;margin:5px;text-decoration:none;">'
        f'🔵 HIDIVE</a>\n\n'
    )

    if anime_info and anime_info.get("url"):
        md += f'📋 [View on MyAnimeList]({anime_info["url"]})\n\n'

    # Recommendations
    if anime_info and anime_info.get("recommendations"):
        md += "## If You Like This, Try\n\n"
        for rec in anime_info["recommendations"]:
            md += f"- **{rec['title']}**\n"
        md += "\n"

    md += f"\n---\n\n*Source: [{source_data.get('source', 'AniTube Buzz')}]({source_data.get('url', '/')}) | AniTube Buzz*\n"

    return full_slug, md, image


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

        # Get full anime data
        print("Fetching anime data from Jikan...")
        anime_info = get_anime_full(article['title'])
        time.sleep(2)

        # Get YouTube trailer
        print("Finding trailer...")
        video_id = get_youtube_id(anime_info)

        # Update image
        if anime_info and anime_info.get("image"):
            article['image'] = anime_info['image']

        # Build article
        print("Building rich article...")
        slug, markdown, image = build_rich_article(article, anime_info, video_id)

        if image:
            article['image'] = image

        path = save_article(slug, markdown)

        processed.append({
            "slug": slug,
            "title": article["title"],
            "url": article["url"],
            "filepath": path
        })

        if i < len(articles) - 1:
            print("Waiting 3s...")
            time.sleep(3)

    return processed
