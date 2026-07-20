#!/usr/bin/env python3

import os
import json
import re
import time
import random
import subprocess
import requests
from slugify import slugify


MODEL_PATH = os.path.expanduser(
    "~/.cache/gguf-models/qwen2.5-1.5b-instruct-q4_k_m.gguf"
)


def extract_search_terms(title):
    clean = re.sub(r'[^\w\s:-]', '', title).strip()
    parts = re.split(r'[:\-]', clean)
    candidates = []

    if parts:
        candidates.append(parts[0].strip())

    candidates.append(clean)
    candidates.append(' '.join(clean.split()[:4]))
    candidates.append(' '.join(clean.split()[:3]))
    candidates.append(' '.join(clean.split()[:2]))

    noise = [
        'episode', 'season', 'chapter', 'review',
        'recap', 'news', 'confirmed', 'trailer'
    ]

    final_terms = []
    for c in candidates:
        words = [w for w in c.split() if w.lower() not in noise]
        term = ' '.join(words).strip()
        if term and term not in final_terms:
            final_terms.append(term[:50])

    return final_terms[:5]


def get_anime_image(title):
    search_terms = extract_search_terms(title)

    for term in search_terms:
        try:
            url = f"https://api.jikan.moe/v4/anime?q={term}&limit=5"
            res = requests.get(url, timeout=8)
            if res.status_code == 200:
                data = res.json()
                for item in data.get("data", []):
                    img = (
                        item.get("images", {})
                        .get("jpg", {})
                        .get("large_image_url", "")
                    )
                    if img and "questionmark" not in img:
                        print(f"Anime image found: {item.get('title', '')[:30]}")
                        return img
            time.sleep(1)
        except Exception as e:
            print(f"Anime search error: {e}")

    for term in search_terms[:3]:
        try:
            url = f"https://api.jikan.moe/v4/manga?q={term}&limit=5"
            res = requests.get(url, timeout=8)
            if res.status_code == 200:
                data = res.json()
                for item in data.get("data", []):
                    img = (
                        item.get("images", {})
                        .get("jpg", {})
                        .get("large_image_url", "")
                    )
                    if img and "questionmark" not in img:
                        print(f"Manga image found: {item.get('title', '')[:30]}")
                        return img
            time.sleep(1)
        except Exception as e:
            print(f"Manga search error: {e}")

    seeds = [
        'anime-city', 'anime-sunset', 'manga-art',
        'tokyo-night', 'neon-city', 'sakura-tree',
        'cyber-tokyo', 'fantasy-world', 'sword-hero'
    ]
    return f"https://picsum.photos/seed/{random.choice(seeds)}/800/450"


def get_anime_details(title):
    search_terms = extract_search_terms(title)

    for term in search_terms[:3]:
        try:
            url = f"https://api.jikan.moe/v4/anime?q={term}&limit=1"
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
                        "genres": [
                            g["name"] for g in anime.get("genres", [])
                        ][:5],
                        "studios": [
                            s["name"] for s in anime.get("studios", [])
                        ][:3],
                        "type": anime.get("type", ""),
                        "url": anime.get("url", ""),
                    }
            time.sleep(1)
        except Exception as e:
            print(f"Anime details error: {e}")

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
        print(f"Model not found: {MODEL_PATH}")
        return None

    try:
        print("Running local GGUF model...")

        full_prompt = (
            "<|im_start|>system\n"
            "You are an expert anime journalist. "
            "Write clear, useful, SEO-friendly anime articles in markdown. "
            "Do not invent facts.<|im_end|>\n"
            "<|im_start|>user\n"
            f"{prompt}<|im_end|>\n"
            "<|im_start|>assistant\n"
        )

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
        print("Model timeout after 3 minutes")
    except Exception as e:
        print(f"Model error: {e}")

    return None


def make_article(data, anime_info=None):
    extra = ""
    if anime_info:
        genres = ', '.join(anime_info.get('genres', []))
        studios = ', '.join(anime_info.get('studios', []))
        extra = (
            f"\nAnime details:\n"
            f"- Japanese: {anime_info.get('title_jp', '')}\n"
            f"- Type: {anime_info.get('type', '')}\n"
            f"- Episodes: {anime_info.get('episodes', '')}\n"
            f"- Score: {anime_info.get('score', '')}\n"
            f"- Genres: {genres}\n"
            f"- Studios: {studios}\n"
            f"- Synopsis: {anime_info.get('synopsis', '')}\n"
        )

    prompt = (
        f"Write a detailed anime article from this source info.\n\n"
        f"Title: {data['title']}\n"
        f"Source: {data['source']}\n"
        f"Category: {data['category']}\n"
        f"Summary: {data['summary']}\n"
        f"{extra}\n"
        f"Rules:\n"
        f"- 500 to 800 words\n"
        f"- markdown only\n"
        f"- no frontmatter\n"
        f"- use these sections:\n"
        f"## Introduction\n"
        f"## Main Details\n"
        f"## Why Fans Care\n"
        f"## Where to Watch\n"
        f"## What Happens Next\n"
        f"- mention only official platforms\n"
        f"- do not invent specific facts\n"
        f"- make it readable and useful"
    )

    return call_llama(prompt, 700)


