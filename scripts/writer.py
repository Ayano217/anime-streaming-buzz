#!/usr/bin/env python3

import os
import json
import re
import time
import random
import requests
import subprocess
from slugify import slugify


GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"


def get_anime_image(title):
    """Get real anime image from Jikan API"""
    try:
        query = re.sub(r'[^\w\s]', '', title)[:50]
        url = f"https://api.jikan.moe/v4/anime?q={query}&limit=1"
        res = requests.get(url, timeout=10)
        if res.status_code == 200:
            data = res.json()
            if data.get("data"):
                img = data["data"][0].get("images", {}).get("jpg", {}).get("large_image_url", "")
                if img:
                    print(f"Found anime image for: {title[:30]}")
                    return img
    except Exception as e:
        print(f"Jikan image error: {e}")

    try:
        query = re.sub(r'[^\w\s]', '', title)[:50]
        url = f"https://api.jikan.moe/v4/manga?q={query}&limit=1"
        res = requests.get(url, timeout=10)
        if res.status_code == 200:
            data = res.json()
            if data.get("data"):
                img = data["data"][0].get("images", {}).get("jpg", {}).get("large_image_url", "")
                if img:
                    return img
    except:
        pass

    seeds = [
        'anime-city', 'anime-sunset', 'manga-art',
        'tokyo-night', 'neon-city', 'sakura-tree',
        'cyber-tokyo', 'fantasy-world', 'sword-hero'
    ]
    return f"https://picsum.photos/seed/{random.choice(seeds)}/800/450"


def get_streaming_links(title):
    """Generate official streaming links"""
    query = title.replace(' ', '+')
    return {
        "crunchyroll": f"https://www.crunchyroll.com/search?q={query}",
        "netflix": f"https://www.netflix.com/search?q={query}",
        "amazon": f"https://www.amazon.com/s?k={query}+anime",
        "hulu": f"https://www.hulu.com/search?q={query}",
        "hidive": f"https://www.hidive.com/search?q={query}",
    }


def get_anime_details(title):
    """Get detailed anime info from Jikan"""
    try:
        query = re.sub(r'[^\w\s]', '', title)[:50]
        url = f"https://api.jikan.moe/v4/anime?q={query}&limit=1"
        res = requests.get(url, timeout=10)
        if res.status_code == 200:
            data = res.json()
            if data.get("data"):
                anime = data["data"][0]
                return {
                    "mal_id": anime.get("mal_id"),
                    "title_jp": anime.get("title_japanese", ""),
                    "episodes": anime.get("episodes", "Unknown"),
                    "status": anime.get("status", "Unknown"),
                    "score": anime.get("score", "N/A"),
                    "synopsis": anime.get("synopsis", "")[:500],
                    "genres": [g["name"] for g in anime.get("genres", [])],
                    "studios": [s["name"] for s in anime.get("studios", [])],
                    "season": anime.get("season", ""),
                    "year": anime.get("year", ""),
                    "type": anime.get("type", ""),
                    "rating": anime.get("rating", ""),
                    "members": anime.get("members", 0),
                    "url": anime.get("url", ""),
                }
        time.sleep(1)
    except Exception as e:
        print(f"Jikan details error: {e}")
    return None


def call_ai(prompt, max_tokens=3000):
    """Call Gemini for article generation"""
    if not GEMINI_API_KEY:
        print("ERROR: GEMINI_API_KEY missing")
        return None

    url = f"{GEMINI_URL}?key={GEMINI_API_KEY}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": max_tokens,
            "topP": 0.9
        }
    }

    for attempt in range(3):
        try:
            res = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=90)
            if res.status_code == 429:
                time.sleep(10)
                continue
            if res.status_code != 200:
                print(f"AI error {res.status_code}")
                time.sleep(3)
                continue
            data = res.json()
            text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            if text and len(text.strip()) > 200:
                return text.strip()
        except Exception as e:
            print(f"AI error: {e}")
            time.sleep(3)
    return None


def make_article(data, anime_info=None, streaming_links=None):
    """Generate detailed article"""

    extra_context = ""
    if anime_info:
        extra_context = f"""
ANIME DETAILS:
- Japanese Title: {anime_info.get('title_jp', 'N/A')}
- Type: {anime_info.get('type', 'N/A')}
- Episodes: {anime_info.get('episodes', 'N/A')}
- Status: {anime_info.get('status', 'N/A')}
- MAL Score: {anime_info.get('score', 'N/A')}
- Genres: {', '.join(anime_info.get('genres', []))}
- Studios: {', '.join(anime_info.get('studios', []))}
- Season: {anime_info.get('season', '')} {anime_info.get('year', '')}
- Members on MAL: {anime_info.get('members', 'N/A')}
- Synopsis: {anime_info.get('synopsis', 'N/A')}
"""

    streaming_section = ""
    if streaming_links:
        streaming_section = """
INCLUDE A "Where to Watch" SECTION with these official platforms:
- Crunchyroll
- Netflix
- Amazon Prime Video
- Hulu
- HIDIVE
Note: Tell readers to check availability in their region.
"""

    prompt = f"""You are a professional anime journalist writing for AniTube Buzz, a top anime news website.

Write an EXTREMELY DETAILED, COMPREHENSIVE article based on this:

TITLE: {data['title']}
SOURCE: {data['source']}
CATEGORY: {data['category']}
SUMMARY: {data['summary']}
DATE: {data['date']}
{extra_context}

STRICT REQUIREMENTS:
1. Write 800-1500 words minimum
2. Use markdown with ## and ### headings
3. Start with a compelling 2-3 paragraph introduction
4. Include 5-7 detailed sections with ## headings
5. Add extensive context, history, and background
6. Include character analysis if relevant
7. Add community reaction section
8. Add "What to Expect" or predictions section
9. {streaming_section if streaming_section else "Skip streaming section"}
10. Include fun facts or trivia
11. Add comparison with similar anime/manga
12. End with comprehensive conclusion
13. NO YAML frontmatter
14. Do NOT copy summary - write original detailed analysis
15. Be enthusiastic but factual
16. Include specific details about animation, story, characters
17. Mention relevant studios, directors, voice actors if applicable
18. Add ratings or scoring discussion if relevant

SECTIONS TO INCLUDE:
## Introduction (2-3 paragraphs)
## Story & Plot Analysis
## Characters & Development
## Animation & Visual Quality (if anime)
## Community Reception & Fan Reactions
## Where to Watch (official platforms only)
## What to Expect Next
## Final Thoughts

Write the complete detailed article now:"""

    return call_ai(prompt, 3000)


