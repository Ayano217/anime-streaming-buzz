#!/usr/bin/env python3
"""
AniTube Buzz - AI Article Generator
Uses OpenRouter free open-source models via direct HTTP requests
"""

import os
import json
import re
import time
import requests
from slugify import slugify


OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

FREE_MODELS = [
    "meta-llama/llama-3.2-3b-instruct:free",
    "qwen/qwen-2.5-7b-instruct:free",
    "mistralai/mistral-7b-instruct:free",
    "google/gemma-2-9b-it:free"
]


def call_ai(prompt, max_tokens=1200):
    """Call OpenRouter using plain requests"""

    if not OPENROUTER_API_KEY:
        print("ERROR: OPENROUTER_API_KEY missing")
        return None

    url = "https://openrouter.ai/api/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://anime-streaming-buzz.pages.dev",
        "X-Title": "AniTube Buzz"
    }

    system_prompt = (
        "You are an expert anime news writer for AniTube Buzz. "
        "Write engaging, SEO-friendly, clear articles about anime, manga, manhwa, "
        "streaming updates, and fandom news. "
        "Do not invent precise facts if the source summary is limited. "
        "Use markdown formatting."
    )

    for model in FREE_MODELS:
        try:
            print(f"Trying model: {model}")

            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.7,
                "max_tokens": max_tokens
            }

            response = requests.post(
                url,
                headers=headers,
                json=payload,
                timeout=90
            )

            if response.status_code != 200:
                print(f"Model {model} failed with status {response.status_code}")
                print(response.text[:300])
                time.sleep(2)
                continue

            data = response.json()
            content = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )

            if content and len(content.strip()) > 100:
                print(f"Success with model: {model}")
                return content.strip()

        except Exception as e:
            print(f"Model {model} error: {e}")
            time.sleep(2)
            continue

    return None


def generate_article_content(article_data):
    """Generate article body"""

    prompt = f"""Write a detailed anime news article based on this source info.

TITLE: {article_data['title']}
SOURCE: {article_data['source']}
CATEGORY: {article_data['category']}
SUMMARY: {article_data['summary']}
DATE: {article_data['date']}

Requirements:
1. Write 400-600 words
2. Use markdown formatting
3. Start with an engaging intro
4. Use 2-3 ## section headings
5. Add useful context for anime fans
6. End with a short conclusion
7. Do not copy the summary word-for-word
8. Do not include YAML frontmatter
9. Only use facts that are reasonably supported by the source title/summary

Now write the article.
"""

    return call_ai(prompt, max_tokens=1400)


def generate_metadata(article_data, content):
    """Generate SEO metadata"""

    preview = content[:500] if content else article_data["summary"]

    prompt = f"""Generate SEO metadata for this anime article.

TITLE: {article_data['title']}
CATEGORY: {article_data['category']}
CONTENT PREVIEW: {preview}

Return ONLY valid JSON in this exact format:
{{
  "title": "SEO title max 60 chars",
  "excerpt": "Meta description max 155 chars",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}}
"""

    response = call_ai(prompt, max_tokens=300)

    fallback = {
        "title": article_data["title"][:60],
        "excerpt": article_data["summary"][:155],
        "tags": article_data.get("tags", [])
    }

    if not response:
        return fallback

    try:
        cleaned = response.strip()
        cleaned = cleaned.replace("```json", "").replace("```", "").strip()

        start = cleaned.find("{")
        end = cleaned.rfind("}")

        if start != -1 and end != -1 and end > start:
            json_text = cleaned[start:end + 1]
            metadata = json.loads(json_text)

            if not isinstance(metadata.get("tags", []), list):
                metadata["tags"] = fallback["tags"]

            metadata["title"] = metadata.get("title", fallback["title"])[:60]
            metadata["excerpt"] = metadata.get("excerpt", fallback["excerpt"])[:155]

            return metadata

    except Exception as e:
        print(f"Metadata parse failed: {e}")

    return fallback


def create_markdown_file(article_data, content, metadata):
    """Create markdown file content"""

    slug = slugify(metadata.get("title", article_data["title"]))
    if not slug:
        slug = slugify(article_data["title"])

    slug = slug[:80]
    date_prefix = article_data["date"].replace("-", "")[:8]
    full_slug = f"{date_prefix}-{slug}"

    tags = metadata.get("tags", article_data.get("tags", []))
    if not isinstance(tags, list):
        tags = article_data.get("tags", [])

    tags_yaml = json.dumps(tags, ensure_ascii=False)

    image = article_data.get("image", "")
    if not image:
        seed = re.sub(r"[^a-z0-9]", "", slug.lower())[:20]
        image = f"https://picsum.photos/seed/{seed}/800/450"

    clean_title = metadata.get("title", article_data["title"]).replace('"', "'")
    clean_excerpt = metadata.get("excerpt", article_data["summary"][:155]).replace('"', "'")

    frontmatter = f"""---
title: "{clean_title}"
excerpt: "{clean_excerpt}"
category: "{article_data['category']}"
tags: {tags_yaml}
author: "AniTube Buzz"
date: "{article_data['date']}"
image: "{image}"
imageAlt: "{clean_title}"
featured: false
trending: false
draft: false
source: "{article_data['url']}"
---

"""

    if content:
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                content = parts[2].strip()

        full_content = frontmatter + content.strip()
    else:
        full_content = frontmatter + f"""## {article_data['title']}

{article_data['summary']}

This update is currently developing, and more context may emerge as additional information becomes available.

### What Fans Should Watch For

Anime and manga fans should keep an eye on future announcements, platform updates, and official confirmations related to this topic.

### Why It Matters

Stories like this often shape streaming trends, community discussions, and future releases in the anime space.

---

*Source: [{article_data['source']}]({article_data['url']})*
"""

    full_content += f"""

---

*Source: [{article_data['source']}]({article_data['url']}) | Published on AniTube Buzz*
"""

    return full_slug, full_content


def save_article(slug, content):
    """Save markdown file"""

    posts_dir = os.path.join(
        os.path.dirname(__file__),
        "..",
        "src",
        "content",
        "posts"
    )
    os.makedirs(posts_dir, exist_ok=True)

    filepath = os.path.join(posts_dir, f"{slug}.md")

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"Saved: {filepath}")
    return filepath


def process_articles(articles):
    """Process fetched articles"""

    if not articles:
        print("No articles to process")
        return []

    processed = []

    for i, article in enumerate(articles):
        print(f"\n--- Processing article {i+1}/{len(articles)} ---")
        print(f"Title: {article['title']}")

        print("Generating article...")
        content = generate_article_content(article)

        print("Generating metadata...")
        metadata = generate_metadata(article, content)
        print(f"SEO title: {metadata.get('title', 'N/A')}")

        slug, markdown = create_markdown_file(article, content, metadata)
        filepath = save_article(slug, markdown)

        processed.append({
            "slug": slug,
            "title": article["title"],
            "url": article["url"],
            "filepath": filepath
        })

        if i < len(articles) - 1:
            time.sleep(3)

    return processed
