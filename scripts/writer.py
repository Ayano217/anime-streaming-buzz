#!/usr/bin/env python3

import os
import json
import re
import time
import requests
from slugify import slugify


OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

MODELS = [
    "meta-llama/llama-3.2-3b-instruct:free",
    "qwen/qwen-2.5-7b-instruct:free",
    "mistralai/mistral-7b-instruct:free",
    "google/gemma-2-9b-it:free"
]


def call_ai(prompt, max_tokens=1200):
    if not OPENROUTER_API_KEY:
        print("ERROR: No API key")
        return None

    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://anime-streaming-buzz.pages.dev",
        "X-Title": "AniTube Buzz"
    }

    for model in MODELS:
        try:
            print(f"Trying: {model}")
            payload = {
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are an anime news writer. "
                            "Write clear, engaging, SEO-friendly articles. "
                            "Use markdown. Do not invent facts."
                        )
                    },
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.7,
                "max_tokens": max_tokens
            }

            res = requests.post(url, headers=headers, json=payload, timeout=90)

            if res.status_code != 200:
                print(f"Failed {model}: {res.status_code}")
                time.sleep(2)
                continue

            data = res.json()
            text = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )

            if text and len(text.strip()) > 100:
                print(f"Success: {model}")
                return text.strip()

        except Exception as e:
            print(f"Error {model}: {e}")
            time.sleep(2)
            continue

    return None


def make_article(data):
    prompt = f"""Write an anime news article.

TITLE: {data['title']}
SOURCE: {data['source']}
CATEGORY: {data['category']}
SUMMARY: {data['summary']}

Requirements:
- 400-600 words
- Markdown with ## headings
- Engaging intro
- 2-3 sections
- No frontmatter
- No invented facts

Write now:"""
    return call_ai(prompt, 1400)


def make_metadata(data, content):
    preview = content[:400] if content else data["summary"]
    prompt = f"""SEO metadata for this anime article.

TITLE: {data['title']}
PREVIEW: {preview}

Return ONLY this JSON:
{{
  "title": "max 60 chars",
  "excerpt": "max 155 chars",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}}"""

    res = call_ai(prompt, 300)
    fallback = {
        "title": data["title"][:60],
        "excerpt": data["summary"][:155],
        "tags": data.get("tags", [])
    }

    if not res:
        return fallback

    try:
        cleaned = res.replace("```json", "").replace("```", "").strip()
        s = cleaned.find("{")
        e = cleaned.rfind("}")
        if s != -1 and e > s:
            meta = json.loads(cleaned[s:e+1])
            meta["title"] = meta.get("title", fallback["title"])[:60]
            meta["excerpt"] = meta.get("excerpt", fallback["excerpt"])[:155]
            if not isinstance(meta.get("tags"), list):
                meta["tags"] = fallback["tags"]
            return meta
    except Exception as ex:
        print(f"Metadata parse error: {ex}")

    return fallback


def build_markdown(data, content, meta):
    slug = slugify(meta.get("title", data["title"]))[:80]
    date_prefix = data["date"].replace("-", "")[:8]
    full_slug = f"{date_prefix}-{slug}"

    tags = meta.get("tags", data.get("tags", []))
    if not isinstance(tags, list):
        tags = data.get("tags", [])

    image = data.get("image", "")
    if not image:
        seed = re.sub(r"[^a-z0-9]", "", slug.lower())[:20]
        image = f"https://picsum.photos/seed/{seed}/800/450"

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

### What This Means for Fans

Keep an eye on official channels for more updates on this story.

### Why It Matters

News like this shapes the anime streaming landscape and community discussions.

---

*Source: [{data['source']}]({data['url']})*
"""

    body += f"\n\n---\n\n*Source: [{data['source']}]({data['url']}) | AniTube Buzz*\n"
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
        print(f"\n--- Article {i+1}/{len(articles)}: {article['title'][:60]} ---")

        content = make_article(article)
        meta = make_metadata(article, content)
        slug, markdown = build_markdown(article, content, meta)
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
