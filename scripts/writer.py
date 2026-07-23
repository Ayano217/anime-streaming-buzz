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
    for _ in range(3):
        try:
            res = requests.get(f"{base}/{endpoint}", params=params, timeout=15)
            if res.status_code == 429:
                time.sleep(3)
                continue
            if res.status_code == 200:
                return res.json()
        except Exception as e:
            print(f"Jikan error: {e}")
        time.sleep(2)
    return None


def clean_for_search(title):
    clean = re.sub(r'[^\w\s]', '', title).strip()
    noise = {
        'episode', 'season', 'chapter', 'review', 'recap',
        'news', 'confirmed', 'trailer', 'official', 'update',
        'anime', 'manga', 'movie', 'film', 'revealed', 'announces',
        'shares', 'gets', 'launches', 'releases', 'unveils'
    }
    parts = re.split(r'[:\-]', clean)
    candidates = []

    if parts:
        candidates.append(parts[0].strip())

    candidates += [
        clean,
        ' '.join(clean.split()[:4]),
        ' '.join(clean.split()[:3]),
        ' '.join(clean.split()[:2]),
    ]

    final = []
    for c in candidates:
        words = [w for w in c.split() if w.lower() not in noise]
        term = ' '.join(words).strip()
        if term and term not in final and len(term) > 2:
            final.append(term[:50])

    return final[:5]


def get_anime_data(title):
    terms = clean_for_search(title)

    for term in terms:
        data = jikan_get("anime", {"q": term, "limit": 1})
        if not data or not data.get("data"):
            time.sleep(1)
            continue

        anime = data["data"][0]
        mal_id = anime.get("mal_id")

        result = {
            "found": True,
            "mal_id": mal_id,
            "title": anime.get("title", ""),
            "title_en": anime.get("title_english", ""),
            "title_jp": anime.get("title_japanese", ""),
            "type": anime.get("type", ""),
            "episodes": anime.get("episodes") or "Unknown",
            "status": anime.get("status", ""),
            "score": anime.get("score") or "N/A",
            "scored_by": anime.get("scored_by") or 0,
            "rank": anime.get("rank") or "N/A",
            "popularity": anime.get("popularity") or "N/A",
            "members": anime.get("members") or 0,
            "synopsis": (anime.get("synopsis") or "")[:900],
            "background": (anime.get("background") or "")[:400],
            "genres": [g["name"] for g in anime.get("genres", [])],
            "themes": [t["name"] for t in anime.get("themes", [])],
            "studios": [s["name"] for s in anime.get("studios", [])],
            "producers": [p["name"] for p in anime.get("producers", [])],
            "source_type": anime.get("source", ""),
            "duration": anime.get("duration", ""),
            "rating": anime.get("rating", ""),
            "aired": anime.get("aired", {}).get("string", ""),
            "image": (
                anime.get("images", {}).get("webp", {}).get("large_image_url", "")
                or anime.get("images", {}).get("jpg", {}).get("large_image_url", "")
                or ""
            ),
            "trailer_embed": anime.get("trailer", {}).get("embed_url", ""),
            "trailer_url": anime.get("trailer", {}).get("url", ""),
            "mal_url": anime.get("url", ""),
            "characters": [],
        }

        if mal_id:
            time.sleep(1)
            chars = jikan_get(f"anime/{mal_id}/characters")
            if chars and chars.get("data"):
                for c in chars["data"][:10]:
                    char = c.get("character", {})
                    vas = c.get("voice_actors", [])
                    ja = next((v for v in vas if v.get("language") == "Japanese"), None)
                    en = next((v for v in vas if v.get("language") == "English"), None)
                    result["characters"].append({
                        "name": char.get("name", ""),
                        "role": c.get("role", ""),
                        "va_jp": ja.get("person", {}).get("name", "") if ja else "",
                        "va_en": en.get("person", {}).get("name", "") if en else "",
                    })

        print(f"Jikan found: {result['title']}")
        return result

    return {"found": False}


def get_youtube_id(anime_data):
    for key in ["trailer_embed", "trailer_url"]:
        url = anime_data.get(key, "")
        if url:
            m = re.search(r'(?:v=|embed/|youtu\.be/)([a-zA-Z0-9_-]{11})', url)
            if m:
                return m.group(1)
    return None


