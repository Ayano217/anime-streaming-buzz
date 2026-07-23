#!/usr/bin/env python3

import os
import json
import requests


PAGE_ID = os.environ.get("FB_PAGE_ID", "")
ACCESS_TOKEN = os.environ.get("FB_ACCESS_TOKEN", "")


def fetch_all_videos():
    if not PAGE_ID or not ACCESS_TOKEN:
        print("FB credentials not set, skipping")
        return []

    all_videos = []
    url = (
        f"https://graph.facebook.com/v19.0/{PAGE_ID}/videos"
        f"?fields=id,title,description,permalink_url,created_time,length,embed_html"
        f"&limit=25"
        f"&access_token={ACCESS_TOKEN}"
    )

    page_count = 1
    while url and page_count <= 10:
        try:
            print(f"Fetching page {page_count}...")
            res = requests.get(url, timeout=15)

            if res.status_code != 200:
                print(f"FB API error {res.status_code}: {res.text[:200]}")
                break

            data = res.json()
            videos = data.get("data", [])

            # Build proper full URL for each video
            cleaned = []
            for v in videos:
                purl = v.get("permalink_url", "")

                # Build full URL
                if purl.startswith("http"):
                    full_url = purl
                elif purl.startswith("/"):
                    full_url = f"https://www.facebook.com{purl}"
                else:
                    full_url = f"https://www.facebook.com/{purl}"

                cleaned.append({
                    "id": v.get("id", ""),
                    "title": v.get("title", ""),
                    "description": v.get("description", ""),
                    "permalink_url": full_url,
                    "created_time": v.get("created_time", ""),
                    "length": v.get("length", 0),
                })

            all_videos.extend(cleaned)
            print(f"Got {len(videos)} videos (total: {len(all_videos)})")

            next_url = data.get("paging", {}).get("next", "")
            url = next_url if next_url else None
            page_count += 1

        except Exception as e:
            print(f"Fetch error: {e}")
            break

    print(f"Total videos: {len(all_videos)}")
    return all_videos


def save_videos(videos):
    path = os.path.join(
        os.path.dirname(__file__),
        "..", "public", "facebook-videos.json"
    )
    os.makedirs(os.path.dirname(path), exist_ok=True)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(videos, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(videos)} videos to {path}")


if __name__ == "__main__":
    print("Fetching Facebook videos...")
    videos = fetch_all_videos()
    save_videos(videos)
