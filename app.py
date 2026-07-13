import os
import pickle
import difflib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache
 
from requests import Session
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
 
load_dotenv()
 
# ── App & Config ─────────────────────────────────────────────
app = Flask(__name__)
 
ARTIFACTS_DIR = Path(__file__).parent / "artifacts"
TMDB_API_KEY  = os.getenv("TMDB_API_KEY")
TMDB_BASE     = "https://api.themoviedb.org/3"
POSTER_BASE   = "https://image.tmdb.org/t/p/w342"
 
# Reusable HTTP session — faster than requests.get()
tmdb_session = Session()
tmdb_session.headers.update({"Accept": "application/json"})
 
# ── Load model artifacts once at startup ─────────────────────
with open(ARTIFACTS_DIR / "movies.pkl", "rb") as f:
    movies = pickle.load(f)
 
with open(ARTIFACTS_DIR / "similarity.pkl", "rb") as f:
    similarity = pickle.load(f)
 
# Pre-built for fast title lookups
_titles       = movies["title"].tolist()
_titles_lower = [t.lower() for t in _titles]
 
print(f"✅ Loaded {len(movies)} movies.")
 
# ── Core Functions ───────────────────────────────────────────
 
def resolve_title(query: str):
    """Exact match → fuzzy fallback. Returns None if no match."""
    q = query.lower().strip()
    if q in _titles_lower:
        return _titles[_titles_lower.index(q)]
    matches = difflib.get_close_matches(query, _titles, n=1, cutoff=0.4)
    return matches[0] if matches else None
 
 
def get_recommendations(title: str, n: int = 5) -> list:
    """Return top-N movies by cosine similarity score."""
    idx       = movies[movies["title"] == title].index[0]
    distances = sorted(enumerate(similarity[idx]), key=lambda x: x[1], reverse=True)
    return [
        {
            "movie_id": int(movies.iloc[i]["movie_id"]),
            "title":    movies.iloc[i]["title"],
            "score":    round(float(score), 3),
        }
        for i, score in distances[1 : n + 1]
    ]
 
 
@lru_cache(maxsize=5000)
def fetch_tmdb(movie_id: int) -> dict:
    """Fetch poster, rating, overview from TMDB. Cached after first call."""
    empty = {"poster_url": "", "rating": 0, "overview": ""}
    if not TMDB_API_KEY:
        return empty
    try:
        resp = tmdb_session.get(
            f"{TMDB_BASE}/movie/{movie_id}",
            params={"api_key": TMDB_API_KEY},
            timeout=4,
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "poster_url": f"{POSTER_BASE}{data['poster_path']}" if data.get("poster_path") else "",
            "rating":     round(data.get("vote_average", 0), 1),
            "overview":   (data.get("overview") or "")[:180],
        }
    except Exception:
        return empty
 
 
def enrich_parallel(recommendations: list) -> list:
    """Fetch TMDB data for all 5 movies simultaneously."""
    enriched = list(recommendations)
    with ThreadPoolExecutor(max_workers=5) as executor:
        future_to_idx = {
            executor.submit(fetch_tmdb, rec["movie_id"]): i
            for i, rec in enumerate(enriched)
        }
        for future in as_completed(future_to_idx):
            i = future_to_idx[future]
            try:
                enriched[i].update(future.result(timeout=4))
            except Exception:
                enriched[i].update({"poster_url": "", "rating": 0, "overview": ""})
    return enriched
 
 
# ── Routes ───────────────────────────────────────────────────
 
@app.route("/")
def index():
    return render_template("index.html", titles=sorted(_titles))
 
 
@app.route("/recommend")
def recommend_route():
    query    = request.args.get("movie", "").strip()
    resolved = resolve_title(query) if query else None
 
    if not query or not resolved:
        error = "Please enter a movie name." if not query else f'No match found for "{query}".'
        return render_template("index.html", titles=sorted(_titles), error=error)
 
    return render_template("loading.html", query=resolved)
 
 
@app.route("/recommend-data")
def recommend_data():
    query    = request.args.get("movie", "").strip()
    resolved = resolve_title(query) if query else None
 
    if not resolved:
        return jsonify(error="Movie not found."), 404
 
    return jsonify(
        query=resolved,
        recommendations=enrich_parallel(get_recommendations(resolved))
    )
 
 
@app.route("/search-suggest")
def search_suggest():
    q = request.args.get("q", "").strip().lower()
    if len(q) < 2:
        return jsonify(suggestions=[])
    return jsonify(suggestions=[t for t in _titles if q in t.lower()][:8])
 
 
# ── Run ──────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(debug=True)