def make_metadata(data, content):
    preview = content[:600] if content else data["summary"]
    prompt = f"""SEO metadata for anime article.

TITLE: {data['title']}
CONTENT: {preview}

Return ONLY JSON:
{{
  "title": "catchy SEO title max 60 chars",
  "excerpt": "compelling description max 155 chars",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7"]
}}"""

    response = call_ai(prompt, 400)
    fallback = {
        "title": data["title"][:60],
        "excerpt": data["summary"][:155],
        "tags": data.get("tags", ["anime", "news"])
    }

    if not response:
        return fallback

    try:
        cleaned = response.replace("```json", "").replace("```", "").strip()
        s = cleaned.find("{")
        e = cleaned.rfind("}")
        if s != -1 and e > s:
            meta = json.loads(cleaned[s:e + 1])
            meta["title"] = meta.get("title", fallback["title"])[:60]
            meta["excerpt"] = meta.get("excerpt", fallback["excerpt"])[:155]
            if not isinstance(meta.get("tags"), list):
                meta["tags"] = fallback["tags"]
            return meta
    except:
        pass
    return fallback


def build_markdown(data, content, meta, anime_info=None, streaming_links=None):
    slug = slugify(meta.get("title", data["title"]))[:80]
    date_prefix = data["date"].replace("-", "")[:8]
    full_slug = f"{date_prefix}-{slug}"

    tags = meta.get("tags", data.get("tags", []))
    if not isinstance(tags, list):
        tags = data.get("tags", [])

    image = data.get("image", "")
    if not image:
        image = get_anime_image(data["title"])

    title_clean = meta.get("title", data["title"]).replace('"', "'")
    excerpt_clean = meta.get("excerpt", data["summary"][:155]).replace('"', "'")

    fm = f"""---
title: "{title_clean}"
excerpt: "{excerpt_clean}"
category: "{data['category']}"
tags: {json.dumps(tags)}
author: "AniTube Buzz"
date: "{data['date']}"
image: "{image}"
imageAlt: "{title_clean}"
featured: false
trending: false
draft: false
source: "{data['url']}"
---

"""

    if content:
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                content = parts[2].strip()
        body = fm + content.strip()
    else:
        synopsis = ""
        if anime_info and anime_info.get("synopsis"):
            synopsis = anime_info["synopsis"]

        body = fm + f"""## {data['title']}

{data['summary']}

{synopsis}

### Key Details

| Detail | Info |
|--------|------|
| Category | {data['category']} |
| Source | {data['source']} |
| Date | {data['date']} |
"""

        if anime_info:
            body += f"""
### Anime Information

| Detail | Info |
|--------|------|
| Japanese Title | {anime_info.get('title_jp', 'N/A')} |
| Type | {anime_info.get('type', 'N/A')} |
| Episodes | {anime_info.get('episodes', 'N/A')} |
| Status | {anime_info.get('status', 'N/A')} |
| Score | {anime_info.get('score', 'N/A')}/10 |
| Genres | {', '.join(anime_info.get('genres', []))} |
| Studios | {', '.join(anime_info.get('studios', []))} |

"""

    if streaming_links:
        body += f"""

### Where to Watch (Official Platforms)

| Platform | Link |
|----------|------|
| Crunchyroll | [Watch on Crunchyroll]({streaming_links['crunchyroll']}) |
| Netflix | [Watch on Netflix]({streaming_links['netflix']}) |
| Amazon Prime | [Watch on Amazon]({streaming_links['amazon']}) |
| Hulu | [Watch on Hulu]({streaming_links['hulu']}) |
| HIDIVE | [Watch on HIDIVE]({streaming_links['hidive']}) |

> **Note:** Availability varies by region. Check each platform for your area.

"""

    body += f"\n\n---\n\n*Source: [{data['source']}]({data['url']}) | AniTube Buzz*\n"
    return full_slug, body


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

        print("Fetching anime details from Jikan...")
        anime_info = get_anime_details(article['title'])
        time.sleep(1)

        print("Fetching real anime image...")
        real_image = get_anime_image(article['title'])
        if real_image:
            article['image'] = real_image

        streaming_links = get_streaming_links(article['title'])

        print("Generating detailed article...")
        content = make_article(article, anime_info, streaming_links)

        if content:
            print(f"Article: {len(content)} chars")
        else:
            print("Using enhanced fallback")

        print("Generating metadata...")
        meta = make_metadata(article, content)

        slug, markdown = build_markdown(article, content, meta, anime_info, streaming_links)
        path = save_article(slug, markdown)

        processed.append({
            "slug": slug,
            "title": article["title"],
            "url": article["url"],
            "filepath": path
        })

        if i < len(articles) - 1:
            print("Waiting 5 seconds...")
            time.sleep(5)

    return processed
