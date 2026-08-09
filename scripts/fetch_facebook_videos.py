import os
import re
import sys
import json
import time
import requests
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────
PAGE_ID      = os.environ.get("FB_PAGE_ID", "")
ACCESS_TOKEN = os.environ.get("FB_ACCESS_TOKEN", "")
OUTPUT_FILE  = os.path.join("public", "facebook-videos.json")
MAX_VIDEOS   = 50
GRAPH_BASE   = "https://graph.facebook.com/v19.0"
# AnimoTV base use korbo anime slug verify korar jonno
ANIMOTV_BASE = "https://animotv.net/wp-json/wp/v2"

# ── Helpers ───────────────────────────────────────────────────────────────────

def clean_title_for_search(text):
    """Title theke emoji ar faldue hashtags remove kore shudhu search query banay."""
    if not text: return ""
    # Remove hashtags
    text = re.sub(r'#\w+', '', text)
    # Remove emojis
    text = text.encode('ascii', 'ignore').decode('ascii')
    # Remove common filler words
    fillers = ['why', 'are', 'they', 'the', 'is', 'back', 'this', 'that', 'with', 'moment', 'scene', 'funny', 'emotional']
    words = text.split()
    clean_words = [w for w in words if w.lower() not in fillers and len(w) > 2]
    return " ".join(clean_words[:5]) # top 5 words for search

def find_anime_slug(search_query):
    """AnimoTV-te search kore real slug ber korar chesta kore."""
    if not search_query or len(search_query) < 3: return None
    try:
        url = f"{ANIMOTV_BASE}/posts"
        params = {"search": search_query, "per_page": 1}
        res = requests.get(url, params=params, timeout=10)
        if res.status_code == 200:
            data = res.json()
            if data and len(data) > 0:
                return data[0].get("slug")
    except:
        pass
    return None

def extract_episode(text):
    """Title theke episode number ber korar universal regex."""
    match = re.search(r'(?:ep|episode|part)\s*(\d+)', text, re.I)
    if match: return int(match.group(1))
    return 1

# ── Facebook Fetch ────────────────────────────────────────────────────────────

def fetch_videos(page_id, token):
    print(f"[FB] Fetching from Page ID: {page_id}")
    endpoint = f"{GRAPH_BASE}/{page_id}/videos"
    params = {
        "access_token": token,
        "fields": "id,title,description,permalink_url,picture,created_time",
        "limit": MAX_VIDEOS
    }
    
    try:
        res = requests.get(endpoint, params=params)
        data = res.json()
        raw_videos = data.get("data", [])
        
        processed = []
        for v in raw_videos:
            title = v.get("title") or v.get("description") or "Untitled Anime"
            desc = v.get("description", "")
            
            # Universal Step: Auto-detect slug using AnimoTV search
            search_q = clean_title_for_search(title)
            slug = find_anime_slug(search_q)
            ep = extract_episode(title + " " + desc)
            
            processed.append({
                "id": v.get("id"),
                "title": title,
                "permalink_url": v.get("permalink_url"),
                "picture": v.get("picture"),
                "animeSlug": slug, # dynamic matched slug
                "episode": ep,
                "fetched_at": datetime.utcnow().isoformat()
            })
            print(f"  > Found: {title[:30]}... Matched Slug: {slug}")
            
        return processed
    except Exception as e:
        print(f"Error: {e}")
        return []

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not PAGE_ID or not ACCESS_TOKEN:
        print("Missing FB Config")
        return

    videos = fetch_videos(PAGE_ID, ACCESS_TOKEN)
    
    output = {
        "videos": videos,
        "fetched_at": datetime.utcnow().isoformat(),
        "count": len(videos)
    }

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"Done! Saved {len(videos)} videos.")

if __name__ == "__main__":
    main()
