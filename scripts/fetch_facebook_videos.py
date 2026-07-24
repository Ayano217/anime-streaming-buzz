"""
fetch_facebook_videos.py — Fetch videos from Facebook Page Graph API
Saves to public/facebook-videos.json for use by the frontend.

Required GitHub Secrets:
  FB_PAGE_ID       — Your Facebook Page ID (numeric)
  FB_ACCESS_TOKEN  — Page Access Token with pages_read_engagement permission

The token needs these permissions:
  - pages_show_list
  - pages_read_engagement  
  - public_profile
"""

import os
import sys
import json
import requests
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────

PAGE_ID      = os.environ.get("FB_PAGE_ID", "")
ACCESS_TOKEN = os.environ.get("FB_ACCESS_TOKEN", "")
OUTPUT_FILE  = os.path.join("public", "facebook-videos.json")
MAX_VIDEOS   = 50   # How many videos to fetch total
PER_PAGE     = 10   # Videos per API request (Facebook max is 100)

GRAPH_BASE   = "https://graph.facebook.com/v19.0"

# Fields to request for each video
VIDEO_FIELDS = ",".join([
    "id",
    "title",
    "description",
    "permalink_url",
    "picture",          # thumbnail (low-res)
    "thumbnails",       # multiple thumbnail sizes
    "created_time",
    "length",           # duration in seconds
    "views",
])


# ── Helpers ───────────────────────────────────────────────────────────────────

def build_embed_url(page_id, video_id, permalink_url):
    """
    Build the Facebook video embed URL.
    Uses permalink_url if available (most reliable).
    """
    if permalink_url:
        return f"https://www.facebook.com/plugins/video.php?href={requests.utils.quote(permalink_url)}&show_text=false&width=700"
    return f"https://www.facebook.com/plugins/video.php?href={requests.utils.quote(f'https://www.facebook.com/{page_id}/videos/{video_id}/')}&show_text=false&width=700"


def get_best_thumbnail(video):
    """Extract the largest available thumbnail from video data."""
    # Try thumbnails object first (has multiple sizes)
    thumbnails = video.get("thumbnails", {})
    thumb_data = thumbnails.get("data", [])
    if thumb_data:
        # Sort by width descending, pick largest
        sorted_thumbs = sorted(thumb_data, key=lambda x: x.get("width", 0), reverse=True)
        best = sorted_thumbs[0]
        return best.get("uri", "") or best.get("url", "")
    # Fall back to picture field
    return video.get("picture", "")


def fetch_page_videos(page_id, access_token):
    """
    Fetch videos from a Facebook Page using Graph API.
    Returns list of processed video dicts.
    """
    videos   = []
    endpoint = f"{GRAPH_BASE}/{page_id}/videos"
    params   = {
        "access_token": access_token,
        "fields":       VIDEO_FIELDS,
        "limit":        PER_PAGE,
        "type":         "uploaded",   # Only uploaded videos (not shared)
    }

    fetched = 0
    page_num = 1

    while fetched < MAX_VIDEOS:
        print(f"  [FB] Fetching page {page_num} of videos...")
        try:
            res = requests.get(endpoint, params=params, timeout=20)
            data = res.json()

            if "error" in data:
                err = data["error"]
                print(f"  [FB] API Error: {err.get('message', 'Unknown error')}")
                print(f"  [FB] Error code: {err.get('code')} / type: {err.get('type')}")
                break

            page_videos = data.get("data", [])
            if not page_videos:
                print("  [FB] No more videos.")
                break

            for v in page_videos:
                if fetched >= MAX_VIDEOS:
                    break

                vid_id      = v.get("id", "")
                permalink   = v.get("permalink_url", "")
                thumbnail   = get_best_thumbnail(v)
                title       = v.get("title", "") or v.get("description", "")[:80] or "Watch Video"
                description = v.get("description", "")
                created     = v.get("created_time", "")
                length      = v.get("length", 0)
                views       = v.get("views", 0)

                # Build the embed URL
                embed_url = build_embed_url(page_id, vid_id, permalink)

                # Build the watch URL (direct Facebook link)
                watch_url = permalink or f"https://www.facebook.com/{page_id}/videos/{vid_id}/"

                videos.append({
                    "id":            vid_id,
                    "title":         title,
                    "description":   description,
                    "permalink_url": watch_url,
                    "embed_url":     embed_url,
                    "picture":       thumbnail,
                    "full_picture":  thumbnail,
                    "created_time":  created,
                    "length":        length,
                    "views":         views,
                })
                fetched += 1

            # Get next page cursor
            paging  = data.get("paging", {})
            cursors = paging.get("cursors", {})
            after   = cursors.get("after", "")
            next_url = paging.get("next", "")

            if not next_url and not after:
                print("  [FB] Reached last page.")
                break

            if after:
                params["after"] = after
            else:
                # Parse next URL for params
                break

            page_num += 1

        except requests.exceptions.Timeout:
            print("  [FB] Request timed out")
            break
        except Exception as e:
            print(f"  [FB] Unexpected error: {e}")
            break

    return videos


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("[FB Fetcher] Starting Facebook video fetch...")

    if not PAGE_ID or not ACCESS_TOKEN:
        print("[FB Fetcher] ERROR: FB_PAGE_ID or FB_ACCESS_TOKEN not set in environment.")
        print("[FB Fetcher] Writing empty JSON so site doesn't break.")
        output = {
            "videos":     [],
            "page_url":   "https://www.facebook.com",
            "fetched_at": datetime.utcnow().isoformat() + "Z",
            "count":      0,
            "error":      "FB_PAGE_ID or FB_ACCESS_TOKEN not configured",
        }
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2)
        return

    # Fetch page info first (to get page URL)
    page_url = f"https://www.facebook.com/{PAGE_ID}"
    try:
        info_res = requests.get(
            f"{GRAPH_BASE}/{PAGE_ID}",
            params={"access_token": ACCESS_TOKEN, "fields": "id,name,link"},
            timeout=10
        )
        info_data = info_res.json()
        if "link" in info_data:
            page_url = info_data["link"]
            print(f"[FB Fetcher] Page: {info_data.get('name', '')} — {page_url}")
        elif "error" in info_data:
            print(f"[FB Fetcher] Page info error: {info_data['error'].get('message', '')}")
    except Exception as e:
        print(f"[FB Fetcher] Could not fetch page info: {e}")

    # Fetch videos
    videos = fetch_page_videos(PAGE_ID, ACCESS_TOKEN)
    print(f"\n[FB Fetcher] Fetched {len(videos)} videos total.")

    # Write output
    output = {
        "videos":     videos,
        "page_url":   page_url,
        "fetched_at": datetime.utcnow().isoformat() + "Z",
        "count":      len(videos),
    }

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"[FB Fetcher] Saved to {OUTPUT_FILE}")
    print(f"[FB Fetcher] Done. {len(videos)} videos saved.")


if __name__ == "__main__":
    main()
