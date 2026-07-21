#!/usr/bin/env python3
"""
Fetch Facebook Page videos and save to public JSON
"""

import os
import json
import requests
from datetime import datetime


PAGE_ID = os.environ.get("FB_PAGE_ID", "")
ACCESS_TOKEN = os.environ.get("FB_ACCESS_TOKEN", "")


def fetch_page_videos():
    if not PAGE_ID or not ACCESS_TOKEN:
        print("FB_PAGE_ID or FB_ACCESS_TOKEN not set")
        return []

    try:
        url = (
            f"https://graph.facebook.com/v19.0/{PAGE_ID}/videos"
            f"?fields=id,title,description,permalink_url,created_time,length"
            f"&limit=6"
            f"&access_token={ACCESS_TOKEN}"
        )

        res = requests.get(url, timeout=15)
        if res.status_code != 200:
            print(f"FB API error: {res.status_code} - {res.text[:200]}")
            return []

        data = res.json()
        videos = data.get("data", [])
        print(f"Found {len(videos)} Facebook videos")
        return videos

    except Exception as e:
        print(f"Facebook fetch error: {e}")
        return []


def save_videos(videos):
    output_path = os.path.join(
        os.path.dirname(__file__),
        "..",
        "public",
        "facebook-videos.json"
    )

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(videos, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(videos)} videos to {output_path}")


if __name__ == "__main__":
    print("Fetching Facebook Page videos...")
    videos = fetch_page_videos()
    save_videos(videos)
    print("Done.")
