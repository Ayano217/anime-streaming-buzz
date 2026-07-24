"""
fetch_bg_images.py — Auto-download latest anime backgrounds
Downloads high-quality anime images from Jikan API + YouTube channels
Saves to public/bg/ for use as website background
"""

import os
import json
import time
import requests
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────
JIKAN_BASE = "https://api.jikan.moe/v4"
BG_DIR     = os.path.join("public", "bg")
BG_META    = os.path.join("public", "bg", "meta.json")
MAX_IMAGES = 15   # Keep 15 backgrounds max
JIKAN_DELAY = 2.5

os.makedirs(BG_DIR, exist_ok=True)


# ── Jikan helpers ─────────────────────────────────────────────────
def jikan_get(endpoint, params=None):
    time.sleep(JIKAN_DELAY)
    try:
        r = requests.get(f"{JIKAN_BASE}/{endpoint}", params=params or {}, timeout=15)
        if r.status_code == 429:
            time.sleep(10)
            r = requests.get(f"{JIKAN_BASE}/{endpoint}", params=params or {}, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"  [Jikan] Error: {e}")
        return None


def get_high_res_image(anime):
    """Get the largest quality image URL."""
    images = anime.get("images", {})
    jpg = images.get("jpg", {})
    webp = images.get("webp", {})
    for url in [
        jpg.get("large_image_url", ""),
        webp.get("large_image_url", ""),
        jpg.get("image_url", ""),
    ]:
        if url and "cdn.myanimelist.net" in url:
            return url
    return ""


def download_image(url, filepath):
    """Download image to filepath. Returns True on success."""
    try:
        r = requests.get(url, timeout=20, stream=True, headers={
            'User-Agent': 'Mozilla/5.0 AniTubeBuzz Bot'
        })
        r.raise_for_status()
        if 'image' not in r.headers.get('Content-Type', ''):
            print(f"  [skip] Not an image: {url}")
            return False
        with open(filepath, 'wb') as f:
            for chunk in r.iter_content(8192):
                f.write(chunk)
        # Check file size (skip tiny/broken images)
        if os.path.getsize(filepath) < 20000:  # < 20KB = probably broken
            os.remove(filepath)
            return False
        return True
    except Exception as e:
        print(f"  [error] Download failed: {e}")
        if os.path.exists(filepath):
            os.remove(filepath)
        return False


# ── Fetchers ──────────────────────────────────────────────────────
def fetch_currently_airing():
    """Get currently airing anime (freshest)."""
    print("[bg] Fetching currently airing anime...")
    data = jikan_get("seasons/now", {"limit": 25, "filter": "tv"})
    return data["data"] if data and data.get("data") else []


def fetch_top_airing():
    """Get top-rated currently airing anime."""
    print("[bg] Fetching top airing anime...")
    data = jikan_get("top/anime", {"filter": "airing", "limit": 20})
    return data["data"] if data and data.get("data") else []


def fetch_upcoming():
    """Get upcoming anime (hyped)."""
    print("[bg] Fetching upcoming anime...")
    data = jikan_get("seasons/upcoming", {"limit": 15, "filter": "tv"})
    return data["data"] if data and data.get("data") else []


# ── Main ──────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("Anime Background Fetcher")
    print("=" * 60)

    # Collect anime from all sources
    all_anime = []
    seen_ids = set()

    for anime in fetch_top_airing():
        mid = anime.get("mal_id")
        if mid and mid not in seen_ids:
            seen_ids.add(mid)
            all_anime.append({"anime": anime, "source": "top_airing"})

    for anime in fetch_currently_airing():
        mid = anime.get("mal_id")
        if mid and mid not in seen_ids:
            seen_ids.add(mid)
            all_anime.append({"anime": anime, "source": "airing"})

    for anime in fetch_upcoming():
        mid = anime.get("mal_id")
        if mid and mid not in seen_ids:
            seen_ids.add(mid)
            all_anime.append({"anime": anime, "source": "upcoming"})

    print(f"\n[bg] Total unique anime found: {len(all_anime)}")

    # Sort by score (hype anime first)
    def sort_key(item):
        a = item["anime"]
        score = a.get("score") or 0
        members = a.get("members") or 0
        return (score, members)

    all_anime.sort(key=sort_key, reverse=True)

    # Download top N images
    print(f"\n[bg] Downloading up to {MAX_IMAGES} background images...\n")

    # Clean old images first
    for f in os.listdir(BG_DIR):
        if f.startswith("bg") and f.endswith((".jpg", ".jpeg", ".png", ".webp")):
            try:
                os.remove(os.path.join(BG_DIR, f))
            except:
                pass

    downloaded = []
    idx = 1

    for item in all_anime:
        if len(downloaded) >= MAX_IMAGES:
            break

        anime = item["anime"]
        source = item["source"]
        title  = anime.get("title_english") or anime.get("title", "Unknown")
        image  = get_high_res_image(anime)

        if not image:
            continue

        filename = f"bg{idx}.jpg"
        filepath = os.path.join(BG_DIR, filename)

        print(f"  [{idx}/{MAX_IMAGES}] {title[:50]} ({source})")

        if download_image(image, filepath):
            downloaded.append({
                "filename": filename,
                "title":    title,
                "mal_id":   anime.get("mal_id"),
                "score":    anime.get("score"),
                "source":   source,
                "url":      anime.get("url", ""),
            })
            print(f"    ✓ Saved as {filename}")
            idx += 1
        else:
            print(f"    ✗ Skipped")

    # Save metadata
    meta = {
        "count":      len(downloaded),
        "updated_at": datetime.utcnow().isoformat() + "Z",
        "images":     downloaded,
    }

    with open(BG_META, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    print(f"\n[bg] Done. {len(downloaded)} backgrounds saved.")
    print(f"[bg] Metadata: {BG_META}")


if __name__ == "__main__":
    main()