def build_article(source, anime, video_id):
    title = source.get("title", "Anime News")
    date = source.get("date", "2026-01-01")
    source_summary = source.get("summary", "")
    source_url = source.get("url", "")
    source_name = source.get("source", "AniTube Buzz")
    category = source.get("category", "News")

    slug = slugify(title[:80])
    full_slug = f"{date.replace('-','')[:8]}-{slug}"

    # Image priority
    image = ""
    if anime.get("found") and anime.get("image"):
        image = anime["image"]
    if not image:
        image = source.get("image", "")

    # Excerpt
    excerpt = ""
    if anime.get("found") and anime.get("synopsis"):
        excerpt = anime["synopsis"][:155]
    if not excerpt:
        excerpt = source_summary[:155]

    # Tags
    tags = list(source.get("tags", ["anime", "news"]))
    if anime.get("found"):
        tags += [g.lower() for g in anime.get("genres", [])[:3]]
    clean_tags = []
    for t in tags:
        ct = re.sub(r'[^a-z0-9-]', '', t.lower().replace(' ', '-').replace('/', '-'))
        if ct and ct not in clean_tags:
            clean_tags.append(ct)

    title_safe = title.replace('"', "'")
    excerpt_safe = excerpt.replace('"', "'")

    md = f"""---
title: "{title_safe}"
excerpt: "{excerpt_safe}"
category: "{category}"
tags: {json.dumps(clean_tags[:8])}
author: "AniTube Buzz"
date: "{date}"
image: "{image}"
imageAlt: "{title_safe}"
featured: false
trending: false
draft: false
source: "{source_url}"
---

"""

    # Article opening
    md += f"## {title}\n\n"
    md += f"{source_summary}\n\n"

    if anime.get("found"):
        # Synopsis
        if anime.get("synopsis"):
            md += "## Synopsis\n\n"
            md += f"{anime['synopsis']}\n\n"

        if anime.get("background"):
            md += f"*Background: {anime['background']}*\n\n"

        # Info table
        md += "## Anime Information\n\n"
        md += "| Detail | Info |\n"
        md += "|--------|------|\n"

        if anime.get("title_jp"):
            md += f"| 🇯🇵 Japanese Title | {anime['title_jp']} |\n"
        if anime.get("title_en"):
            md += f"| 🇺🇸 English Title | {anime['title_en']} |\n"
        if anime.get("type"):
            md += f"| 📺 Type | {anime['type']} |\n"
        if anime.get("episodes"):
            md += f"| 🎬 Episodes | {anime['episodes']} |\n"
        if anime.get("status"):
            md += f"| 📊 Status | {anime['status']} |\n"
        if anime.get("score") and anime["score"] != "N/A":
            scored = f"{anime['score']}/10"
            if anime.get("scored_by") and anime["scored_by"] > 0:
                scored += f" ({anime['scored_by']:,} votes)"
            md += f"| ⭐ Score | {scored} |\n"
        if anime.get("rank") and anime["rank"] != "N/A":
            md += f"| 🏆 MAL Rank | #{anime['rank']} |\n"
        if anime.get("popularity") and anime["popularity"] != "N/A":
            md += f"| 📈 Popularity | #{anime['popularity']} |\n"
        if anime.get("members") and anime["members"] > 0:
            md += f"| 👥 Members | {anime['members']:,} |\n"
        if anime.get("genres"):
            md += f"| 🎭 Genres | {', '.join(anime['genres'])} |\n"
        if anime.get("themes"):
            md += f"| 🎨 Themes | {', '.join(anime['themes'])} |\n"
        if anime.get("studios"):
            md += f"| 🏢 Studios | {', '.join(anime['studios'])} |\n"
        if anime.get("producers"):
            md += f"| 🎬 Producers | {', '.join(anime['producers'])} |\n"
        if anime.get("source_type"):
            md += f"| 📖 Source Material | {anime['source_type']} |\n"
        if anime.get("duration"):
            md += f"| ⏱️ Episode Duration | {anime['duration']} |\n"
        if anime.get("aired"):
            md += f"| 📅 Aired | {anime['aired']} |\n"
        if anime.get("rating"):
            md += f"| 🔞 Rating | {anime['rating']} |\n"

        md += "\n"

        # Characters
        if anime.get("characters"):
            md += "## Main Characters & Voice Cast\n\n"
            md += "| Character | Role | Japanese VA | English VA |\n"
            md += "|-----------|------|-------------|------------|\n"
            for char in anime["characters"]:
                md += (
                    f"| {char['name']} "
                    f"| {char['role']} "
                    f"| {char['va_jp'] or 'TBA'} "
                    f"| {char['va_en'] or 'TBA'} |\n"
                )
            md += "\n"

    # YouTube Trailer
    if video_id:
        md += "## Official Trailer\n\n"
        md += (
            '<div style="position:relative;padding-bottom:56.25%;'
            'height:0;overflow:hidden;border-radius:12px;margin:20px 0;">\n'
            f'<iframe style="position:absolute;top:0;left:0;width:100%;height:100%;" '
            f'src="https://www.youtube.com/embed/{video_id}" '
            'title="Official Trailer" frameborder="0" '
            'allow="accelerometer; autoplay; clipboard-write; encrypted-media; '
            'gyroscope; picture-in-picture" allowfullscreen></iframe>\n'
            '</div>\n\n'
        )

    # Where to watch — markdown links only, no raw HTML
    title_query = quote_plus(title)
    md += "## Where to Watch\n\n"

    if anime.get("found") and anime.get("mal_url"):
        md += f"- [View full details on MyAnimeList]({anime['mal_url']})\n"

    md += f"- [Search on Crunchyroll](https://www.crunchyroll.com/search?q={title_query})\n"
    md += f"- [Search on Netflix](https://www.netflix.com/search?q={title_query})\n"
    md += f"- [Search on Amazon Prime](https://www.amazon.com/s?k={title_query}+anime)\n"
    md += f"- [Search on HIDIVE](https://www.hidive.com/search?q={title_query})\n"
    md += "\n> *Availability varies by region. Always support creators through official platforms.*\n\n"

    # Source attribution only — NO boilerplate filler
    md += f"---\n\n*Source: [{source_name}]({source_url}) | AniTube Buzz*\n"

    return full_slug, md


def save_article(slug, content):
    posts_dir = os.path.join(
        os.path.dirname(__file__), "..", "src", "content", "posts"
    )
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
        print(f"[{i+1}/{len(articles)}] {article['title'][:60]}")
        
