"""
fetch_anime.py — AniTube Buzz Anime Data Fetcher
Fetches fresh anime data from Jikan (MyAnimeList) API
Runs every 3 hours via GitHub Actions
Saves to public/data/anime-static.json
"""

import json
import os
import time
import sys
from datetime import datetime, timezone
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'anime-static.json')
JIKAN_BASE = 'https://api.jikan.moe/v4'
REQUEST_DELAY = 2.0  # Slower — safer for Jikan free tier
MAX_RETRIES = 4
USER_AGENT = 'AniTubeBuzz/1.0 (GitHub Auto-Publisher)'


def jikan_get(endpoint, retries=MAX_RETRIES):
    """Fetch from Jikan API with retry logic"""
    url = f'{JIKAN_BASE}{endpoint}'
    
    for attempt in range(1, retries + 1):
        try:
            req = Request(url, headers={
                'User-Agent': USER_AGENT,
                'Accept': 'application/json'
            })
            with urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                time.sleep(REQUEST_DELAY)
                return data
        except HTTPError as e:
            if e.code == 429:
                wait = 6 * attempt
                print(f'  [!] Rate limited (429), waiting {wait}s... (attempt {attempt}/{retries})')
                time.sleep(wait)
            elif e.code == 404:
                print(f'  [!] Not found: {url}')
                return None
            elif e.code >= 500:
                wait = 5 * attempt
                print(f'  [!] Server error {e.code}, waiting {wait}s... (attempt {attempt}/{retries})')
                time.sleep(wait)
            else:
                print(f'  [!] HTTP {e.code} for {url} (attempt {attempt}/{retries})')
                time.sleep(3 * attempt)
        except (URLError, Exception) as e:
            print(f'  [!] Error: {e} (attempt {attempt}/{retries})')
            time.sleep(3 * attempt)
    
    print(f'  [x] Failed after {retries} attempts: {url}')
    return None


def normalize_anime(item):
    """Convert Jikan anime object to our format"""
    title = item.get('title_english') or item.get('title') or item.get('title_japanese') or 'Unknown'
    
    slug = title.lower()
    for ch in [':', "'", '"', '!', '?', ',', '.', '(', ')', '[', ']', '{', '}', '/', '\\', '&', '+', '=', '@', '#', '$', '%', '^', '*']:
        slug = slug.replace(ch, '')
    slug = slug.replace(' ', '-').replace('--', '-').replace('--', '-').strip('-')[:80]
    
    images = item.get('images', {})
    image = (
        images.get('jpg', {}).get('large_image_url') or
        images.get('jpg', {}).get('image_url') or
        images.get('webp', {}).get('large_image_url') or
        images.get('webp', {}).get('image_url') or
        ''
    )
    
    score = None
    if item.get('score'):
        try:
            score = round(float(item['score']), 1)
        except (ValueError, TypeError):
            score = None
    
    raw_status = (item.get('status') or '').lower()
    if 'airing' in raw_status:
        status = 'current'
    elif 'finished' in raw_status:
        status = 'finished'
    elif 'not yet' in raw_status:
        status = 'upcoming'
    else:
        status = 'unknown'
    
    year = item.get('year')
    if not year and item.get('aired', {}).get('from'):
        try:
            year = int(item['aired']['from'][:4])
        except (ValueError, TypeError, IndexError):
            year = None
    
    genres = [g.get('name', '') for g in (item.get('genres') or []) if g.get('name')]
    themes = [t.get('name', '') for t in (item.get('themes') or []) if t.get('name')]
    demographics = [d.get('name', '') for d in (item.get('demographics') or []) if d.get('name')]
    all_genres = genres + themes + demographics
    
    studios = [s.get('name', '') for s in (item.get('studios') or []) if s.get('name')]
    
    return {
        'id': str(item.get('mal_id', '')),
        'title': title,
        'title_japanese': item.get('title_japanese', ''),
        'image': image,
        'score': score,
        'episodes': item.get('episodes') or 0,
        'status': status,
        'synopsis': (item.get('synopsis') or '')[:500],
        'genres': all_genres[:5],
        'year': year,
        'slug': slug,
        'type': item.get('type', 'TV'),
        'rating': item.get('rating', ''),
        'season': item.get('season', ''),
        'studios': studios[:3],
        'members': item.get('members', 0),
        'rank': item.get('rank'),
        'start_date': item.get('aired', {}).get('from', ''),
        'end_date': item.get('aired', {}).get('to', ''),
        'source': item.get('source', ''),
        'duration': item.get('duration', ''),
        'trailer_url': item.get('trailer', {}).get('url', ''),
        'trailer_embed': item.get('trailer', {}).get('embed_url', '')
    }


def fetch_category(name, endpoint_builder, pages=2, category_tag='airing'):
    """Generic fetch for a category with error recovery"""
    print(f'\n[Fetching] {name}...')
    anime_list = []
    
    for page in range(1, pages + 1):
        print(f'  Page {page}/{pages}...')
        endpoint = endpoint_builder(page)
        data = jikan_get(endpoint)
        
        if not data:
            print(f'  [!] Failed page {page}, stopping this category')
            break
        
        if not data.get('data'):
            print(f'  [!] No data on page {page}')
            break
        
        for item in data['data']:
            anime = normalize_anime(item)
            if anime['id'] and anime['title'] != 'Unknown':
                anime['_category'] = category_tag
                anime_list.append(anime)
        
        if not data.get('pagination', {}).get('has_next_page', False):
            print(f'  [i] No more pages after page {page}')
            break
    
    print(f'  [OK] Got {len(anime_list)} {name} anime')
    return anime_list


