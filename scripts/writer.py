"""
writer.py — AniTube Buzz Article Generator
Generates rich, data-driven anime articles from Jikan API (MAL).
NO filler text. NO placeholder images. NO generic watch links.
NO external slugify dependency.
"""

import os
import re
import time
import json
import random
import requests
from datetime import datetime, timezone


# ── Constants ─────────────────────────────────────────────────────────────────

JIKAN_BASE = "https://api.jikan.moe/v4"
POSTS_DIR  = os.path.join("src", "content", "posts")
TRACKER    = os.path.join("data", "published.json")

JIKAN_DELAY  = 2.5   # seconds between API calls (rate limit: 3/sec, we do ~0.4/sec)
MAX_ARTICLES = 5      # max articles per run

PLATFORM_ICONS = {
    "Crunchyroll":        "🟠",
    "Netflix":            "🔴",
    "HIDIVE":             "🔵",
    "Amazon Prime Video": "🔷",
    "Amazon Prime":       "🔷",
    "Funimation":         "🟣",
    "Disney+":            "🔵",
    "Hulu":               "🟢",
    "Apple TV+":          "⬜",
    "YouTube":            "🔴",
}


# ── Built-in slug function (no external dependency) ───────────────────────────

def make_slug(text, max_length=80):
    """
    Convert a string to a URL-safe slug.
    Replaces python-slugify entirely.
    """
    if not text:
        return "untitled"
    # Lowercase
    s = text.lower()
    # Replace non-ascii with empty (simple approach for anime titles)
    s = s.encode("ascii", "ignore").decode("ascii")
    # Replace anything that's not alphanumeric or space/hyphen with space
    s = re.sub(r"[^a-z0-9\s\-]", " ", s)
    # Collapse whitespace and hyphens
    s = re.sub(r"[\s\-]+", "-", s)
    # Strip leading/trailing hyphens
    s = s.strip("-")
    # Truncate
    s = s[:max_length].rstrip("-")
    return s or "untitled"


# ── Tracker helpers ───────────────────────────────────────────────────────────

def load_tracker():
    if os.path.exists(TRACKER):
        try:
            with open(TRACKER, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"published": []}


