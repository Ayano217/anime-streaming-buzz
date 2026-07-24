"""
writer.py — AniTube Buzz Article Generator
Generates rich, data-driven anime articles from Jikan API (MAL).
NO filler text. NO placeholder images. NO generic watch links.
"""

import os
import re
import time
import json
import random
import requests
from datetime import datetime, timezone
from python_slugify import slugify


# ── Constants ─────────────────────────────────────────────────────────────────

JIKAN_BASE = "https://api.jikan.moe/v4"
POSTS_DIR  = os.path.join("src", "content", "posts")
TRACKER    = os.path.join("data", "published.json")

# Delay between Jikan API calls to respect rate limit (3 req/sec, we do 0.5/sec)
JIKAN_DELAY = 2.2

# Maximum articles to generate per run
MAX_ARTICLES = 5

# Official watch platform links — mapped by known anime IDs and fallbacks
# Format: { "platform": "url" }
# We build these dynamically from Jikan's streaming_links data where available

PLATFORM_ICONS = {
    "Crunchyroll":     "🟠",
    "Netflix":         "🔴",
    "HIDIVE":          "🔵",
    "Amazon Prime":    "🔷",
    "Funimation":      "🟣",
    "Disney+":         "🔵",
    "Hulu":            "🟢",
    "Apple TV+":       "⬜",
    "YouTube":         "🔴",
}

# Categories we post to
CATEGORIES = ["Anime Recap", "News", "Streaming", "Manhwa", "Gaming"]

