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
    candidates.extend([
        clean,
        ' '.join(clean.split()[:4]),
        ' '.join(clean.split()[:3]),
        ' '.join(clean.split()[:2]),
    ])
    noise = [
        'episode', 'season', 'chapter', 'review', 'recap',
        'news', 'confirmed', 'trailer', 'official', 'update',
        'revealed', 'anime', 'manga', 'the', 'and', 'for'
    ]
    final_terms = []
    for c in candidates:
        words = [w for w in c.split() if w.lower() not in noise]
        term = ' '.join(words).strip()
        if term and term not in final_terms and len(term) > 2:
            final_terms.append(term[:50])
    return final_terms[:5]


def get_best_anime_image(title):
    """Get highest quality official image from Jikan"""
    search_terms = extract_search_terms(title)

    for term in search_terms:
        try:
            url = f"https://api.jikan.moe/v4/anime?q={term}&limit=5&order_by=popularity"
            res = requests.get(url, timeout=10)
            if res.status_code == 200:
                data = res.json()
                for item in data.get("data", []):
                    images = item.get("images", {})
                    # Try webp first (highest quality), then jpg
                    img = (
                        images.get("webp", {}).get("large_image_url", "") or
                        images.get("jpg", {}).get("large_image_url", "")
                    )
                    if img and "questionmark" not in img:
                        print(f"HQ anime image: {item.get('title', '')[:30]}")
                        return img, item
            time.sleep(1)
        except Exception as e:
            print(f"Image search error: {e}")

    for term in search_terms[:3]:
        try:
            url = f"https://api.jikan.moe/v4/manga?q={term}&limit=5"
            res = requests.get(url, timeout=10)
            if res.status_code == 200:
                data = res.json()
                for item in data.get("data", []):
                    images = item.get("images", {})
                    img = (
                        images.get("webp", {}).get("large_image_url", "") or
                        images.get("jpg", {}).get("large_image_url", "")
                    )
                    if img and "questionmark" not in img:
                        print(f"HQ manga image: {item.get('title', '')[:30]}")
                        return img, None
            time.sleep(1)
        except Exception as e:
            print(f"Manga image error: {e}")

    return "", None


def get_anime_details(title, jikan_item=None):
    """Get full anime details from Jikan"""
    if jikan_item:
        anime = jikan_item
        return {
            "mal_id": anime.get("mal_id", ""),
            "title": anime.get("title", ""),
            "title_jp": anime.get("title_japanese", ""),
            "title_en": anime.get("title_english", ""),
            "type": anime.get("type", ""),
            "episodes": anime.get("episodes", "Unknown"),
            "status": anime.get("status", "Unknown"),
            "score": anime.get("score", "N/A"),
            "scored_by": anime.get("scored_by", 0),
            "rank": anime.get("rank", "N/A"),
            "popularity": anime.get("popularity", "N/A"),
            "synopsis": (anime.get("synopsis", "") or "")[:500],
            "background": (anime.get("background", "") or "")[:300],
            "genres": [g["name"] for g in anime.get("genres", [])][:6],
            "themes": [t["name"] for t in anime.get("themes", [])][:4],
            "studios": [s["name"] for s in anime.get("studios", [])][:3],
            "producers": [p["name"] for p in anime.get("producers", [])][:3],
            "source": anime.get("source", ""),
            "duration": anime.get("duration", ""),
            "rating": anime.get("rating", ""),
            "season": anime.get("season", ""),
            "year": anime.get("year", ""),
            "aired": anime.get("aired", {}).get("string", ""),
            "trailer_url": anime.get("trailer", {}).get("url", ""),
            "trailer_embed": anime.get("trailer", {}).get("embed_url", ""),
            "url": anime.get("url", ""),
        }

    search_terms = extract_search_terms(title)
    for term in search_terms[:3]:
        try:
            url = f"https://api.jikan.moe/v4/anime?q={term}&limit=1"
            res = requests.get(url, timeout=10)
            if res.status_code == 200:
                data = res.json()
                if data.get("data"):
                    return get_anime_details(title, data["data"][0])
            time.sleep(1)
        except Exception as e:
            print(f"Details error: {e}")

    return None


def get_anime_characters(mal_id):
    """Get top characters and voice actors"""
    if not mal_id:
        return []
    try:
        url = f"https://api.jikan.moe/v4/anime/{mal_id}/characters"
        res = requests.get(url, timeout=10)
        if res.status_code == 200:
            data = res.json()
            characters = []
            for char in data.get("data", [])[:6]:
                char_info = char.get("character", {})
                voices = char.get("voice_actors", [])
                va_en = next(
                    (v for v in voices if v.get("language") == "Japanese"),
                    None
                )
                characters.append({
                    "name": char_info.get("name", ""),
                    "image": (
                        char_info.get("images", {})
                        .get("jpg", {})
                        .get("image_url", "")
                    ),
                    "role": char.get("role", ""),
                    "va": va_en.get("person", {}).get("name", "") if va_en else "",
                })
            time.sleep(1)
            return characters
    except Exception as e:
        print(f"Characters error: {e}")
    return []


