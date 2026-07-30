"""
fetch_anime.py — AniTube Buzz Anime Data Fetcher (Multi-Source)
Tries Jikan → AniList → Kitsu (whichever works)
Never fails the workflow — always writes valid JSON
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
ANILIST_URL = 'https://graphql.anilist.co'
KITSU_BASE = 'https://kitsu.io/api/edge'

REQUEST_DELAY = 2.0
MAX_RETRIES = 3
TIMEOUT = 20
USER_AGENT = 'AniTubeBuzz/1.0 (GitHub Auto-Publisher)'


# ═══════════════════════════════════════════
# HTTP HELPER
# ═══════════════════════════════════════════
def http_get(url, headers=None, retries=MAX_RETRIES, delay=REQUEST_DELAY):
    """GET request with retry"""
    hdrs = {'User-Agent': USER_AGENT, 'Accept': 'application/json'}
    if headers:
        hdrs.update(headers)
    
    for attempt in range(1, retries + 1):
        try:
            req = Request(url, headers=hdrs)
            with urlopen(req, timeout=TIMEOUT) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                time.sleep(delay)
                return data
        except HTTPError as e:
            if e.code == 429:
                wait = 5 * attempt
                print(f'    [!] Rate limited (429), waiting {wait}s...')
                time.sleep(wait)
            elif e.code == 404:
                return None
            elif e.code >= 500:
                print(f'    [!] Server {e.code}, retry {attempt}/{retries}')
                time.sleep(3 * attempt)
            else:
                print(f'    [!] HTTP {e.code}')
                time.sleep(2)
        except Exception as e:
            print(f'    [!] Error: {str(e)[:80]}')
            time.sleep(2 * attempt)
    return None


def http_post(url, body, headers=None, retries=MAX_RETRIES):
    """POST request (for GraphQL)"""
    hdrs = {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
    if headers:
        hdrs.update(headers)
    
    body_bytes = json.dumps(body).encode('utf-8')
    
    for attempt in range(1, retries + 1):
        try:
            req = Request(url, data=body_bytes, headers=hdrs, method='POST')
            with urlopen(req, timeout=TIMEOUT) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                time.sleep(REQUEST_DELAY)
                return data
        except HTTPError as e:
            if e.code == 429:
                time.sleep(5 * attempt)
            elif e.code >= 500:
                print(f'    [!] Server {e.code}, retry {attempt}/{retries}')
                time.sleep(3 * attempt)
            else:
                return None
        except Exception as e:
            print(f'    [!] Error: {str(e)[:80]}')
            time.sleep(2 * attempt)
    return None


# ═══════════════════════════════════════════
# JIKAN (MyAnimeList)
# ═══════════════════════════════════════════
def normalize_jikan(item):
    title = item.get('title_english') or item.get('title') or item.get('title_japanese') or 'Unknown'
    slug = title.lower()
    for ch in [':', "'", '"', '!', '?', ',', '.', '(', ')', '[', ']', '/', '\\', '&', '+', '=', '@', '#']:
        slug = slug.replace(ch, '')
    slug = slug.replace(' ', '-').replace('--', '-').strip('-')[:80]
    
    images = item.get('images', {})
    image = (images.get('jpg', {}).get('large_image_url') or 
             images.get('jpg', {}).get('image_url') or 
             images.get('webp', {}).get('large_image_url') or '')
    
    score = None
    if item.get('score'):
        try: score = round(float(item['score']), 1)
        except: pass
    
    raw_status = (item.get('status') or '').lower()
    status = 'current' if 'airing' in raw_status else 'finished' if 'finished' in raw_status else 'upcoming' if 'not yet' in raw_status else 'unknown'
    
    year = item.get('year')
    if not year and item.get('aired', {}).get('from'):
        try: year = int(item['aired']['from'][:4])
        except: pass
    
    genres = [g.get('name', '') for g in (item.get('genres') or []) if g.get('name')]
    themes = [t.get('name', '') for t in (item.get('themes') or []) if t.get('name')]
    all_genres = (genres + themes)[:5]
    studios = [s.get('name', '') for s in (item.get('studios') or []) if s.get('name')][:3]
    
    return {
        'id': str(item.get('mal_id', '')),
        'title': title,
        'title_japanese': item.get('title_japanese', ''),
        'image': image,
        'score': score,
        'episodes': item.get('episodes') or 0,
        'status': status,
        'synopsis': (item.get('synopsis') or '')[:500],
        'genres': all_genres,
        'year': year,
        'slug': slug,
        'type': item.get('type', 'TV'),
        'rating': item.get('rating', ''),
        'studios': studios,
        'members': item.get('members', 0),
        'rank': item.get('rank'),
        'start_date': item.get('aired', {}).get('from', ''),
        'end_date': item.get('aired', {}).get('to', ''),
    }


def fetch_from_jikan():
    """Try Jikan API"""
    print('\n[SOURCE 1] Trying Jikan (MyAnimeList)...')
    endpoints = [
        ('/seasons/now?limit=25&sfw=true', 'airing'),
        ('/top/anime?limit=25&sfw=true', 'top'),
        ('/top/anime?limit=25&sfw=true&filter=bypopularity', 'popular'),
        ('/top/anime?limit=25&sfw=true&filter=upcoming', 'upcoming'),
        ('/top/anime?limit=25&sfw=true&type=movie', 'movies'),
    ]
    
    all_anime = []
    seen = {}
    
    for endpoint, cat in endpoints:
        print(f'  Fetching {cat}...')
        data = http_get(f'{JIKAN_BASE}{endpoint}')
        if not data or not data.get('data'):
            print(f'    [!] {cat} failed')
            continue
        
        for item in data['data']:
            anime = normalize_jikan(item)
            if anime['id'] and anime['title'] != 'Unknown':
                aid = anime['id']
                if aid in seen:
                    if cat not in seen[aid]['categories']:
                        seen[aid]['categories'].append(cat)
                else:
                    anime['categories'] = [cat]
                    seen[aid] = anime
                    all_anime.append(anime)
        
        print(f'    [OK] Got {len(data["data"])} from {cat}')
        time.sleep(3)
    
    return all_anime


# ═══════════════════════════════════════════
# ANILIST (GraphQL Backup)
# ═══════════════════════════════════════════
def normalize_anilist(item, category='airing'):
    title_obj = item.get('title', {})
    title = title_obj.get('english') or title_obj.get('romaji') or title_obj.get('native') or 'Unknown'
    
    slug = title.lower()
    for ch in [':', "'", '"', '!', '?', ',', '.', '(', ')', '[', ']', '/', '\\', '&', '+', '=', '@', '#']:
        slug = slug.replace(ch, '')
    slug = slug.replace(' ', '-').replace('--', '-').strip('-')[:80]
    
    image = item.get('coverImage', {}).get('extraLarge') or item.get('coverImage', {}).get('large') or ''
    
    score = None
    if item.get('averageScore'):
        try: score = round(item['averageScore'] / 10, 1)
        except: pass
    
    raw_status = (item.get('status') or '').lower()
    status = 'current' if raw_status == 'releasing' else 'finished' if raw_status == 'finished' else 'upcoming' if raw_status == 'not_yet_released' else 'unknown'
    
    start_date_obj = item.get('startDate', {}) or {}
    start_date = ''
    if start_date_obj.get('year'):
        y = start_date_obj.get('year')
        m = start_date_obj.get('month', 1) or 1
        d = start_date_obj.get('day', 1) or 1
        start_date = f'{y:04d}-{m:02d}-{d:02d}T00:00:00+00:00'
    
    end_date_obj = item.get('endDate', {}) or {}
    end_date = ''
    if end_date_obj.get('year'):
        y = end_date_obj.get('year')
        m = end_date_obj.get('month', 1) or 1
        d = end_date_obj.get('day', 1) or 1
        end_date = f'{y:04d}-{m:02d}-{d:02d}T00:00:00+00:00'
    
    genres = (item.get('genres') or [])[:5]
    studios = []
    if item.get('studios', {}).get('nodes'):
        studios = [s.get('name', '') for s in item['studios']['nodes'][:3] if s.get('name')]
    
    format_type = item.get('format', 'TV')
    format_map = {'TV': 'TV', 'MOVIE': 'Movie', 'OVA': 'OVA', 'ONA': 'ONA', 'SPECIAL': 'Special', 'TV_SHORT': 'TV'}
    
    return {
        'id': str(item.get('id', '')),
        'title': title,
        'title_japanese': title_obj.get('native', ''),
        'image': image,
        'score': score,
        'episodes': item.get('episodes') or 0,
        'status': status,
        'synopsis': (item.get('description') or '').replace('<br>', ' ').replace('<i>', '').replace('</i>', '')[:500],
        'genres': genres,
        'year': item.get('seasonYear') or (start_date_obj.get('year') if start_date_obj else None),
        'slug': slug,
        'type': format_map.get(format_type, 'TV'),
        'rating': '',
        'studios': studios,
        'members': item.get('popularity', 0),
        'rank': None,
        'start_date': start_date,
        'end_date': end_date,
    }


def fetch_from_anilist():
    """Try AniList GraphQL API"""
    print('\n[SOURCE 2] Trying AniList (GraphQL)...')
    
    query = """
    query ($sort: [MediaSort], $status: MediaStatus, $format: MediaFormat, $page: Int) {
      Page(page: $page, perPage: 50) {
        media(type: ANIME, sort: $sort, status: $status, format: $format, isAdult: false) {
          id
          title { english romaji native }
          coverImage { extraLarge large }
          averageScore
          episodes
          status
          description(asHtml: false)
          genres
          seasonYear
          format
          popularity
          startDate { year month day }
          endDate { year month day }
          studios { nodes { name } }
        }
      }
    }
    """
    
    categories = [
        ({'sort': ['START_DATE_DESC'], 'status': 'RELEASING', 'page': 1}, 'airing'),
        ({'sort': ['SCORE_DESC'], 'page': 1}, 'top'),
        ({'sort': ['POPULARITY_DESC'], 'page': 1}, 'popular'),
        ({'sort': ['POPULARITY_DESC'], 'status': 'NOT_YET_RELEASED', 'page': 1}, 'upcoming'),
        ({'sort': ['POPULARITY_DESC'], 'format': 'MOVIE', 'page': 1}, 'movies'),
    ]
    
    all_anime = []
    seen = {}
    
    for variables, cat in categories:
        print(f'  Fetching {cat}...')
        data = http_post(ANILIST_URL, {'query': query, 'variables': variables})
        
        if not data or not data.get('data') or not data['data'].get('Page'):
            print(f'    [!] {cat} failed')
            continue
        
        media = data['data']['Page'].get('media', [])
        for item in media:
            anime = normalize_anilist(item, cat)
            if anime['id'] and anime['title'] != 'Unknown':
                aid = anime['id']
                if aid in seen:
                    if cat not in seen[aid]['categories']:
                        seen[aid]['categories'].append(cat)
                else:
                    anime['categories'] = [cat]
                    seen[aid] = anime
                    all_anime.append(anime)
        
        print(f'    [OK] Got {len(media)} from {cat}')
        time.sleep(2)
    
    return all_anime


# ═══════════════════════════════════════════
# KITSU (Second Backup)
# ═══════════════════════════════════════════
def normalize_kitsu(item):
    a = item.get('attributes', {})
    title = a.get('canonicalTitle') or a.get('titles', {}).get('en') or a.get('titles', {}).get('en_jp') or 'Unknown'
    
    slug = title.lower()
    for ch in [':', "'", '"', '!', '?', ',', '.', '(', ')', '[', ']', '/', '\\', '&', '+', '=', '@', '#']:
        slug = slug.replace(ch, '')
    slug = slug.replace(' ', '-').replace('--', '-').strip('-')[:80]
    
    poster = a.get('posterImage', {}) or {}
    image = poster.get('large') or poster.get('medium') or poster.get('original') or ''
    
    score = None
    if a.get('averageRating'):
        try: score = round(float(a['averageRating']) / 10, 1)
        except: pass
    
    status = a.get('status', 'unknown').lower()
    if status == 'current': status = 'current'
    elif status == 'finished': status = 'finished'
    elif status == 'upcoming': status = 'upcoming'
    
    year = None
    start = a.get('startDate') or ''
    if start:
        try: year = int(start[:4])
        except: pass
    
    return {
        'id': str(item.get('id', '')),
        'title': title,
        'title_japanese': a.get('titles', {}).get('ja_jp', '') or a.get('titles', {}).get('en_jp', ''),
        'image': image,
        'score': score,
        'episodes': a.get('episodeCount') or 0,
        'status': status,
        'synopsis': (a.get('synopsis') or '')[:500],
        'genres': [],
        'year': year,
        'slug': slug,
        'type': (a.get('subtype') or 'TV').capitalize(),
        'rating': a.get('ageRating', ''),
        'studios': [],
        'members': a.get('userCount', 0),
        'rank': None,
        'start_date': start,
        'end_date': a.get('endDate', '') or '',
    }


def fetch_from_kitsu():
    """Try Kitsu API"""
    print('\n[SOURCE 3] Trying Kitsu...')
    
    categories = [
        ('filter[status]=current&sort=-startDate&page[limit]=25', 'airing'),
        ('sort=-averageRating&page[limit]=25', 'top'),
        ('sort=-userCount&page[limit]=25', 'popular'),
        ('filter[status]=upcoming&sort=startDate&page[limit]=25', 'upcoming'),
        ('filter[subtype]=movie&sort=-userCount&page[limit]=25', 'movies'),
    ]
    
    all_anime = []
    seen = {}
    
    for params, cat in categories:
        print(f'  Fetching {cat}...')
        url = f'{KITSU_BASE}/anime?{params}&fields[anime]=canonicalTitle,titles,posterImage,averageRating,episodeCount,status,synopsis,startDate,endDate,subtype,ageRating,userCount'
        data = http_get(url, headers={'Accept': 'application/vnd.api+json'})
        
        if not data or not data.get('data'):
            print(f'    [!] {cat} failed')
            continue
        
        for item in data['data']:
            anime = normalize_kitsu(item)
            if anime['id'] and anime['title'] != 'Unknown':
                aid = anime['id']
                if aid in seen:
                    if cat not in seen[aid]['categories']:
                        seen[aid]['categories'].append(cat)
                else:
                    anime['categories'] = [cat]
                    seen[aid] = anime
                    all_anime.append(anime)
        
        print(f'    [OK] Got {len(data["data"])} from {cat}')
        time.sleep(2)
    
    return all_anime


# ═══════════════════════════════════════════
# LOAD EXISTING (fallback preservation)
# ═══════════════════════════════════════════
def load_existing():
    try:
        if os.path.exists(OUTPUT_PATH):
            with open(OUTPUT_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('anime', []), data.get('updated', '')
    except Exception as e:
        print(f'  [!] Could not load existing: {e}')
    return [], ''


# ═══════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════
def run():
    print('=' * 60)
    print('AniTube Buzz — Multi-Source Anime Fetcher')
    print(f'Time: {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")}')
    print('=' * 60)
    
    all_anime = []
    source_used = 'none'
    
    # Try sources in order
    sources = [
        ('jikan', fetch_from_jikan),
        ('anilist', fetch_from_anilist),
        ('kitsu', fetch_from_kitsu),
    ]
    
    for source_name, fetch_fn in sources:
        try:
            result = fetch_fn()
            if result and len(result) >= 10:
                all_anime = result
                source_used = source_name
                print(f'\n[SUCCESS] Got {len(result)} anime from {source_name}')
                break
            else:
                print(f'\n[!] {source_name} returned only {len(result) if result else 0} anime, trying next source...')
        except Exception as e:
            print(f'\n[!] {source_name} error: {e}')
            continue
    
    # If ALL sources failed, keep existing data
    existing, existing_updated = load_existing()
    
    if len(all_anime) < 10:
        print(f'\n[!] All sources failed! Keeping existing {len(existing)} anime.')
        if len(existing) > 0:
            print(f'    Previous update: {existing_updated}')
            print('    Site will continue working with existing data.')
            # Return existing count — DON'T fail workflow
            return len(existing)
        else:
            # No existing data either — write empty but don't crash
            print('    No existing data either. Writing minimal placeholder.')
            output = {
                'updated': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                'total': 0,
                'source': 'none',
                'error': 'All external APIs temporarily unavailable',
                'categories': {'airing': 0, 'top': 0, 'popular': 0, 'upcoming': 0, 'movies': 0},
                'anime': []
            }
            os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
            with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
                json.dump(output, f, ensure_ascii=False, indent=2)
            return 0
    
    # Merge with existing (preserve older anime)
    new_ids = {a['id'] for a in all_anime}
    for ex in existing:
        if ex.get('id') and ex['id'] not in new_ids:
            if 'categories' not in ex:
                ex['categories'] = ['archive']
            all_anime.append(ex)
    
    # Sort: newest airing first
    def sort_key(a):
        cats = a.get('categories', [])
        priority_map = {'airing': 0, 'top': 1, 'popular': 2, 'upcoming': 3, 'movies': 4, 'archive': 5}
        best = min([priority_map.get(c, 6) for c in cats]) if cats else 6
        start = a.get('start_date', '') or ''
        members = a.get('members', 0) or 0
        return (best, -len(start), -members)
    
    all_anime.sort(key=sort_key)
    
    now_utc = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    output = {
        'updated': now_utc,
        'total': len(all_anime),
        'source': source_used,
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
    
    size = os.path.getsize(OUTPUT_PATH) / 1024
    print(f'\n{"=" * 60}')
    print(f'[DONE] Saved {len(all_anime)} anime')
    print(f'  Source: {source_used}')
    print(f'  Size: {size:.1f} KB')
    print(f'  Categories: {output["categories"]}')
    print(f'{"=" * 60}')
    
    return len(all_anime)


if __name__ == '__main__':
    try:
        count = run()
        # NEVER fail workflow — even if count is 0
        print(f'\n[EXIT] Success — {count} total anime')
        sys.exit(0)
    except Exception as e:
        print(f'\n[FATAL] {e}')
        import traceback
        traceback.print_exc()
        # Still exit 0 — don't fail workflow
        sys.exit(0)
