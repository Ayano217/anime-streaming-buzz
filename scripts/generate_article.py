#!/usr/bin/env python3
"""
AniTube Buzz - AI Article Generator
Uses OpenRouter free open-source models to generate articles
"""

import os
import json
import re
import time
from datetime import datetime
from slugify import slugify
from openai import OpenAI


# OpenRouter client setup
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ.get("OPENROUTER_API_KEY", ""),
)

# Free models to try in order
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
                            "Never make up specific facts — if you are not sure, write generally."
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
                print(f"Success with model: {model}")
                return content

        except Exception as e:
            print(f"Model {model} failed: {e}")
            time.sleep(2)
            continue

    return None


def generate_article_content(article_data):
    """Generate full article from source data"""

    prompt = f"""Write a detailed, engaging anime news article based on this information:

TITLE: {article_data['title']}
SOURCE: {article_data['source']}
CATEGORY: {article_data['category']}
SUMMARY: {article_data['summary']}
DATE: {article_data['date']}

Requirements:
1. Write 400-600 words
2. Use markdown formatting with ## headings
3. Start with an engaging introduction
4. Include 2-3 relevant sections with ## headings
5. Add analysis/commentary for anime fans
6. End with a conclusion
7. Do NOT copy the summary directly - expand and analyze it
8. Write for anime fans who want context and analysis
9. Use only facts that can be reasonably inferred from the title and summary
10. Do NOT include frontmatter - just the article body

Write the article now:"""

    content = call_ai(prompt, max_tokens=1500)
    return content


def generate_metadata(article_data, content):
    """Generate SEO metadata for the article"""

    prompt = f"""Based on this anime article, generate SEO metadata.

ORIGINAL TITLE: {article_data['title']}
CATEGORY: {article_data['category']}
CONTENT PREVIEW: {content[:300] if content else article_data['summary']}

Generate and return ONLY a valid JSON object with these exact fields:
{{
  "title": "SEO optimized title (max 60 chars)",
  "excerpt": "Meta description (max 155 chars)",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}}

Rules:
- title should be catchy and include main keywords
- excerpt should be compelling and include keywords
- tags should be relevant anime/manga keywords in lowercase
- Return ONLY the JSON, no other text"""

    response = call_ai(prompt, max_tokens=300)

    if not response:
        # Fallback metadata
        return {
            "title": article_data['title'][:60],
            "excerpt": article_data['summary'][:155],
            "tags": article_data['tags']
        }

    # Extract JSON from response
    try:
        # Try to find JSON in response
        json_match = re.search(r'\{[^{}]*\}', response, re.DOTALL)
        if json_match:
            metadata = json.loads(json_match.group())
            return metadata
    except:
        pass

    # Fallback
    return {
        "title": article_data['title'][:60],
        "excerpt": article_data['summary'][:155],
        "tags": article_data['tags']
    }


def create_markdown_file(article_data, content, metadata):
    """Create the markdown file with frontmatter"""

    # Generate slug
    slug = slugify(metadata.get('title', article_data['title']))
    if not slug:
        slug = slugify(article_data['title'])

    # Ensure slug is not too long
    slug = slug[:80]

    # Add date prefix to avoid conflicts
    date_prefix = article_data['date'].replace('-', '')[:8]
    full_slug = f"{date_prefix}-{slug}"

    # Prepare tags
    tags = metadata.get('tags', article_data['tags'])
    if isinstance(tags, list):
        tags_yaml = json.dumps(tags)
    else:
        tags_yaml = json.dumps(article_data['tags'])

    # Prepare image
    image = article_data.get('image', '')
    if not image:
        seed = re.sub(r'[^a-z0-9]', '', slug[:20])
        image = f"https://picsum.photos/seed/{seed}/800/450"

    # Clean title and excerpt for YAML
    clean_title = metadata.get('title', article_data['title']).replace('"', "'")
    clean_excerpt = metadata.get('excerpt', article_data['summary'][:155]).replace('"', "'")

    # Build frontmatter
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

    # Clean content
    if content:
        # Remove any accidental frontmatter from AI response
        if content.startswith('---'):
            parts = content.split('---', 2)
            if len(parts) >= 3:
                content = parts[2].strip()

        full_content = frontmatter + content
    else:
        # Fallback content
        full_content = frontmatter + f"""## {article_data['title']}

{article_data['summary']}

*Source: [{article_data['source']}]({article_data['url']})*

---

*Stay tuned to AniTube Buzz for the latest anime and manga news.*
"""

    # Add attribution footer
    full_content += f"""

---

*Source: [{article_data['source']}]({article_data['url']}) | Published on AniTube Buzz*
"""

    return full_slug, full_content


def save_article(slug, content):
    """Save article to content/posts directory"""

    posts_dir = os.path.join(
        os.path.dirname(__file__),
        '..', 'src', 'content', 'posts'
    )
    os.makedirs(posts_dir, exist_ok=True)

    filename = f"{slug}.md"
    filepath = os.path.join(posts_dir, filename)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"Saved: {filepath}")
    return filepath


def process_articles(articles):
    """Process all fetched articles"""

    if not articles:
        print("No new articles to process")
        return []

    processed = []

    for i, article in enumerate(articles):
        print(f"\n--- Processing article {i+1}/{len(articles)} ---")
        print(f"Title: {article['title']}")

        # Generate content
        print("Generating article content...")
        content = generate_article_content(article)

        if not content:
            print(f"Failed to generate content, using summary fallback")
            content = None

        # Generate metadata
        print("Generating metadata...")
        metadata = generate_metadata(article, content)
        print(f"SEO Title: {metadata.get('title', 'N/A')}")

        # Create markdown
        slug, markdown = create_markdown_file(article, content, metadata)

        # Save file
        filepath = save_article(slug, markdown)

        processed.append({
            'slug': slug,
            'title': article['title'],
            'url': article['url'],
            'filepath': filepath
        })

        # Rate limit between articles
        if i < len(articles) - 1:
            print("Waiting 3 seconds...")
            time.sleep(3)

    return processed


if __name__ == "__main__":
    # Test with sample data
    test_article = {
        'title': 'Test Anime Article',
        'summary': 'This is a test article about anime news.',
        'url': 'https://example.com/test',
        'date': datetime.now().strftime('%Y-%m-%d'),
        'image': 'https://picsum.photos/seed/test/800/450',
        'source': 'Test Source',
        'category': 'News',
        'tags': ['anime', 'test', 'news']
    }

    content = generate_article_content(test_article)
    if content:
        print("Content generated successfully!")
        print(content[:200])
    else:
        print("Content generation failed")