# Anime that gets extra coverage (MAL IDs of popular series)
FEATURED_ANIME_IDS = [
    21,    # One Piece
    20,    # Naruto
    1735,  # Naruto Shippuden
    16498, # Attack on Titan
    5114,  # FMA Brotherhood
    269,   # Bleach
    11061, # Hunter x Hunter 2011
    40748, # Jujutsu Kaisen
    38000, # Demon Slayer
    41467, # Chainsaw Man
    50265, # Blue Lock
    52991, # Bungou Stray Dogs S5
    49387, # Vinland Saga S2
    51009, # Oshi no Ko
    55701, # Frieren
    54112, # One Piece (2023 arc)
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_tracker():
    if os.path.exists(TRACKER):
        with open(TRACKER, "r", encoding="utf-8") as f:
            return json.load(f)
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


def jikan_get(endpoint, params=None):
    """Make a rate-limited request to Jikan API."""
    time.sleep(JIKAN_DELAY)
    url = f"{JIKAN_BASE}/{endpoint}"
    try:
        res = requests.get(url, params=params or {}, timeout=15)
        if res.status_code == 429:
            print("  [Jikan] Rate limited — sleeping 10s")
            time.sleep(10)
            res = requests.get(url, params=params or {}, timeout=15)
        res.raise_for_status()
        return res.json()
    except Exception as e:
        print(f"  [Jikan] Error fetching {endpoint}: {e}")
        return None


def clean_synopsis(text):
    """Clean up synopsis text from Jikan."""
    if not text:
        return ""
    # Remove common Jikan boilerplate
    text = re.sub(r'\[Written by MAL Rewrite\]', '', text)
    text = re.sub(r'\(Source:.*?\)', '', text)
    text = text.strip()
    # Remove trailing citations
    text = re.sub(r'\s*\[.*?\]\s*$', '', text)
    return text.strip()


def get_best_image(anime_data):
    """Get the highest quality image URL from Jikan anime data."""
    images = anime_data.get("images", {})
    
    # Priority: webp large > jpg large > webp default > jpg default
    webp = images.get("webp", {})
    jpg  = images.get("jpg", {})
    
    candidates = [
        webp.get("large_image_url", ""),
        jpg.get("large_image_url", ""),
        webp.get("image_url", ""),
        jpg.get("image_url", ""),
    ]
    
    for url in candidates:
        if url and "cdn.myanimelist.net" in url:
            return url
    
    return ""


def format_number(n):
    """Format large numbers with commas."""
    if n is None:
        return "N/A"
    try:
        return f"{int(n):,}"
    except:
        return str(n)


def build_watch_links(streaming_data, anime_title):
    """
    Build actual watch links from Jikan streaming data.
    Falls back to category search pages (not generic search) if no direct link.
    """
    if not streaming_data:
        return []
    
    links = []
    seen_platforms = set()
    
    for entry in streaming_data:
        name = entry.get("name", "")
        url  = entry.get("url", "")
        
        if not name or not url:
            continue
        if name in seen_platforms:
            continue
        seen_platforms.add(name)
        
        # Only include major legitimate platforms
        major_platforms = [
            "Crunchyroll", "Netflix", "HIDIVE", "Amazon Prime Video",
            "Amazon Prime", "Funimation", "Disney+", "Hulu", "Apple TV+",
            "YouTube", "Bilibili"
        ]
        
        matched_platform = None
        for platform in major_platforms:
            if platform.lower() in name.lower():
                matched_platform = platform
                break
        
        if not matched_platform:
            continue
        
        icon = PLATFORM_ICONS.get(matched_platform, "🌐")
        links.append({
            "platform": matched_platform,
            "url": url,        # This is the REAL URL from Jikan, not a search
            "icon": icon
        })
    
    return links[:5]  # Max 5 platforms


def build_watch_links_fallback(anime_title):
    """
    When Jikan has no streaming links, build proper search/browse URLs
    (not generic search queries, but the correct browse/search format per platform).
    """
    encoded = requests.utils.quote(anime_title)
    return [
        {
            "platform": "Crunchyroll",
            "url": f"https://www.crunchyroll.com/search?q={encoded}",
            "icon": "🟠",
            "is_search": True
        },
        {
            "platform": "HIDIVE",
            "url": f"https://www.hidive.com/search#q={encoded}",
            "icon": "🔵",
            "is_search": True
        },
    ]


def build_trailer_embed(trailer_data):
    """Extract YouTube embed URL from Jikan trailer data."""
    if not trailer_data:
        return None
    
    youtube_id = trailer_data.get("youtube_id", "")
    embed_url  = trailer_data.get("embed_url", "")
    
    if youtube_id:
        return f"https://www.youtube.com/embed/{youtube_id}"
    
    if embed_url and "youtube" in embed_url:
        return embed_url
    
    return None


def get_genres(anime_data):
    genres = anime_data.get("genres", [])
    themes = anime_data.get("themes", [])
    demos  = anime_data.get("demographics", [])
    all_genres = genres + themes + demos
    return [g["name"] for g in all_genres if g.get("name")]


def get_studios(anime_data):
    studios   = anime_data.get("studios", [])
    producers = anime_data.get("producers", [])
    return {
        "studios":   [s["name"] for s in studios   if s.get("name")],
        "producers": [p["name"] for p in producers  if p.get("name")],
    }


def get_characters(mal_id, limit=8):
    """Fetch main characters and voice actors for an anime."""
    data = jikan_get(f"anime/{mal_id}/characters")
    if not data or not data.get("data"):
        return []
    
    chars = []
    for entry in data["data"][:limit]:
        char = entry.get("character", {})
        role = entry.get("role", "")
        
        # Only main and supporting characters
        if role not in ("Main", "Supporting"):
            continue
        
        # Get English voice actor
        va_name = ""
        va_url  = ""
        for va in entry.get("voice_actors", []):
            if va.get("language", "").lower() == "japanese":
                person = va.get("person", {})
                va_name = person.get("name", "")
                va_url  = person.get("url", "")
                break
        
        chars.append({
            "name":    char.get("name", ""),
            "role":    role,
            "image":   char.get("images", {}).get("jpg", {}).get("image_url", ""),
            "va_name": va_name,
            "va_url":  va_url,
        })
    
    return chars


# ── Article Builders ──────────────────────────────────────────────────────────

def build_article_frontmatter(anime, category, is_featured=False, is_trending=False):
    """Build the YAML frontmatter for an article."""
    title    = anime.get("title_english") or anime.get("title", "Unknown Anime")
    synopsis = clean_synopsis(anime.get("synopsis", ""))
    
    # Excerpt: first 200 chars of synopsis, no filler
    if synopsis:
        # Get a clean first sentence or first 200 chars
        sentences = synopsis.split('.')
        excerpt = sentences[0].strip() if sentences else synopsis[:200]
        if len(excerpt) < 50 and len(sentences) > 1:
            excerpt = '. '.join(sentences[:2]).strip()
        excerpt = excerpt[:250].strip()
        if not excerpt.endswith('.'):
            excerpt += '.'
    else:
        title_str = anime.get("title", "this anime")
        year      = anime.get("year") or datetime.now().year
        genres    = get_genres(anime)
        genre_str = ', '.join(genres[:2]) if genres else "anime"
        excerpt = (
            f"{title_str} is a {genre_str} series"
            f"{f' that premiered in {year}' if year else ''}. "
            f"Explore the full details, characters, and where to watch officially."
        )
    
    image = get_best_image(anime)
    image_alt = f"{title} — Official Artwork"
    
    genres = get_genres(anime)
    tags = genres[:5] if genres else []
    
    # Add title words as tags
    title_words = [w for w in title.split() if len(w) > 3][:3]
    tags.extend(title_words)
    tags = list(dict.fromkeys(tags))[:8]  # deduplicate, max 8
    
    # Clean tags — remove slashes and special chars that break Astro
    tags = [re.sub(r'[/\\<>]', '', t).strip() for t in tags if t]
    
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    return {
        "title":     title,
        "excerpt":   excerpt,
        "category":  category,
        "tags":      tags,
        "author":    "AniTube Buzz",
        "date":      date_str,
        "image":     image,
        "imageAlt":  image_alt,
        "featured":  is_featured,
        "trending":  is_trending,
        "draft":     False,
    }


def build_article_body(anime, characters, watch_links, trailer_embed):
    """
    Build the rich markdown body for an anime article.
    NO generic filler. All content is data-driven from Jikan.
    """
    title      = anime.get("title_english") or anime.get("title", "Unknown")
    title_jp   = anime.get("title_japanese", "")
    synopsis   = clean_synopsis(anime.get("synopsis", ""))
    score      = anime.get("score")
    rank       = anime.get("rank")
    popularity = anime.get("popularity")
    members    = anime.get("members")
    status     = anime.get("status", "Unknown")
    episodes   = anime.get("episodes")
    season     = anime.get("season", "").capitalize() if anime.get("season") else ""
    year       = anime.get("year")
    rating     = anime.get("rating", "")
    source_mat = anime.get("source", "")
    mal_id     = anime.get("mal_id")
    mal_url    = anime.get("url") or f"https://myanimelist.net/anime/{mal_id}"
    
    studios_data = get_studios(anime)
    studios      = studios_data["studios"]
    producers    = studios_data["producers"]
    genres       = get_genres(anime)
    
    # Duration
    duration = anime.get("duration", "")
    
    # Aired
    aired = anime.get("aired", {})
    aired_from = aired.get("from", "")
    if aired_from:
        try:
            aired_from = datetime.fromisoformat(aired_from.replace("Z", "+00:00")).strftime("%B %d, %Y")
        except:
            pass
    aired_to = aired.get("to", "")
    if aired_to:
        try:
            aired_to = datetime.fromisoformat(aired_to.replace("Z", "+00:00")).strftime("%B %d, %Y")
        except:
            pass
    
    lines = []
    
    # ── Section: Synopsis ──────────────────────────────
    if synopsis:
        lines.append("## Story Overview\n")
        # Split into paragraphs if long
        if len(synopsis) > 500:
            # Split at sentence boundaries into ~2 paragraphs
            sentences = synopsis.replace('\n', ' ').split('. ')
            mid = len(sentences) // 2
            para1 = '. '.join(sentences[:mid]).strip()
            para2 = '. '.join(sentences[mid:]).strip()
            if para1 and not para1.endswith('.'):
                para1 += '.'
            if para2 and not para2.endswith('.'):
                para2 += '.'
            if para1:
                lines.append(para1 + "\n")
            if para2:
                lines.append(para2 + "\n")
        else:
            lines.append(synopsis + "\n")
    
    # ── Section: Quick Facts Table ──────────────────────
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
    if source_mat:
        lines.append(f"| Source Material | {source_mat} |")
    if rating:
        lines.append(f"| Rating | {rating} |")
    if aired_from and aired_to:
        lines.append(f"| Aired | {aired_from} — {aired_to} |")
    elif aired_from:
        lines.append(f"| Aired | {aired_from} — ongoing |")
    if studios:
        lines.append(f"| Studio | {', '.join(studios)} |")
    if producers:
        lines.append(f"| Producers | {', '.join(producers[:3])} |")
    if genres:
        lines.append(f"| Genres | {', '.join(genres[:6])} |")
    
    lines.append("")
    
    # ── Section: MAL Stats ──────────────────────────────
    if any([score, rank, popularity, members]):
        lines.append("## Community Stats\n")
        lines.append("| Metric | Value |")
        lines.append("|--------|-------|")
        if score:
            lines.append(f"| MAL Score | ⭐ {score} / 10 |")
        if rank:
            lines.append(f"| MAL Rank | #{format_number(rank)} |")
        if popularity:
            lines.append(f"| Popularity | #{format_number(popularity)} |")
        if members:
            lines.append(f"| Members | {format_number(members)} |")
        lines.append("")
        
        # Add MAL link
        lines.append(f"> 📊 [View full stats on MyAnimeList]({mal_url})\n")
    
    # ── Section: Official Trailer ───────────────────────
    if trailer_embed:
        lines.append("## Official Trailer\n")
        lines.append(f'<div class="video-embed-wrapper">')
        lines.append(f'<iframe')
        lines.append(f'  src="{trailer_embed}"')
        lines.append(f'  title="{title} — Official Trailer"')
        lines.append(f'  frameborder="0"')
        lines.append(f'  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"')
        lines.append(f'  allowfullscreen')
        lines.append(f'  loading="lazy"')
        lines.append(f'></iframe>')
        lines.append(f'</div>\n')
    
    # ── Section: Characters & Voice Actors ──────────────
    if characters:
        lines.append("## Characters & Voice Actors\n")
        lines.append("| Character | Role | Voice Actor (JP) |")
        lines.append("|-----------|------|-----------------|")
        for char in characters:
            name    = char["name"] or "—"
            role    = char["role"] or "—"
            va_name = char["va_name"] or "—"
            if char.get("va_url") and va_name != "—":
                va_cell = f"[{va_name}]({char['va_url']})"
            else:
                va_cell = va_name
            lines.append(f"| {name} | {role} | {va_cell} |")
        lines.append("")
    
    # ── Section: Where to Watch ─────────────────────────
    if watch_links:
        lines.append("## Where to Watch Officially\n")
        lines.append("> Support the creators by watching on official platforms only.\n")
        
        has_real_links = any(not link.get("is_search", False) for link in watch_links)
        
        for link in watch_links:
            icon     = link["icon"]
            platform = link["platform"]
            url      = link["url"]
            note     = " *(search)*" if link.get("is_search") else ""
            lines.append(f"- {icon} **[Watch on {platform}]({url})**{note}")
        
        lines.append("")
        
        if not has_real_links:
            lines.append(
                "> ℹ️ Direct streaming links for this title were not available at time of publication. "
                "Availability varies by region.\n"
            )
    
    # ── Section: Source Attribution ─────────────────────
    lines.append("---\n")
    lines.append(
        f"*Data sourced from [MyAnimeList]({mal_url}) via Jikan API. "
        f"All characters, artwork, and titles are property of their respective creators and studios.*"
    )
    
    return "\n".join(lines)


def build_markdown_file(frontmatter, body):
    """Combine frontmatter and body into a valid Markdown file."""
    
    def yaml_str(val):
        """Safely format a value for YAML."""
        if isinstance(val, str):
            # Escape double quotes and wrap in double quotes if needed
            escaped = val.replace('\\', '\\\\').replace('"', '\\"')
            return f'"{escaped}"'
        return str(val)
    
    def yaml_list(items):
        if not items:
            return "[]"
        escaped = [re.sub(r'[/\\<>"\']', '', str(i)).strip() for i in items]
        escaped = [i for i in escaped if i]
        if not escaped:
            return "[]"
        inner = ", ".join(f'"{i}"' for i in escaped)
        return f"[{inner}]"
    
    fm_lines = ["---"]
    fm_lines.append(f'title: {yaml_str(frontmatter["title"])}')
    fm_lines.append(f'excerpt: {yaml_str(frontmatter["excerpt"])}')
    fm_lines.append(f'category: {yaml_str(frontmatter["category"])}')
    fm_lines.append(f'tags: {yaml_list(frontmatter["tags"])}')
    fm_lines.append(f'author: {yaml_str(frontmatter["author"])}')
    fm_lines.append(f'date: "{frontmatter["date"]}"')
    fm_lines.append(f'image: {yaml_str(frontmatter["image"])}')
    fm_lines.append(f'imageAlt: {yaml_str(frontmatter["imageAlt"])}')
    fm_lines.append(f'featured: {str(frontmatter["featured"]).lower()}')
    fm_lines.append(f'trending: {str(frontmatter["trending"]).lower()}')
    fm_lines.append(f'draft: false')
    fm_lines.append("---\n")
    
    return "\n".join(fm_lines) + body


# ── Anime Fetchers ─────────────────────────────────────────────────────────────

def fetch_seasonal_anime():
    """Fetch currently airing anime from Jikan."""
    print("[writer] Fetching seasonal anime...")
    data = jikan_get("seasons/now", {"limit": 20, "filter": "tv"})
    if not data or not data.get("data"):
        return []
    return data["data"]


def fetch_top_anime(page=1):
    """Fetch top-rated anime from Jikan."""
    print(f"[writer] Fetching top anime (page {page})...")
    data = jikan_get("top/anime", {"page": page, "type": "tv", "limit": 20})
    if not data or not data.get("data"):
        return []
    return data["data"]


def fetch_anime_by_id(mal_id):
    """Fetch full anime details by MAL ID."""
    print(f"[writer] Fetching anime ID {mal_id}...")
    data = jikan_get(f"anime/{mal_id}/full")
    if not data or not data.get("data"):
        return None
    return data["data"]


def fetch_upcoming_anime():
    """Fetch upcoming anime."""
    print("[writer] Fetching upcoming anime...")
    data = jikan_get("seasons/upcoming", {"limit": 15, "filter": "tv"})
    if not data or not data.get("data"):
        return []
    return data["data"]


# ── Article Generators ────────────────────────────────────────────────────────

def generate_anime_recap_article(anime_data, tracker):
    """Generate a rich Anime Recap article for a given anime."""
    
    mal_id = anime_data.get("mal_id")
    title  = anime_data.get("title_english") or anime_data.get("title", "")
    
    if not mal_id or not title:
        return None
    
    tracker_key = f"recap_{mal_id}"
    if already_published(tracker, tracker_key):
        print(f"  [skip] Already published recap for: {title}")
        return None
    
    # Ensure we have the full data (seasonal list may not have all fields)
    if "streaming" not in anime_data:
        full = fetch_anime_by_id(mal_id)
        if full:
            anime_data = full
    
    # Get characters
    characters = get_characters(mal_id, limit=8)
    
    # Build watch links
    streaming_raw = anime_data.get("streaming", [])
    watch_links = build_watch_links(streaming_raw, title)
    if not watch_links:
        watch_links = build_watch_links_fallback(title)
    
    # Build trailer embed
    trailer_embed = build_trailer_embed(anime_data.get("trailer", {}))
    
    # Get image — must be from MAL CDN
    image = get_best_image(anime_data)
    if not image:
        print(f"  [skip] No MAL image for: {title}")
        mark_published(tracker, tracker_key)
        return None  # Don't publish without a real image
    
    # Determine if featured/trending
    score  = anime_data.get("score") or 0
    rank   = anime_data.get("rank") or 9999
    is_featured  = score >= 8.0 or rank <= 100
    is_trending  = anime_data.get("airing", False) and score >= 7.5
    
    # Build frontmatter
    fm = build_article_frontmatter(
        anime_data,
        category="Anime Recap",
        is_featured=is_featured,
        is_trending=is_trending
    )
    
    # Build body
    body = build_article_body(anime_data, characters, watch_links, trailer_embed)
    
    # Build markdown
    markdown = build_markdown_file(fm, body)
    
    # Generate slug
    slug = slugify(title)[:80]
    if not slug:
        slug = f"anime-{mal_id}"
    
    filename = f"{fm['date']}-{slug}.md"
    filepath = os.path.join(POSTS_DIR, filename)
    
    # Don't overwrite existing articles
    if os.path.exists(filepath):
        print(f"  [skip] File exists: {filename}")
        mark_published(tracker, tracker_key)
        return None
    
    return {
        "filepath": filepath,
        "filename": filename,
        "markdown": markdown,
        "tracker_key": tracker_key,
        "title": title,
    }


def generate_news_article(anime_data, tracker, topic="new_season"):
    """
    Generate a News category article about a specific anime event.
    topic: 'new_season' | 'upcoming' | 'announcement'
    """
    
    mal_id = anime_data.get("mal_id")
    title  = anime_data.get("title_english") or anime_data.get("title", "")
    
    if not mal_id or not title:
        return None
    
    tracker_key = f"news_{topic}_{mal_id}"
    if already_published(tracker, tracker_key):
        print(f"  [skip] Already published news ({topic}) for: {title}")
        return None
    
    # Get full data if needed
    if "streaming" not in anime_data:
        full = fetch_anime_by_id(mal_id)
        if full:
            anime_data = full
    
    image = get_best_image(anime_data)
    if not image:
        mark_published(tracker, tracker_key)
        return None
    
    # Build news-angle headline
    season = anime_data.get("season", "").capitalize() if anime_data.get("season") else ""
    year   = anime_data.get("year") or ""
    status = anime_data.get("status", "")
    
    if topic == "upcoming":
        news_title = f"{title}: Everything We Know About the Upcoming Season"
        if season and year:
            news_title = f"{title} Confirmed for {season} {year} — Full Preview"
    elif topic == "new_season" and status == "Currently Airing":
        news_title = f"{title} Is Currently Airing — Where to Watch and What to Expect"
    else:
        news_title = f"{title}: Full Details, Where to Watch, and Latest Updates"
    
    synopsis = clean_synopsis(anime_data.get("synopsis", ""))
    
    # For news articles, build a slightly different excerpt
    score = anime_data.get("score")
    genres = get_genres(anime_data)
    studios_data = get_studios(anime_data)
    studios = studios_data["studios"]
    
    score_note = f"with a MAL score of {score}/10" if score else ""
    studio_note = f"produced by {studios[0]}" if studios else ""
    genre_note  = f"{', '.join(genres[:2])}" if genres else "anime"
    
    excerpt_parts = [p for p in [genre_note, score_note, studio_note] if p]
    excerpt = f"{title} is a {' '.join(excerpt_parts[:2])} series. {synopsis[:180] if synopsis else 'Click to read the full details.'}"
    excerpt = excerpt[:280].strip()
    
    # Override frontmatter title
    anime_data_copy = dict(anime_data)
    
    fm = {
        "title":    news_title[:120],
        "excerpt":  excerpt,
        "category": "News",
        "tags":     (get_genres(anime_data)[:4] + [title.split()[0] if title else "anime"])[:8],
        "author":   "AniTube Buzz",
        "date":     datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "image":    image,
        "imageAlt": f"{title} — Anime Key Visual",
        "featured": False,
        "trending": anime_data.get("airing", False),
        "draft":    False,
    }
    
    # Clean tags
    fm["tags"] = [re.sub(r'[/\\<>"\']', '', t).strip() for t in fm["tags"] if t]
    
    # Build body
    watch_links  = build_watch_links(anime_data.get("streaming", []), title)
    if not watch_links:
        watch_links = build_watch_links_fallback(title)
    
    trailer_embed = build_trailer_embed(anime_data.get("trailer", {}))
    characters    = get_characters(mal_id, limit=6)
    
    body = build_article_body(anime_data, characters, watch_links, trailer_embed)
    markdown = build_markdown_file(fm, body)
    
    slug = slugify(news_title)[:80]
    if not slug:
        slug = f"news-{mal_id}"
    
    filename = f"{fm['date']}-{slug}.md"
    filepath = os.path.join(POSTS_DIR, filename)
    
    if os.path.exists(filepath):
        mark_published(tracker, tracker_key)
        return None
    
    return {
        "filepath":    filepath,
        "filename":    filename,
        "markdown":    markdown,
        "tracker_key": tracker_key,
        "title":       news_title,
    }


# ── Main Entry ────────────────────────────────────────────────────────────────

def run(max_articles=MAX_ARTICLES):
    """Main runner — generate up to max_articles new articles."""
    
    os.makedirs(POSTS_DIR, exist_ok=True)
    tracker = load_tracker()
    
    articles_written = 0
    articles_generated = []
    
    print(f"\n[writer] Starting article generation (max: {max_articles})\n")
    
    # ── Pass 1: Currently airing anime → Anime Recap articles ────────────────
    print("── Pass 1: Seasonal anime recaps ──")
    seasonal = fetch_seasonal_anime()
    random.shuffle(seasonal)  # Don't always start from the same ones
    
    for anime in seasonal:
        if articles_written >= max_articles:
            break
        result = generate_anime_recap_article(anime, tracker)
        if result:
            articles_generated.append(result)
            articles_written += 1
            print(f"  ✓ Queued: {result['title']}")
    
    # ── Pass 2: Upcoming anime → News articles ────────────────────────────────
    if articles_written < max_articles:
        print("\n── Pass 2: Upcoming anime news ──")
        upcoming = fetch_upcoming_anime()
        random.shuffle(upcoming)
        
        for anime in upcoming:
            if articles_written >= max_articles:
                break
            result = generate_news_article(anime, tracker, topic="upcoming")
            if result:
                articles_generated.append(result)
                articles_written += 1
                print(f"  ✓ Queued: {result['title']}")
    
    # ── Pass 3: Top/featured anime → Recap articles ───────────────────────────
    if articles_written < max_articles:
        print("\n── Pass 3: Top anime recaps ──")
        top_anime = fetch_top_anime(page=random.randint(1, 3))
        random.shuffle(top_anime)
        
        for anime in top_anime:
            if articles_written >= max_articles:
                break
            result = generate_anime_recap_article(anime, tracker)
            if result:
                articles_generated.append(result)
                articles_written += 1
                print(f"  ✓ Queued: {result['title']}")
    
    # ── Write all queued articles ─────────────────────────────────────────────
    print(f"\n[writer] Writing {len(articles_generated)} articles to disk...\n")
    
    for article in articles_generated:
        try:
            with open(article["filepath"], "w", encoding="utf-8") as f:
                f.write(article["markdown"])
            mark_published(tracker, article["tracker_key"])
            print(f"  ✅ Written: {article['filename']}")
        except Exception as e:
            print(f"  ❌ Error writing {article['filename']}: {e}")
    
    save_tracker(tracker)
    
    print(f"\n[writer] Done. {len(articles_generated)} articles generated.\n")
    return len(articles_generated)


if __name__ == "__main__":
    run()