def save_tracker(data):
    os.makedirs(os.path.dirname(TRACKER), exist_ok=True)
    with open(TRACKER, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def already_published(tracker, key):
    return key in tracker.get("published", [])


def mark_published(tracker, key):
    if key not in tracker["published"]:
        tracker["published"].append(key)


# ── Jikan API helpers ─────────────────────────────────────────────────────────

def jikan_get(endpoint, params=None):
    """Rate-limited GET request to Jikan API v4."""
    time.sleep(JIKAN_DELAY)
    url = f"{JIKAN_BASE}/{endpoint}"
    try:
        res = requests.get(url, params=params or {}, timeout=20)
        if res.status_code == 429:
            print("  [Jikan] Rate limited — sleeping 15s")
            time.sleep(15)
            res = requests.get(url, params=params or {}, timeout=20)
        if res.status_code == 404:
            return None
        res.raise_for_status()
        return res.json()
    except requests.exceptions.Timeout:
        print(f"  [Jikan] Timeout on {endpoint}")
        return None
    except Exception as e:
        print(f"  [Jikan] Error on {endpoint}: {e}")
        return None


# ── Data extraction helpers ───────────────────────────────────────────────────

def clean_synopsis(text):
    """Strip Jikan boilerplate from synopsis text."""
    if not text:
        return ""
    text = re.sub(r'\[Written by MAL Rewrite\]', '', text)
    text = re.sub(r'\(Source:[^)]*\)', '', text)
    text = re.sub(r'\[.*?\]\s*$', '', text)
    return text.strip()


def get_best_image(anime_data):
    """Return the highest-quality MAL CDN image URL."""
    images = anime_data.get("images", {})
    webp   = images.get("webp", {})
    jpg    = images.get("jpg", {})
    for url in [
        webp.get("large_image_url", ""),
        jpg.get("large_image_url", ""),
        webp.get("image_url", ""),
        jpg.get("image_url", ""),
    ]:
        if url and "cdn.myanimelist.net" in url:
            return url
    return ""


def get_genres(anime_data):
    all_g = (
        anime_data.get("genres", []) +
        anime_data.get("themes", []) +
        anime_data.get("demographics", [])
    )
    return [g["name"] for g in all_g if g.get("name")]


def get_studios(anime_data):
    return {
        "studios":   [s["name"] for s in anime_data.get("studios",   []) if s.get("name")],
        "producers": [p["name"] for p in anime_data.get("producers", []) if p.get("name")],
    }


def format_number(n):
    try:
        return f"{int(n):,}"
    except Exception:
        return "N/A"


def build_watch_links(streaming_data, anime_title):
    """Return real watch links from Jikan streaming data."""
    if not streaming_data:
        return []
    major = [
        "Crunchyroll", "Netflix", "HIDIVE", "Amazon Prime Video",
        "Amazon Prime", "Funimation", "Disney+", "Hulu",
        "Apple TV+", "YouTube",
    ]
    links = []
    seen  = set()
    for entry in streaming_data:
        name = entry.get("name", "")
        url  = entry.get("url", "")
        if not name or not url or name in seen:
            continue
        matched = next((p for p in major if p.lower() in name.lower()), None)
        if not matched:
            continue
        seen.add(name)
        links.append({
            "platform":  matched,
            "url":       url,
            "icon":      PLATFORM_ICONS.get(matched, "🌐"),
            "is_search": False,
        })
    return links[:5]


def build_watch_links_fallback(anime_title):
    """Fallback watch links when Jikan has no streaming data."""
    encoded = requests.utils.quote(anime_title)
    return [
        {
            "platform":  "Crunchyroll",
            "url":       f"https://www.crunchyroll.com/search?q={encoded}",
            "icon":      "🟠",
            "is_search": True,
        },
        {
            "platform":  "HIDIVE",
            "url":       f"https://www.hidive.com/search#{encoded}",
            "icon":      "🔵",
            "is_search": True,
        },
    ]


def build_trailer_embed(trailer_data):
    """Extract YouTube embed URL from Jikan trailer."""
    if not trailer_data:
        return None
    yt_id    = trailer_data.get("youtube_id", "")
    embed_url = trailer_data.get("embed_url", "")
    if yt_id:
        return f"https://www.youtube.com/embed/{yt_id}"
    if embed_url and "youtube" in embed_url:
        return embed_url
    return None


def get_characters(mal_id, limit=8):
    """Fetch characters + Japanese voice actors for an anime."""
    data = jikan_get(f"anime/{mal_id}/characters")
    if not data or not data.get("data"):
        return []
    chars = []
    for entry in data["data"]:
        if len(chars) >= limit:
            break
        role = entry.get("role", "")
        if role not in ("Main", "Supporting"):
            continue
        char    = entry.get("character", {})
        va_name = ""
        va_url  = ""
        for va in entry.get("voice_actors", []):
            if va.get("language", "").lower() == "japanese":
                person  = va.get("person", {})
                va_name = person.get("name", "")
                va_url  = person.get("url", "")
                break
        chars.append({
            "name":    char.get("name", ""),
            "role":    role,
            "va_name": va_name,
            "va_url":  va_url,
        })
    return chars


# ── Markdown / YAML builders ──────────────────────────────────────────────────

def yaml_str(val):
    """Safely format a string value for YAML frontmatter."""
    if not isinstance(val, str):
        val = str(val)
    # Remove characters that break YAML
    val = val.replace("\\", "").replace('"', "'")
    return f'"{val}"'


def yaml_list(items):
    """Safely format a list for YAML frontmatter."""
    if not items:
        return "[]"
    cleaned = []
    for i in items:
        s = re.sub(r'[/\\<>"\':]', '', str(i)).strip()
        if s:
            cleaned.append(f'"{s}"')
    return f"[{', '.join(cleaned)}]" if cleaned else "[]"


def build_frontmatter(title, excerpt, category, tags, date_str,
                      image, image_alt, featured=False, trending=False):
    lines = [
        "---",
        f"title: {yaml_str(title)}",
        f"excerpt: {yaml_str(excerpt)}",
        f"category: {yaml_str(category)}",
        f"tags: {yaml_list(tags)}",
        f'author: "AniTube Buzz"',
        f'date: "{date_str}"',
        f"image: {yaml_str(image)}",
        f"imageAlt: {yaml_str(image_alt)}",
        f"featured: {str(featured).lower()}",
        f"trending: {str(trending).lower()}",
        f"draft: false",
        "---",
        "",
    ]
    return "\n".join(lines)


def build_body(anime, characters, watch_links, trailer_embed):
    """
    Build rich article body — NO filler text, all data-driven.
    """
    title     = anime.get("title_english") or anime.get("title", "")
    title_jp  = anime.get("title_japanese", "")
    synopsis  = clean_synopsis(anime.get("synopsis", ""))
    score     = anime.get("score")
    rank      = anime.get("rank")
    popularity= anime.get("popularity")
    members   = anime.get("members")
    status    = anime.get("status", "")
    episodes  = anime.get("episodes")
    season    = (anime.get("season") or "").capitalize()
    year      = anime.get("year")
    rating    = anime.get("rating", "")
    source_m  = anime.get("source", "")
    duration  = anime.get("duration", "")
    mal_id    = anime.get("mal_id")
    mal_url   = anime.get("url") or f"https://myanimelist.net/anime/{mal_id}"

    studios_data = get_studios(anime)
    studios      = studios_data["studios"]
    producers    = studios_data["producers"]
    genres       = get_genres(anime)

    # Aired dates
    aired      = anime.get("aired", {})
    aired_from = aired.get("string", "") or ""

    lines = []

    # ── Synopsis ──────────────────────────────────────────
    if synopsis:
        lines.append("## Story Overview\n")
        # Split into two paragraphs if long
        if len(synopsis) > 600:
            sentences = synopsis.split(". ")
            mid       = max(1, len(sentences) // 2)
            p1 = ". ".join(sentences[:mid]).strip()
            p2 = ". ".join(sentences[mid:]).strip()
            if p1 and not p1.endswith("."):
                p1 += "."
            if p2 and not p2.endswith("."):
                p2 += "."
            lines.append(p1 + "\n")
            if p2:
                lines.append(p2 + "\n")
        else:
            lines.append(synopsis + "\n")

    # ── Quick Facts Table ──────────────────────────────────
    lines.append("## Quick Facts\n")
    lines.append("| Detail | Info |")
    lines.append("|--------|------|")
    if title_jp:
        lines.append(f"| Japanese Title | {title_jp} |")
    if season and year:
        lines.append(f"| Season | {season} {year} |")
    elif year:
        lines.append(f"| Year | {year} |")
    if status:
        lines.append(f"| Status | {status} |")
    if episodes:
        lines.append(f"| Episodes | {episodes} |")
    if duration:
        lines.append(f"| Episode Length | {duration} |")
    if source_m:
        lines.append(f"| Source Material | {source_m} |")
    if rating:
        lines.append(f"| Age Rating | {rating} |")
    if aired_from:
        lines.append(f"| Aired | {aired_from} |")
    if studios:
        lines.append(f"| Studio | {', '.join(studios)} |")
    if producers:
        lines.append(f"| Producers | {', '.join(producers[:3])} |")
    if genres:
        lines.append(f"| Genres | {', '.join(genres[:6])} |")
    lines.append("")

    # ── Community Stats ────────────────────────────────────
    if any([score, rank, popularity, members]):
        lines.append("## Community Stats\n")
        lines.append("| Metric | Value |")
        lines.append("|--------|-------|")
        if score:
            lines.append(f"| MAL Score | ⭐ {score} / 10 |")
        if rank:
            lines.append(f"| MAL Rank | #{format_number(rank)} |")
        if popularity:
            lines.append(f"| Popularity Rank | #{format_number(popularity)} |")
        if members:
            lines.append(f"| Members | {format_number(members)} |")
        lines.append("")
        lines.append(f"> 📊 [View full stats and reviews on MyAnimeList]({mal_url})\n")

    # ── Official Trailer ───────────────────────────────────
    if trailer_embed:
        lines.append("## Official Trailer\n")
        lines.append('<div class="video-embed-wrapper">')
        lines.append(f'<iframe src="{trailer_embed}" title="{title} Official Trailer" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>')
        lines.append('</div>\n')

    # ── Characters Table ───────────────────────────────────
    if characters:
        lines.append("## Characters & Voice Actors\n")
        lines.append("| Character | Role | Voice Actor (JP) |")
        lines.append("|-----------|------|-----------------|")
        for c in characters:
            name    = c["name"]    or "—"
            role    = c["role"]    or "—"
            va_name = c["va_name"] or "—"
            if c.get("va_url") and va_name != "—":
                va_cell = f"[{va_name}]({c['va_url']})"
            else:
                va_cell = va_name
            lines.append(f"| {name} | {role} | {va_cell} |")
        lines.append("")

    # ── Where to Watch ─────────────────────────────────────
    if watch_links:
        lines.append("## Where to Watch Officially\n")
        lines.append("> Support the creators — watch only on official platforms.\n")
        for lnk in watch_links:
            note = " *(search page — direct link not available)*" if lnk.get("is_search") else ""
            lines.append(f"- {lnk['icon']} **[Watch on {lnk['platform']}]({lnk['url']})**{note}")
        lines.append("")

    # ── Attribution ────────────────────────────────────────
    lines.append("---\n")
    lines.append(
        f"*Data sourced from [MyAnimeList]({mal_url}) via Jikan API. "
        "All characters, artwork, and titles are property of their respective owners.*"
    )

    return "\n".join(lines)


# ── Article generation ────────────────────────────────────────────────────────

def generate_article(anime_data, tracker, category="Anime Recap",
                     title_override=None, topic_key="recap"):
    """Generate one article markdown file. Returns dict or None."""

    mal_id = anime_data.get("mal_id")
    title  = anime_data.get("title_english") or anime_data.get("title", "")

    if not mal_id or not title:
        return None

    tracker_key = f"{topic_key}_{mal_id}"
    if already_published(tracker, tracker_key):
        print(f"  [skip] Already published: {tracker_key}")
        return None

    # Fetch full data if streaming/trailer fields are missing
    if "streaming" not in anime_data or "trailer" not in anime_data:
        full = jikan_get(f"anime/{mal_id}/full")
        if full and full.get("data"):
            anime_data = full["data"]

    # Must have a real MAL image
    image = get_best_image(anime_data)
    if not image:
        print(f"  [skip] No MAL image for: {title}")
        mark_published(tracker, tracker_key)
        return None

    # Gather data
    synopsis     = clean_synopsis(anime_data.get("synopsis", ""))
    genres       = get_genres(anime_data)
    studios_data = get_studios(anime_data)
    studios      = studios_data["studios"]
    score        = anime_data.get("score") or 0
    rank         = anime_data.get("rank")  or 9999
    is_featured  = float(score) >= 8.0 or rank <= 100
    is_trending  = bool(anime_data.get("airing")) and float(score) >= 7.0

    # Build excerpt from synopsis (no filler)
    if synopsis:
        sents   = [s.strip() for s in synopsis.split(".") if s.strip()]
        excerpt = sents[0] if sents else synopsis[:200]
        if len(excerpt) < 60 and len(sents) > 1:
            excerpt = sents[0] + ". " + sents[1]
        excerpt = excerpt[:260].strip()
        if not excerpt.endswith("."):
            excerpt += "."
    else:
        genre_str  = ", ".join(genres[:2]) if genres else "anime"
        studio_str = f" by {studios[0]}" if studios else ""
        excerpt    = f"{title} is a {genre_str} series{studio_str}. Click to read full details, characters, and where to watch."

    # Tags — genres + title word, clean of special chars
    tags = genres[:5]
    tags += [w for w in title.split() if len(w) > 3][:2]
    tags  = list(dict.fromkeys(tags))[:8]
    tags  = [re.sub(r'[/\\<>"\':,]', '', t).strip() for t in tags if t]

    # Display title
    display_title = title_override or title
    date_str      = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Fetch characters and links
    characters    = get_characters(mal_id, limit=8)
    streaming_raw = anime_data.get("streaming", [])
    watch_links   = build_watch_links(streaming_raw, title)
    if not watch_links:
        watch_links = build_watch_links_fallback(title)
    trailer_embed = build_trailer_embed(anime_data.get("trailer", {}))

    # Build file content
    frontmatter = build_frontmatter(
        title      = display_title,
        excerpt    = excerpt,
        category   = category,
        tags       = tags,
        date_str   = date_str,
        image      = image,
        image_alt  = f"{title} — Official Key Visual",
        featured   = is_featured,
        trending   = is_trending,
    )
    body     = build_body(anime_data, characters, watch_links, trailer_embed)
    markdown = frontmatter + body

    # Filename
    slug     = make_slug(display_title)
    filename = f"{date_str}-{slug}.md"
    filepath = os.path.join(POSTS_DIR, filename)

    if os.path.exists(filepath):
        print(f"  [skip] File exists: {filename}")
        mark_published(tracker, tracker_key)
        return None

    return {
        "filepath":    filepath,
        "filename":    filename,
        "markdown":    markdown,
        "tracker_key": tracker_key,
        "title":       display_title,
    }


# ── Data fetchers ──────────────────────────────────────────────────────────────

def fetch_seasonal():
    print("[writer] Fetching currently airing anime...")
    data = jikan_get("seasons/now", {"limit": 20, "filter": "tv"})
    return data["data"] if data and data.get("data") else []


def fetch_upcoming():
    print("[writer] Fetching upcoming anime...")
    data = jikan_get("seasons/upcoming", {"limit": 20, "filter": "tv"})
    return data["data"] if data and data.get("data") else []


def fetch_top(page=1):
    print(f"[writer] Fetching top anime (page {page})...")
    data = jikan_get("top/anime", {"page": page, "type": "tv", "limit": 20})
    return data["data"] if data and data.get("data") else []


# ── Main runner ────────────────────────────────────────────────────────────────

def run(max_articles=MAX_ARTICLES):
    os.makedirs(POSTS_DIR, exist_ok=True)
    tracker  = load_tracker()
    queued   = []
    written  = 0

    print(f"\n[writer] Starting — max articles: {max_articles}\n")

    # Pass 1: Currently airing → Anime Recap
    print("── Pass 1: Seasonal recaps ──")
    seasonal = fetch_seasonal()
    random.shuffle(seasonal)
    for anime in seasonal:
        if written >= max_articles:
            break
        result = generate_article(anime, tracker, category="Anime Recap", topic_key="recap")
        if result:
            queued.append(result)
            written += 1
            print(f"  ✓ Queued: {result['title']}")

    # Pass 2: Upcoming → News
    if written < max_articles:
        print("\n── Pass 2: Upcoming news ──")
        upcoming = fetch_upcoming()
        random.shuffle(upcoming)
        for anime in upcoming:
            if written >= max_articles:
                break
            t = anime.get("title_english") or anime.get("title", "")
            s = (anime.get("season") or "").capitalize()
            y = anime.get("year") or ""
            title_ov = f"{t} Confirmed for {s} {y} — Full Preview" if (s and y) else f"{t}: Upcoming Season Details"
            result = generate_article(
                anime, tracker,
                category="News",
                title_override=title_ov[:120],
                topic_key="upcoming"
            )
            if result:
                queued.append(result)
                written += 1
                print(f"  ✓ Queued: {result['title']}")

    # Pass 3: Top anime → Anime Recap
    if written < max_articles:
        print("\n── Pass 3: Top anime recaps ──")
        top = fetch_top(page=random.randint(1, 3))
        random.shuffle(top)
        for anime in top:
            if written >= max_articles:
                break
            result = generate_article(anime, tracker, category="Anime Recap", topic_key="top_recap")
            if result:
                queued.append(result)
                written += 1
                print(f"  ✓ Queued: {result['title']}")

    # Write all queued articles to disk
    print(f"\n[writer] Writing {len(queued)} articles...\n")
    success = 0
    for art in queued:
        try:
            with open(art["filepath"], "w", encoding="utf-8") as f:
                f.write(art["markdown"])
            mark_published(tracker, art["tracker_key"])
            print(f"  ✅ {art['filename']}")
            success += 1
        except Exception as e:
            print(f"  ❌ Error writing {art['filename']}: {e}")

    save_tracker(tracker)
    print(f"\n[writer] Done. {success}/{len(queued)} articles written.\n")
    return success


if __name__ == "__main__":
    run()