def make_metadata(data, content):
    title = data["title"][:60]
    excerpt = data["summary"][:155]

    words = data["title"].lower().split()
    base_tags = data.get("tags", ["anime", "news"])

    skip_words = [
        'the', 'and', 'for', 'with', 'from',
        'this', 'that', 'episode', 'season'
    ]

    extra_tags = [
        w for w in words
        if len(w) > 3 and w not in skip_words
    ]

    all_tags = list(set(base_tags + extra_tags[:5]))[:8]

    return {
        "title": title,
        "excerpt": excerpt,
        "tags": all_tags
    }


def build_markdown(data, content, meta, anime_info=None, streaming_links=None):
    title_str = meta.get("title", data["title"])
    slug = slugify(title_str)[:80]
    date_prefix = data["date"].replace("-", "")[:8]
    full_slug = f"{date_prefix}-{slug}"

    tags = meta.get("tags", data.get("tags", []))
    if not isinstance(tags, list):
        tags = ["anime", "news"]

    image = data.get("image", "")
    if not image:
        image = get_anime_image(data["title"])

    title_clean = title_str.replace('"', "'")
    excerpt_clean = meta.get(
        "excerpt", data["summary"][:155]
    ).replace('"', "'")

    fm = (
        "---\n"
        f'title: "{title_clean}"\n'
        f'excerpt: "{excerpt_clean}"\n'
        f'category: "{data["category"]}"\n'
        f'tags: {json.dumps(tags)}\n'
        'author: "AniTube Buzz"\n'
        f'date: "{data["date"]}"\n'
        f'image: "{image}"\n'
        f'imageAlt: "{title_clean}"\n'
        "featured: false\n"
        "trending: false\n"
        "draft: false\n"
        f'source: "{data["url"]}"\n'
        "---\n\n"
    )

    if content:
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                content = parts[2].strip()
        body = fm + content.strip()
    else:
        rows = ""
        if anime_info:
            genres = ', '.join(anime_info.get('genres', []))
            studios = ', '.join(anime_info.get('studios', []))
            rows = (
                "\n### Anime Information\n\n"
                "| Detail | Info |\n"
                "|--------|------|\n"
                f"| Japanese Title | {anime_info.get('title_jp', 'N/A')} |\n"
                f"| Type | {anime_info.get('type', 'N/A')} |\n"
                f"| Episodes | {anime_info.get('episodes', 'N/A')} |\n"
                f"| Status | {anime_info.get('status', 'N/A')} |\n"
                f"| Score | {anime_info.get('score', 'N/A')}/10 |\n"
                f"| Genres | {genres} |\n"
                f"| Studios | {studios} |\n\n"
            )

            if anime_info.get("synopsis"):
                rows += (
                    "### Synopsis\n\n"
                    f"{anime_info['synopsis']}\n\n"
                )

        body = (
            fm
            + f"## {data['title']}\n\n"
            + f"{data['summary']}\n\n"
            + rows
            + "### Why Fans Care\n\n"
            + "This update matters for fans following the series.\n\n"
            + "### What Happens Next\n\n"
            + "More details will follow as official announcements arrive.\n\n"
        )

    if streaming_links:
        body += (
            "\n### Where to Watch (Official Only)\n\n"
            "| Platform | Link |\n"
            "|----------|------|\n"
            f"| Crunchyroll | [Search]({streaming_links['crunchyroll']}) |\n"
            f"| Netflix | [Search]({streaming_links['netflix']}) |\n"
            f"| Amazon | [Search]({streaming_links['amazon']}) |\n"
            f"| HIDIVE | [Search]({streaming_links['hidive']}) |\n\n"
            "> Availability depends on your region.\n\n"
        )

    body += f"\n---\n\n*Source: [{data['source']}]({data['url']}) | AniTube Buzz*\n"
    return full_slug, body


def save_article(slug, content):
    posts_dir = os.path.join(
        os.path.dirname(__file__),
        "..",
        "src",
        "content",
        "posts"
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

        slug, markdown = build_markdown(
            article, content, meta, anime_info, streaming_links
        )
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