def get_youtube_video(title, anime_info=None):
    """Get official YouTube trailer"""
    if anime_info:
        for key in ["trailer_embed", "trailer_url"]:
            url = anime_info.get(key, "")
            if url:
                match = re.search(
                    r'(?:v=|embed/|youtu\.be/)([a-zA-Z0-9_-]{11})',
                    url
                )
                if match:
                    video_id = match.group(1)
                    print(f"Jikan trailer: {video_id}")
                    return video_id

    try:
        search_terms = extract_search_terms(title)
        term = search_terms[0] if search_terms else title[:40]
        query = f"{term} anime official trailer PV"
        url = (
            "https://www.youtube.com/results"
            f"?search_query={query.replace(' ', '+')}"
        )
        headers = {
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/120.0.0.0 Safari/537.36'
            )
        }
        res = requests.get(url, headers=headers, timeout=10)
        if res.status_code == 200:
            ids = re.findall(r'"videoId":"([a-zA-Z0-9_-]{11})"', res.text)
            if ids:
                print(f"YouTube: {ids[0]}")
                return ids[0]
    except Exception as e:
        print(f"YouTube error: {e}")

    return None


def get_official_watch_links(title, anime_info=None):
    """Get direct official streaming page links"""
    query = title.replace(' ', '+')
    slug_title = title.lower().replace(' ', '-').replace(':', '')

    links = {
        "crunchyroll_search": f"https://www.crunchyroll.com/search?q={query}",
        "netflix_search": f"https://www.netflix.com/search?q={query}",
        "amazon_search": f"https://www.amazon.com/s?k={query}+anime",
        "hidive_search": f"https://www.hidive.com/search?q={query}",
    }

    if anime_info and anime_info.get("url"):
        links["myanimelist"] = anime_info["url"]

    return links


