#!/usr/bin/env python3

import os
import json
import re
import time
import random
import subprocess
import requests
from slugify import slugify


MODEL_PATH = os.path.expanduser("~/.cache/gguf-models/qwen2.5-1.5b-instruct-q4_k_m.gguf")


def get_anime_image(title):
    """Try multiple searches to find real anime image"""

    clean_title = re.sub(r'[^\w\s]', '', title).strip()

    # Split title into searchable parts
    search_terms = [
        clean_title[:50],
        ' '.join(clean_title.split()[:3]),
        ' '.join(clean_title.split()[:2]),
    ]

    # Try anime search
    for term in search_terms:
        try:
            url = f"https://api.jikan.moe/v4/anime?q={term}&limit=3"
            res = requests.get(url, timeout=8)
            if res.status_code == 200:
                data = res.json()
                for item in data.get("data", []):
                    img = item.get("images", {}).get("jpg", {}).get("large_image_url", "")
                    if img and "questionmark" not in img:
                        print(f"Found anime image: {item.get('title', '')[:30]}")
                        return img
            time.sleep(1)
        except:
            pass

    # Try manga search
    for term in search_terms[:2]:
        try:
            url = f"https://api.jikan.moe/v4/manga?q={term}&limit=3"
            res = requests.get(url, timeout=8)
            if res.status_code == 200:
                data = res.json()
                for item in data.get("data", []):
                    img = item.get("images", {}).get("jpg", {}).get("large_image_url", "")
                    if img and "questionmark" not in img:
                        print(f"Found manga image: {item.get('title', '')[:30]}")
                        return img
            time.sleep(1)
        except:
            pass

    # Try characters search
    try:
        first_word = clean_title.split()[0] if clean_title.split() else "anime"
        url = f"https://api.jikan.moe/v4/characters?q={first_word}&limit=1"
        res = requests.get(url, timeout=8)
        if res.status_code == 200:
            data = res.json()
            if data.get("data"):
                img = data["data"][0].get("images", {}).get("jpg", {}).get("image_url", "")
                if img:
                    return img
    except:
        pass

    # Final fallback - themed placeholder
    seeds = [
        'anime-action', 'anime-hero', 'anime-battle',
        'manga-cover', 'tokyo-neon', 'sakura-night',
        'anime-girl', 'anime-boy', 'dragon-fire',
        'sword-fight', 'magic-spell', 'mecha-robot',
        'ninja-run', 'pirate-ship', 'demon-king',
        'school-anime', 'fantasy-castle', 'space-ship'
    ]
    return f"https://picsum.photos/seed/{random.choice(seeds)}/800/450"
    except:
        pass

    try:
        query = re.sub(r'[^\w\s]', '', title)[:50]
        url = f"https://api.jikan.moe/v4/manga?q={query}&limit=1"
        res = requests.get(url, timeout=8)
        if res.status_code == 200:
            data = res.json()
            if data.get("data"):
                img = data["data"][0].get("images", {}).get("jpg", {}).get("large_image_url", "")
                if img:
                    return img
    except:
        pass

    seeds = [
        'anime-city', 'anime-sunset', 'manga-art', 'tokyo-night',
        'neon-city', 'sakura-tree', 'cyber-tokyo', 'fantasy-world'
    ]
    return f"https://picsum.photos/seed/{random.choice(seeds)}/800/450"


def get_anime_details(title):
    try:
        query = re.sub(r'[^\w\s]', '', title)[:50]
        url = f"https://api.jikan.moe/v4/anime?q={query}&limit=1"
        res = requests.get(url, timeout=8)
        if res.status_code == 200:
            data = res.json()
            if data.get("data"):
                anime = data["data"][0]
                return {
                    "title_jp": anime.get("title_japanese", ""),
                    "episodes": anime.get("episodes", "Unknown"),
                    "status": anime.get("status", "Unknown"),
                    "score": anime.get("score", "N/A"),
                    "synopsis": anime.get("synopsis", "")[:320],
                    "genres": [g["name"] for g in anime.get("genres", [])][:5],
                    "studios": [s["name"] for s in anime.get("studios", [])][:3],
                    "type": anime.get("type", ""),
                    "url": anime.get("url", ""),
                }
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


