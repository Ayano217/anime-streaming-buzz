#!/usr/bin/env python3
"""
AniTube Buzz - AI Article Generator
Uses OpenRouter free open-source models
"""

import os
import json
import re
import time
from datetime import datetime
from slugify import slugify

import httpx
from openai import OpenAI


# OpenRouter client
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ.get("OPENROUTER_API_KEY", ""),
    http_client=httpx.Client(
        timeout=60.0,
        follow_redirects=True,
    )
)

# Free models — priority order
FREE_MODELS = [
    "meta-llama/llama-3.2-3b-instruct:free",
    "qwen/qwen-2.5-7b-instruct:free",
    "google/gemma-3-4b-it:free",
    "mistralai/mistral-7b-instruct:free",
    "deepseek/deepseek-r1-distill-qwen-7b:free",
]


def call_ai(prompt, max_tokens=2000):
    """Call OpenRouter AI with fallback models"""

    for model in FREE_MODELS:
        try:
            print(f"Trying model: {model}")

            response = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an expert anime news writer for AniTube Buzz. "
                            "Write engaging, accurate, SEO-optimized articles about anime, "
                            "manga, manhwa, and streaming news. "
                            "Use markdown formatting. Be informative and enthusiastic. "
                            "Never make up specific facts — if unsure, write generally."
                        )
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                max_tokens=max_tokens,
                temperature=0.7,
                extra_headers={
                    "HTTP-Referer": "https://anime-streaming-buzz.pages.dev",
                    "X-Title": "AniTube Buzz"
                }
            )

            content = response.choices[0].message.content
            if content and len(content) > 100:
                print(f"Success with: {model}")
                return content

        except Exception as e:
            print(f"Model {model} failed: {e}")
            time.sleep(2)
            continue

    return None


def generate_article_content(article_data):
    """Generate full article from source data"""

    prompt = f"""Write a detailed anime news article based on this:

TITLE: {article_data['title']}
SOURCE: {article_data['source']}
CATEGORY: {article_data['category']}
SUMMARY: {article_data['summary']}
DATE: {article_data['date']}

Requirements:
1. Write 400-600 words
2. Use markdown with ## headings
3. Engaging introduction
4. 2-3 sections with ## headings
5. Analysis for anime fans
6. Strong conclusion
7. Do NOT copy summary directly
8. Do NOT include frontmatter
9. Only use facts from the title and summary

Write the article now:"""

    return call_ai(prompt, max_tokens=1500)


def generate_metadata(article_data, content):
    """Generate SEO metadata"""

    prompt = f"""Generate SEO metadata for this anime article.

TITLE: {article_data['title']}
CATEGORY: {article_data['category']}
PREVIEW: {content[:300] if content else article_data['summary']}

Return ONLY this JSON (no other text):
{{
  "title": "SEO title max 60 chars",
  "excerpt": "Meta description max 155 chars",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}}"""

    response = call_ai(prompt, max_tokens=300)

    if not response:
        return {
            "title": article_data['title'][:60],
            "excerpt": article_data['summary'][:155],
            "tags": article_data['tags']
        }

    try:
        json_match = re.search(r'\{[^{}]*\}', response, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except:
        pass

    return {
        "title": article_data['title'][:60],
        "excerpt": article_data['summary'][:155],
        "tags": article_data['tags']
    }


def create_markdown_file(article_data, content, metadata):
    """Create markdown with frontmatter"""

    slug = slugify(metadata.get('title', article_data['title']))
    if not slug:
        slug = slugify(article_data['title'])
    slug = slug[:80]

    date_prefix = article_data['date'].replace('-', '')[:8]
    full_slug = f"{date_prefix}-{slug}"

    tags = metadata.get('tags', article_data['tags'])
    if not isinstance(tags, list):
        tags = article_data['tags']
    tags_yaml = json.dumps(tags)

    image = article_data.get('image', '')
    if not image:
        seed = re.sub(r'[^a-z0-9]', '', slug[:20])
        image = f"https://picsum.photos/seed/{seed}/800/450"

    clean_title = metadata.get(
        'title', article_data['title']
    ).replace('"', "'")

    clean_excerpt = metadata.get(
        'excerpt', article_data['summary'][:155]
    ).replace('"', "'")

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
        if content.startswith('---'):
            parts = content.split('---', 2)
            if len(parts) >= 3:
                content = parts[2].strip()
        full_content = frontmatter + content
    else:
        full_content = frontmatter + f"""## {article_data['title']}

{article_data['summary']}

*Source: [{article_data['source']}]({article_data['url']})*

---

*Stay tuned to AniTube Buzz for the latest anime news.*
"""

    full_content += f"""

---

*Source: [{article_data['source']}]({article_data['url']}) | AniTube Buzz*
"""

    return full_slug, full_content


def save_article(slug, content):
    """Save article to posts directory"""

    posts_dir = os.path.join(
        os.path.dirname(__file__),
        '..', 'src', 'content', 'posts'
    )
    os.makedirs(posts_dir, exist_ok=True)

    filepath = os.path.join(posts_dir, f"{slug}.md")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"Saved: {filepath}")
    return filepath


def process_articles(articles):
    """Process all articles"""

    if not articles:
        print("No articles to process")
        return []

    processed = []

    for i, article in enumerate(articles):
        print(f"\n--- Article {i+1}/{len(articles)} ---")
        print(f"Title: {article['title']}")

        print("Generating content...")
        content = generate_article_content(article)

        print("Generating metadata...")
        metadata = generate_metadata(article, content)
        print(f"SEO Title: {metadata.get('title', 'N/A')}")

        slug, markdown = create_markdown_file(article, content, metadata)
        filepath = save_article(slug, markdown)

        processed.append({
            'slug': slug,
            'title': article['title'],
            'url': article['url'],
            'filepath': filepath
        })

        if i < len(articles) - 1:
            print("Waiting 3 seconds...")
            time.sleep(3)

    return processed
