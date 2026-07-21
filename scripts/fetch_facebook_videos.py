#!/usr/bin/env python3

import os
import json
import requests


PAGE_ID = os.environ.get("FB_PAGE_ID", "")
ACCESS_TOKEN = os.environ.get("FB_ACCESS_TOKEN", "")


def fetch_all_videos():
    if not PAGE_ID or not ACCESS_TOKEN:
        print("FB credentials not set")
        return []

    all_videos = []
    url = (
        f"https://graph.facebook.com/v19.0/{PAGE_ID}/videos"
        f"?fields=id,title,description,permalink_url,created_time,length"
        f"&limit=100"
        f"&access_token={ACCESS_TOKEN}"
    )

    page = 1
    while url:
        try:
            print(f"Fetching FB videos page {page}...")
            res = requests.get(url, timeout=15)

            if res.status_code != 200:
                print(f"FB error: {res.status_code}")
                print(res.text[:200])
                break

            data = res.json()
            videos = data.get("data", [])
            all_videos.extend(videos)
            print(f"Got {len(videos)} videos (total: {len(all_videos)})")

            next_url = data.get("paging", {}).get("next", "")
            url = next_url if next_url else None
            page += 1

        except Exception as e:
            print(f"FB error: {e}")
            break

    print(f"Total Facebook videos: {len(all_videos)}")
    return all_videos


def save_videos(videos):
    path = os.path.join(
        os.path.dirname(__file__),
        "..", "public", "facebook-videos.json"
    )
    os.makedirs(os.path.dirname(path), exist_ok=True)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(videos, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(videos)} videos")


if __name__ == "__main__":
    videos = fetch_all_videos()
    save_videos(videos)