def call_llama(prompt, max_tokens=700):
    if not os.path.exists(MODEL_PATH):
        print(f"ERROR: Model not found at {MODEL_PATH}")
        return None

    try:
        print("Running local GGUF model...")

        full_prompt = f"""<|im_start|>system
You are an expert anime journalist. Write clear, useful, SEO-friendly anime articles in markdown. Do not invent facts. Keep details practical and relevant.<|im_end|>
<|im_start|>user
{prompt}<|im_end|>
<|im_start|>assistant
"""

        result = subprocess.run(
            [
                "llama-cli",
                "-m", MODEL_PATH,
                "-p", full_prompt,
                "-c", "2048",
                "-n", str(max_tokens),
                "-t", "2",
                "--temp", "0.6",
                "--top-p", "0.9",
                "--repeat-penalty", "1.08",
                "--no-display-prompt",
                "-ngl", "0"
            ],
            capture_output=True,
            text=True,
            timeout=180
        )

        output = result.stdout.strip()

        if "<|im_end|>" in output:
            output = output.split("<|im_end|>")[0].strip()

        if output and len(output) > 150:
            print(f"Model output: {len(output)} chars")
            return output

        if result.stderr:
            print(f"Model stderr: {result.stderr[:300]}")

    except subprocess.TimeoutExpired:
        print("Model timeout (3 min)")
    except Exception as e:
        print(f"Model error: {e}")

    return None


def make_article(data, anime_info=None):
    extra = ""
    if anime_info:
        extra = f"""
Anime details:
- Japanese title: {anime_info.get('title_jp', '')}
- Type: {anime_info.get('type', '')}
- Episodes: {anime_info.get('episodes', '')}
- Score: {anime_info.get('score', '')}
- Genres: {', '.join(anime_info.get('genres', []))}
- Studios: {', '.join(anime_info.get('studios', []))}
- Synopsis: {anime_info.get('synopsis', '')}
"""

    prompt = f"""Write a detailed anime article from this source info.

Title: {data['title']}
Source: {data['source']}
Category: {data['category']}
Summary: {data['summary']}
{extra}

Rules:
- 500 to 800 words
- markdown only
- no frontmatter
- use these sections:
## Introduction
## Main Details
## Why Fans Care
## Where to Watch
## What Happens Next
- mention only official platforms
- do not invent specific facts
- make it readable and useful"""

    return call_llama(prompt, 700)


def make_metadata(data, content):
    title = data["title"][:60]
    excerpt = data["summary"][:155]

    words = data["title"].lower().split()
    base_tags = data.get("tags", ["anime", "news"])
    extra_tags = [
        w for w in words
        if len(w) > 3 and w not in [
            'the', 'and', 'for', 'with', 'from', 'this',
            'that', 'episode', 'season'
        ]
    ]
    all_tags = list(set(base_tags + extra_tags[:5]))[:8]

    return {
        "title": title,
        "excerpt": excerpt,
        "tags": all_tags
    }


def build_markdown(data, content, meta, anime_info=None, streaming_links=None):
    slug = slugify(meta.get("title", data["title"]))[:80]
    date_prefix = data["date"].replace("-", "")[:8]
    full_slug = f"{date_prefix}-{slug}"

    tags = meta.get("tags", data.get("tags", []))
    if not isinstance(tags, list):
        tags = ["anime", "news"]

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
        body = fm + f"""## {data['title']}

{data['summary']}

"""
        if anime_info:
            body += f"""### Anime Information

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

            if anime_info.get("synopsis"):
                body += f"""### Synopsis

{anime_info['synopsis']}

"""

        body += """### Why Fans Care

This update matters for anime fans because it affects viewing trends, community discussion, and future expectations around the series.

### What Happens Next

More updates may follow as additional announcements, release details, or official confirmations become available.

"""

    if streaming_links:
        body += f"""
### Where to Watch (Official Only)

| Platform | Link |
|----------|------|
| Crunchyroll | [Search on Crunchyroll]({streaming_links['crunchyroll']}) |
| Netflix | [Search on Netflix]({streaming_links['netflix']}) |
| Amazon Prime | [Search on Amazon]({streaming_links['amazon']}) |
| HIDIVE | [Search on HIDIVE]({streaming_links['hidive']}) |

> Availability depends on your region.

"""

    body += f"\n---\n\n*Source: [{data['source']}]({data['url']}) | AniTube Buzz*\n"
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

        anime_info = get_anime_details(article['title'])
        time.sleep(1)

        real_image = get_anime_image(article['title'])
        if real_image:
            article['image'] = real_image
        time.sleep(1)

        streaming_links = get_streaming_links(article['title'])

        content = make_article(article, anime_info)
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
            time.sleep(2)

    return processed