def merge_and_deduplicate(all_lists):
    """Merge all anime lists, remove duplicates, keep best data"""
    seen_ids = {}
    
    for anime_list in all_lists:
        for anime in anime_list:
            aid = anime['id']
            if aid in seen_ids:
                existing = seen_ids[aid]
                existing_cats = existing.get('categories', [])
                new_cat = anime.get('_category', '')
                if new_cat and new_cat not in existing_cats:
                    existing_cats.append(new_cat)
                existing['categories'] = existing_cats
                
                if not existing.get('score') and anime.get('score'):
                    existing['score'] = anime['score']
                if not existing.get('synopsis') and anime.get('synopsis'):
                    existing['synopsis'] = anime['synopsis']
                if not existing.get('trailer_url') and anime.get('trailer_url'):
                    existing['trailer_url'] = anime['trailer_url']
                    existing['trailer_embed'] = anime.get('trailer_embed', '')
            else:
                cat = anime.pop('_category', 'unknown')
                anime['categories'] = [cat]
                seen_ids[aid] = anime
    
    return list(seen_ids.values())


def load_existing():
    """Load existing anime-static.json to preserve any manual additions"""
    try:
        if os.path.exists(OUTPUT_PATH):
            with open(OUTPUT_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('anime', [])
    except Exception as e:
        print(f'  [!] Could not load existing data: {e}')
    return []


def run():
    """Main entry point"""
    print('=' * 60)
    print('AniTube Buzz — Anime Data Fetcher')
    print(f'Time: {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")}')
    print('=' * 60)
    
    # Fetch each category with careful rate limiting
    airing = fetch_category(
        'Currently Airing',
        lambda p: f'/seasons/now?page={p}&limit=25&sfw=true',
        pages=3,
        category_tag='airing'
    )
    
    time.sleep(4)  # Longer pause between categories
    top = fetch_category(
        'Top Rated',
        lambda p: f'/top/anime?page={p}&limit=25&sfw=true',
        pages=2,
        category_tag='top'
    )
    
    time.sleep(4)
    popular = fetch_category(
        'Most Popular',
        lambda p: f'/top/anime?page={p}&limit=25&sfw=true&filter=bypopularity',
        pages=2,
        category_tag='popular'
    )
    
    time.sleep(4)
    upcoming = fetch_category(
        'Upcoming',
        lambda p: f'/top/anime?page={p}&limit=25&sfw=true&filter=upcoming',
        pages=2,
        category_tag='upcoming'
    )
    
    time.sleep(4)
    movies = fetch_category(
        'Top Movies',
        lambda p: f'/top/anime?page={p}&limit=25&sfw=true&type=movie',
        pages=2,
        category_tag='movies'
    )
    
    print('\n[Merge] Deduplicating...')
    all_anime = merge_and_deduplicate([airing, top, popular, upcoming, movies])
    
    existing = load_existing()
    new_ids = {a.get('id') for a in all_anime if a.get('id')}
    
    manual_kept = 0
    for ex in existing:
        if ex.get('id') and ex['id'] not in new_ids:
            if 'categories' not in ex:
                ex['categories'] = ['archive']
            all_anime.append(ex)
            manual_kept += 1
    
    if manual_kept > 0:
        print(f'  [i] Preserved {manual_kept} existing entries not in current fetch')
    
    # Safety check: If we got very few results, KEEP the old data
    if len(all_anime) < 20 and len(existing) > 20:
        print(f'\n[!] WARNING: Only got {len(all_anime)} anime, but existing had {len(existing)}!')
        print('[!] Fetch failed too much. Keeping OLD data to prevent site breaking.')
        return len(existing)
    
    def sort_key(a):
        cats = a.get('categories', [])
        start = a.get('start_date', '') or ''
        members = a.get('members', 0) or 0
        rank = a.get('rank') or 99999
        
        priority_map = {'airing': 0, 'top': 1, 'popular': 2, 'upcoming': 3, 'movies': 4, 'archive': 5}
        best_priority = min(priority_map.get(c, 6) for c in cats) if cats else 6
        
        return (best_priority, -len(start), -members, rank)
    
    all_anime.sort(key=sort_key)
    
    now_utc = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    
    output = {
        'updated': now_utc,
        'total': len(all_anime),
        'categories': {
            'airing': len([a for a in all_anime if 'airing' in a.get('categories', [])]),
            'top': len([a for a in all_anime if 'top' in a.get('categories', [])]),
            'popular': len([a for a in all_anime if 'popular' in a.get('categories', [])]),
            'upcoming': len([a for a in all_anime if 'upcoming' in a.get('categories', [])]),
            'movies': len([a for a in all_anime if 'movies' in a.get('categories', [])])
        },
        'anime': all_anime
    }
    
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    file_size = os.path.getsize(OUTPUT_PATH)
    print(f'\n{"=" * 60}')
    print(f'[DONE] Saved {len(all_anime)} anime to anime-static.json')
    print(f'   File size: {file_size / 1024:.1f} KB')
    print(f'   Categories: {output["categories"]}')
    print(f'   Updated: {now_utc}')
    print(f'{"=" * 60}')
    
    return len(all_anime)


if __name__ == '__main__':
    count = run()
    if count == 0:
        print('\n[!] WARNING: No anime fetched! Check Jikan API status.')
        sys.exit(1)
