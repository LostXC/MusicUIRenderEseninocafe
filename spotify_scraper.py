import json
import re
import urllib.error
import urllib.parse
import urllib.request


# ---------------------------------------------------------------------------
# Public helper
# ---------------------------------------------------------------------------

def get_track_info(spotify_url: str) -> dict:
    """
    Fetch track metadata from a Spotify track URL without any API key.

    Strategy
    --------
    Spotify's embed player (open.spotify.com/embed/track/<id>) is a public
    widget intended for third-party sites. It embeds all track metadata as a
    URL-encoded JSON blob inside the page HTML – no token or OAuth required.

    Returns a dict with keys:
        title, artist, album, duration_ms, thumbnail_url

    Raises ValueError for bad input, urllib.error.URLError for network issues,
    and RuntimeError if the expected data can't be found in the page.
    """
    track_id = _extract_track_id(spotify_url)
    html     = _fetch_embed_html(track_id)
    track    = _parse_track_json(html)
    return _build_result(track)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _extract_track_id(url: str) -> str:
    """Pull the track ID out of any open.spotify.com/track/… URL."""
    match = re.search(r'track/([A-Za-z0-9]+)', url)
    if not match:
        raise ValueError(f"Could not find a track ID in URL: {url!r}")
    return match.group(1)


def _fetch_embed_html(track_id: str) -> str:
    """Download the Spotify embed page HTML for the given track ID."""
    embed_url = f"https://open.spotify.com/embed/track/{track_id}"
    headers = {
        # Spotify returns a proper page when it sees a real browser UA.
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
    }
    req = urllib.request.Request(embed_url, headers=headers)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.read().decode("utf-8")


def _parse_track_json(html: str) -> dict:
    """
    Spotify embeds metadata as a URL-encoded JSON string in a <script> tag.

    The page contains a block like:
        <script id="__NEXT_DATA__" type="application/json">{ … }</script>

    Inside that JSON the track lives at:
        props.pageProps.state.data.entity   (newer embed builds)
    or is available as a top-level "resource" field (older builds).

    We try the __NEXT_DATA__ route first (most reliable), then fall back to
    the legacy "resource" marker.
    """

    # ── Strategy 1: __NEXT_DATA__ JSON block ──────────────────────────────
    next_data_match = re.search(
        r'<script\s+id="__NEXT_DATA__"[^>]*>\s*(\{.*?\})\s*</script>',
        html,
        re.DOTALL,
    )
    if next_data_match:
        try:
            next_data = json.loads(next_data_match.group(1))
            # Path may vary slightly between Spotify embed versions
            entity = (
                next_data
                .get("props", {})
                .get("pageProps", {})
                .get("state", {})
                .get("data", {})
                .get("entity")
            )
            if entity and "name" in entity:
                return entity
        except (json.JSONDecodeError, AttributeError):
            pass  # fall through to strategy 2

    # ── Strategy 2: legacy URL-encoded "resource" field ───────────────────
    marker = '"resource":"'
    start = html.find(marker)
    if start != -1:
        start += len(marker)
        end = html.find('"', start)
        if end != -1:
            encoded = html[start:end]
            try:
                return json.loads(urllib.parse.unquote(encoded))
            except json.JSONDecodeError:
                pass

    raise RuntimeError(
        "Could not locate track metadata in the Spotify embed page. "
        "Spotify may have changed their embed structure."
    )


def _build_result(track: dict) -> dict:
    """Extract and normalise the fields we care about from the raw track dict."""
    title = track.get("name", "")

    # Artist: embed data exposes it as 'subtitle' or inside 'artists' list
    artist = track.get("subtitle", "")
    if not artist:
        artists = track.get("artists", [])
        if artists:
            artist = ", ".join(a.get("name", "") for a in artists if a.get("name"))

    # Album
    album = ""
    album_data = track.get("album", {})
    if isinstance(album_data, dict):
        album = album_data.get("name", "")

    # Duration: newer embeds use 'duration', older ones use 'duration_ms'
    duration_ms = track.get("duration_ms")
    if duration_ms is None:
        duration_ms = track.get("duration")
    duration_ms = int(duration_ms or 0)

    # Cover art – pick the largest available image
    thumbnail_url = None
    
    # 1. Try new visualIdentity.image array
    visual_identity = track.get("visualIdentity", {})
    if isinstance(visual_identity, dict) and "image" in visual_identity:
        images = visual_identity.get("image", [])
        if images:
            largest = max(images, key=lambda s: s.get("maxWidth", 0) or s.get("width", 0) or 0)
            thumbnail_url = largest.get("url")

    # 2. Fallback: coverArt object
    if not thumbnail_url:
        cover_art = track.get("coverArt", {})
        if isinstance(cover_art, dict):
            sources = cover_art.get("sources", [])
            if sources:
                largest = max(sources, key=lambda s: s.get("width", 0) or 0)
                thumbnail_url = largest.get("url")

    # 3. Fallback: album images array (older embed structure)
    if not thumbnail_url and isinstance(album_data, dict):
        images = album_data.get("images", [])
        if images:
            thumbnail_url = images[0].get("url")

    return {
        "title":        title,
        "artist":       artist,
        "album":        album,
        "duration_ms":  duration_ms,
        "thumbnail_url": thumbnail_url,
    }