def call_llama(prompt, max_tokens=700):
    llama_paths = [
        os.path.expanduser("~/.cache/llama-bin/llama-cli"),
        "/usr/local/bin/llama-cli",
    ]

    llama_bin = None
    for path in llama_paths:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            llama_bin = path
            break

    if not llama_bin:
        import shutil
        if shutil.which("llama-cli"):
            llama_bin = "llama-cli"

    if not llama_bin:
        print("llama-cli not found")
        return None

    if not os.path.exists(MODEL_PATH):
        print(f"Model not found: {MODEL_PATH}")
        return None

    try:
        print(f"Running: {llama_bin}")

        full_prompt = (
            "<|im_start|>system\n"
            "You are a professional anime journalist writing for AniTube Buzz. "
            "Write detailed, engaging, SEO-optimized articles about anime news. "
            "Be informative and enthusiastic. Do not invent specific facts. "
            "Use proper markdown formatting with headings and paragraphs.<|im_end|>\n"
            "<|im_start|>user\n"
            f"{prompt}<|im_end|>\n"
            "<|im_start|>assistant\n"
        )

        result = subprocess.run(
            [
                llama_bin,
                "-m", MODEL_PATH,
                "-p", full_prompt,
                "-c", "2048",
                "-n", str(max_tokens),
                "-t", "2",
                "--temp", "0.65",
                "--top-p", "0.92",
                "--repeat-penalty", "1.1",
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
        if output and len(output) > 200:
            print(f"Generated: {len(output)} chars")
            return output
        if result.stderr:
            print(f"stderr: {result.stderr[:200]}")

    except subprocess.TimeoutExpired:
        print("Model timeout")
    except Exception as e:
        print(f"Model error: {e}")

    return None


def make_article(data, anime_info=None):
    extra = ""
    if anime_info:
        genres = ', '.join(anime_info.get('genres', []))
        themes = ', '.join(anime_info.get('themes', []))
        studios = ', '.join(anime_info.get('studios', []))
        extra = (
            f"\nDetailed Anime Information:\n"
            f"- Japanese Title: {anime_info.get('title_jp', 'N/A')}\n"
            f"- English Title: {anime_info.get('title_en', 'N/A')}\n"
            f"- Type: {anime_info.get('type', 'N/A')}\n"
            f"- Episodes: {anime_info.get('episodes', 'N/A')}\n"
            f"- Status: {anime_info.get('status', 'N/A')}\n"
            f"- Score: {anime_info.get('score', 'N/A')}/10\n"
            f"- Rank: #{anime_info.get('rank', 'N/A')}\n"
            f"- Genres: {genres}\n"
            f"- Themes: {themes}\n"
            f"- Studio: {studios}\n"
            f"- Aired: {anime_info.get('aired', 'N/A')}\n"
            f"- Source: {anime_info.get('source', 'N/A')}\n"
            f"- Synopsis: {anime_info.get('synopsis', 'N/A')}\n"
        )

    prompt = (
        f"Write a comprehensive, detailed anime news article.\n\n"
        f"NEWS TITLE: {data['title']}\n"
        f"SOURCE: {data['source']}\n"
        f"CATEGORY: {data['category']}\n"
        f"NEWS SUMMARY: {data['summary']}\n"
        f"{extra}\n\n"
        f"ARTICLE REQUIREMENTS:\n"
        f"- Minimum 600 words, aim for 800\n"
        f"- Engaging introduction (2-3 paragraphs)\n"
        f"- Use ## headings for sections\n"
        f"- Include sections: Overview, Story & Setting, "
        f"Characters, Animation & Production, Fan Reception, Conclusion\n"
        f"- No YAML frontmatter\n"
        f"- Professional journalist tone\n"
        f"- Factual, no invented details\n"
        f"- Include relevant context for anime fans"
    )

    return call_llama(prompt, 1000)


def make_metadata(data, content):
    title = data["title"][:60]
    excerpt = data["summary"][:155]

    words = data["title"].lower().split()
    base_tags = data.get("tags", ["anime", "news"])

    skip_words = {
        'the', 'and', 'for', 'with', 'from', 'this', 'that',
        'episode', 'season', 'are', 'has', 'was', 'will', 'been',
        'have', 'its', 'into', 'also', 'more', 'new', 'gets'
    }

    extra_tags = [
        w for w in words
        if len(w) > 3 and w not in skip_words
    ]

    all_tags = list(set(base_tags + extra_tags[:5]))[:8]
    clean_tags = [
        re.sub(r'[^a-z0-9-]', '', t.lower().replace(' ', '-').replace('/', '-'))
        for t in all_tags
    ]
    clean_tags = [t for t in clean_tags if t]

    return {
        "title": title,
        "excerpt": excerpt,
        "tags": clean_tags
    }


def build_markdown(
    data, content, meta,
    anime_info=None,
    watch_links=None,
    video_id=None,
    characters=None
):
    title_str = meta.get("title", data["title"])
    slug = slugify(title_str)[:80]
    date_prefix = data["date"].replace("-", "")[:8]
    full_slug = f"{date_prefix}-{slug}"

    tags = meta.get("tags", data.get("tags", []))
    if not isinstance(tags, list):
        tags = ["anime", "news"]

    image = data.get("image", "")
    if not image:
        image = f"https://picsum.photos/seed/{slug[:15]}/800/450"

    title_clean = title_str.replace('"', "'")
    excerpt_clean = meta.get("excerpt", data["summary"][:155]).replace('"', "'")

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

    # Main article content
    if content:
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                content = parts[2].strip()
        body = fm + content.strip() + "\n\n"
    else:
        synopsis = ""
        if anime_info and anime_info.get("synopsis"):
            synopsis = f"> {anime_info['synopsis']}\n\n"

        table = ""
        if anime_info:
            genres = ', '.join(anime_info.get('genres', []))
            themes = ', '.join(anime_info.get('themes', []))
            studios = ', '.join(anime_info.get('studios', []))
            table = (
                "## Anime Information\n\n"
                "| Detail | Info |\n"
                "|--------|------|\n"
                f"| 🇯🇵 Japanese Title | {anime_info.get('title_jp', 'N/A')} |\n"
                f"| 📺 Type | {anime_info.get('type', 'N/A')} |\n"
                f"| 🎬 Episodes | {anime_info.get('episodes', 'N/A')} |\n"
                f"| 📊 Status | {anime_info.get('status', 'N/A')} |\n"
                f"| ⭐ Score | {anime_info.get('score', 'N/A')}/10 |\n"
                f"| 🏆 Rank | #{anime_info.get('rank', 'N/A')} |\n"
                f"| 🎭 Genres | {genres} |\n"
                f"| 🎨 Themes | {themes} |\n"
                f"| 🏢 Studio | {studios} |\n"
                f"| 📅 Aired | {anime_info.get('aired', 'N/A')} |\n"
                f"| 📖 Source | {anime_info.get('source', 'N/A')} |\n\n"
            )

        body = (
            fm
            + f"## {data['title']}\n\n"
            + f"{data['summary']}\n\n"
            + synopsis
            + table
            + "## Why This Matters\n\n"
            + "This development continues to shape the anime community's expectations "
            + "and discussions across global platforms.\n\n"
            + "## What to Expect\n\n"
            + "Fans should stay tuned to official channels for further announcements "
            + "and updates as more information becomes available.\n\n"
        )

    # Characters section
    if characters:
        body += "## Main Characters & Voice Cast\n\n"
        body += "| Character | Role | Voice Actor |\n"
        body += "|-----------|------|-------------|\n"
        for char in characters:
            body += (
                f"| {char['name']} "
                f"| {char['role']} "
                f"| {char['va'] or 'TBA'} |\n"
            )
        body += "\n"

    # YouTube trailer
    if video_id:
        body += (
            "## Official Trailer\n\n"
            f'<div style="position:relative;padding-bottom:56.25%;'
            f'height:0;overflow:hidden;border-radius:12px;margin:20px 0;">\n'
            f'<iframe '
            f'style="position:absolute;top:0;left:0;width:100%;height:100%;" '
            f'src="https://www.youtube.com/embed/{video_id}" '
            f'title="Official Trailer" '
            f'frameborder="0" '
            f'allow="accelerometer;autoplay;clipboard-write;'
            f'encrypted-media;gyroscope;picture-in-picture" '
            f'allowfullscreen>'
            f'</iframe>\n'
            f'</div>\n\n'
        )

    # Official watch links
    if watch_links:
        body += "## Watch Officially\n\n"
        body += "> ✅ Always use official platforms to support the creators.\n\n"

        if watch_links.get("crunchyroll_search"):
            body += (
                f'<a href="{watch_links["crunchyroll_search"]}" '
                f'target="_blank" rel="noopener" '
                f'style="display:inline-block;padding:10px 20px;'
                f'background:#F47521;color:#fff;border-radius:8px;'
                f'text-decoration:none;font-weight:bold;margin:5px;">'
                f'🟠 Watch on Crunchyroll</a>\n'
            )

        if watch_links.get("netflix_search"):
            body += (
                f'<a href="{watch_links["netflix_search"]}" '
                f'target="_blank" rel="noopener" '
                f'style="display:inline-block;padding:10px 20px;'
                f'background:#E50914;color:#fff;border-radius:8px;'
                f'text-decoration:none;font-weight:bold;margin:5px;">'
                f'🔴 Watch on Netflix</a>\n'
            )

        if watch_links.get("hidive_search"):
            body += (
                f'<a href="{watch_links["hidive_search"]}" '
                f'target="_blank" rel="noopener" '
                f'style="display:inline-block;padding:10px 20px;'
                f'background:#00A0E4;color:#fff;border-radius:8px;'
                f'text-decoration:none;font-weight:bold;margin:5px;">'
                f'🔵 Watch on HIDIVE</a>\n'
            )

        if watch_links.get("myanimelist"):
            body += (
                f'\n\n📋 [View on MyAnimeList]({watch_links["myanimelist"]})\n'
            )

        body += "\n\n"

    body += (
        "---\n\n"
        f"*Source: [{data['source']}]({data['url']}) | AniTube Buzz*\n"
    )

    return full_slug, body


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
        print(f"Article {i+1}/{len(articles)}: {article['title'][:60]}")
        print(f"{'='*60}")

        # Get best image + jikan item together
        print("Fetching HQ image...")
        image, jikan_item = get_best_anime_image(article['title'])
        if image:
            article['image'] = image
        time.sleep(1)

        # Get full anime details
        print("Fetching anime details...")
        anime_info = get_anime_details(article['title'], jikan_item)
        time.sleep(1)

        # Get characters
        characters = []
        if anime_info and anime_info.get("mal_id"):
            print("Fetching characters...")
            characters = get_anime_characters(anime_info["mal_id"])
            time.sleep(1)

        # YouTube trailer
        print("Finding trailer...")
        video_id = get_youtube_video(article['title'], anime_info)
        time.sleep(1)

        # Official watch links
        watch_links = get_official_watch_links(article['title'], anime_info)

        # Generate article
        print("Generating article...")
        content = make_article(article, anime_info)

        # Metadata
        meta = make_metadata(article, content)

        # Build markdown
        slug, markdown = build_markdown(
            article, content, meta,
            anime_info=anime_info,
            watch_links=watch_links,
            video_id=video_id,
            characters=characters
        )

        path = save_article(slug, markdown)

        processed.append({
            "slug": slug,
            "title": article["title"],
            "url": article["url"],
            "filepath": path
        })

        if i < len(articles) - 1:
            print("Waiting...")
            time.sleep(3)

    return processed
