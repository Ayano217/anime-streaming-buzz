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
        'recap', 'news', 'confirmed', 'trailer',
        'official', 'update', 'revealed', 'anime'
    ]
    final_terms = []
    for c in candidates:
        words = [w for w in c.split() if w.lower() not in noise]
        term = ' '.join(words).strip()
        if term and term not in final_terms and len(term) > 2:
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
                        print(f"Anime image: {item.get('title', '')[:30]}")
                        return img
            time.sleep(1)
        except Exception as e:
            print(f"Anime image error: {e}")

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
                        print(f"Manga image: {item.get('title', '')[:30]}")
                        return img
            time.sleep(1)
        except Exception as e:
            print(f"Manga image error: {e}")

    seeds = [
        'anime-city', 'anime-sunset', 'manga-art',
        'tokyo-night', 'neon-city', 'sakura-tree',
        'cyber-tokyo', 'fantasy-world', 'sword-hero',
        'anime-hero', 'dragon-fire', 'magic-spell'
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
                        "trailer_url": anime.get("trailer", {}).get("url", ""),
                        "trailer_embed": anime.get("trailer", {}).get("embed_url", ""),
                    }
            time.sleep(1)
        except Exception as e:
            print(f"Anime details error: {e}")
    return None


def get_youtube_video(title, anime_info=None):
    if anime_info:
        for key in ["trailer_embed", "trailer_url"]:
            url = anime_info.get(key, "")
            if url:
                match = re.search(
                    r'(?:v=|embed/|youtu\.be/)([a-zA-Z0-9_-]{11})', url
                )
                if match:
                    video_id = match.group(1)
                    print(f"Jikan trailer: {video_id}")
                    return video_id

    try:
        search_terms = extract_search_terms(title)
        term = search_terms[0] if search_terms else title[:40]
        query = f"{term} anime official trailer"
        url = (
            f"https://www.youtube.com/results"
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
                print(f"YouTube video: {ids[0]}")
                return ids[0]
    except Exception as e:
        print(f"YouTube error: {e}")

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
    llama_paths = [
        os.path.expanduser("~/.cache/llama-bin/llama-cli"),
        "/usr/local/bin/llama-cli",
        "llama-cli",
    ]

    llama_bin = None
    for path in llama_paths:
        if path == "llama-cli":
            import shutil
            if shutil.which("llama-cli"):
                llama_bin = "llama-cli"
                break
        elif os.path.isfile(path) and os.access(path, os.X_OK):
            llama_bin = path
            break

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
            "You are an expert anime journalist. "
            "Write clear, useful, SEO-friendly anime articles in markdown. "
            "Do not invent facts. "
            "Write engaging content for anime fans.<|im_end|>\n"
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
        studios = ', '.join(anime_info.get('studios', []))
        extra = (
            f"\nAnime details:\n"
            f"- Japanese: {anime_info.get('title_jp', 'N/A')}\n"
            f"- Type: {anime_info.get('type', 'N/A')}\n"
            f"- Episodes: {anime_info.get('episodes', 'N/A')}\n"
            f"- Score: {anime_info.get('score', 'N/A')}/10\n"
            f"- Genres: {genres}\n"
            f"- Studios: {studios}\n"
            f"- Synopsis: {anime_info.get('synopsis', 'N/A')}\n"
        )

    prompt = (
        f"Write a detailed, engaging anime news article.\n\n"
        f"Title: {data['title']}\n"
        f"Source: {data['source']}\n"
        f"Category: {data['category']}\n"
        f"Summary: {data['summary']}\n"
        f"{extra}\n"
        f"Requirements:\n"
        f"- 500 to 800 words\n"
        f"- Use markdown with ## headings\n"
        f"- No YAML frontmatter\n"
        f"- Sections: Introduction, Main Details, "
        f"Why Fans Care, Community Reaction, What Happens Next\n"
        f"- Only mention facts from the source\n"
        f"- Write naturally like a real journalist"
    )

    return call_llama(prompt, 700)


def make_metadata(data, content):
    title = data["title"][:60]
    excerpt = data["summary"][:155]

    words = data["title"].lower().split()
    base_tags = data.get("tags", ["anime", "news"])

    skip_words = [
        'the', 'and', 'for', 'with', 'from', 'this',
        'that', 'episode', 'season', 'are', 'has',
        'was', 'will', 'been', 'have', 'its', 'into'
    ]

    extra_tags = [
        w for w in words
        if len(w) > 3 and w not in skip_words
    ]

    all_tags = list(set(base_tags + extra_tags[:5]))[:8]
    clean_tags = [
        t.lower().replace('/', '-').replace(' ', '-')
        for t in all_tags
    ]

    return {
        "title": title,
        "excerpt": excerpt,
        "tags": clean_tags
    }


def build_markdown(
    data, content, meta,
    anime_info=None,
    streaming_links=None,
    video_id=None
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
        body = fm + content.strip() + "\n\n"
    else:
        synopsis = ""
        if anime_info and anime_info.get("synopsis"):
            synopsis = f"**Synopsis:** {anime_info['synopsis']}\n\n"

        table = ""
        if anime_info:
            genres = ', '.join(anime_info.get('genres', []))
            studios = ', '.join(anime_info.get('studios', []))
            table = (
                "### Anime Details\n\n"
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

        body = (
            fm
            + f"## {data['title']}\n\n"
            + f"{data['summary']}\n\n"
            + synopsis
            + table
            + "### Why This Matters\n\n"
            + "This story continues to shape discussions in the anime community.\n\n"
            + "### What to Expect Next\n\n"
            + "Stay tuned to AniTube Buzz for the latest updates.\n\n"
        )

    if video_id:
        body += (
            "### Watch Trailer\n\n"
            f'<iframe width="100%" height="400" '
            f'src="https://www.youtube.com/embed/{video_id}" '
            f'title="YouTube video" '
            f'frameborder="0" '
            f'allow="accelerometer; autoplay; clipboard-write; '
            f'encrypted-media; gyroscope; picture-in-picture" '
            f'allowfullscreen '
            f'style="border-radius:12px; margin:20px 0;">'
            f'</iframe>\n\n'
        )

    if streaming_links:
        body += (
            "### Where to Watch Officially\n\n"
            "| Platform | Link |\n"
            "|----------|------|\n"
            f"| 🟠 Crunchyroll | [Search]({streaming_links['crunchyroll']}) |\n"
            f"| 🔴 Netflix | [Search]({streaming_links['netflix']}) |\n"
            f"| 🔵 Amazon Prime | [Search]({streaming_links['amazon']}) |\n"
            f"| 🟢 HIDIVE | [Search]({streaming_links['hidive']}) |\n\n"
            "> Availability varies by region.\n\n"
        )

    body += (
        "---\n\n"
        f"*Source: [{data['source']}]({data['url']}) | AniTube Buzz*\n"
    )

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

        print("Fetching anime details...")
        anime_info = get_anime_details(article['title'])
        time.sleep(1)

        print("Fetching image...")
        real_image = get_anime_image(article['title'])
        if real_image:
            article['image'] = real_image
        time.sleep(1)

        print("Searching YouTube trailer...")
        video_id = get_youtube_video(article['title'], anime_info)
        time.sleep(1)

        streaming_links = get_streaming_links(article['title'])

        print("Generating article...")
        content = make_article(article, anime_info)

        meta = make_metadata(article, content)

        slug, markdown = build_markdown(
            article, content, meta,
            anime_info=anime_info,
            streaming_links=streaming_links,
            video_id=video_id
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
