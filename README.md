<div align="center">
🎬 CineMatch

A content-based movie recommendation engine built from scratch
</div>

What is this?

Most recommendation tutorials just call a pre-built API and stop there.

I wanted to understand what actually happens inside — how a system decides that if you liked Inception, you might like Interstellar. So I built one from scratch using nothing but movie metadata and math.

CineMatch takes any movie name, finds the five most similar films using cosine similarity, and displays them with posters and ratings fetched live from the TMDB API.


How the recommendation engine works

This is a content-based filtering system. It recommends movies based on what a movie is — its genre, cast, director, and plot — rather than what other users watched.


Step 1 — Data Collection

I used the TMDB 5000 Movies dataset from Kaggle which contains metadata for ~4,800 movies including overview, genres, keywords, cast, and crew.

The raw data came in JSON-like strings inside CSV columns. For example, the genres column looked like this:

[{"id": 28, "name": "Action"}, {"id": 12, "name": "Adventure"}]

I parsed these using ast.literal_eval and extracted just the names.


Step 2 — Feature Engineering


Why this step matters: The quality of recommendations depends entirely on what features you feed into the model. Garbage in, garbage out.



Instead of using the columns separately, I combined five features into a single tags column per movie:

FeatureWhat it capturesExample (Avatar)OverviewThe plot"in the 22nd century a paraplegic marine..."GenresCategory of filmaction adventure fantasy sciencefictionKeywordsSpecific themescultureclash future spacecolonyTop 3 CastWho acts in itSamWorthington ZoeSaldana SigourneyWeaverDirectorWho made itJamesCameron

Important detail: I merged multi-word names into single tokens — James Cameron becomes JamesCameron. This prevents the model from treating "James" and "Cameron" as separate unrelated words, which would dilute the signal.


Step 3 — Text Vectorization


What is vectorization? Computers can't compare text directly. We convert each movie's tags into a list of numbers (a vector) that represents which words appear and how often.



I used CountVectorizer from Scikit-learn with a vocabulary of 5,000 words. Each movie becomes a 5,000-dimensional vector where each position represents a word's frequency.

Before vectorizing, I applied Porter Stemming to normalize words:

loving  →  love
running →  run
acted   →  act

This ensures "action" and "actions" are treated as the same word, reducing noise in the vectors.


Step 4 — Cosine Similarity


What is cosine similarity? It measures the angle between two vectors rather than the distance between them. Two movies that use the same vocabulary will point in a similar direction — regardless of how long their descriptions are.



Formula:

similarity = (A · B) / (||A|| × ||B||)

Where A and B are two movie vectors. The result is always between 0 and 1. Higher means more similar.

After vectorizing all 4,807 movies, I computed cosine similarity between every pair of movies. This produced a 4,807 × 4,807 matrix where each cell holds the similarity score between two films.

This matrix is computed once during training and saved as similarity.pkl. At runtime, recommendations are just a lookup + sort — returned in under 10ms.


Step 5 — Serving Recommendations

When a user searches for a movie, here is exactly what happens:

1. User types "Inception"
         ↓
2. Flask receives the request
   → Fuzzy matches "Inception" to the dataset title
   → Instantly returns the loading page (no waiting)
         ↓
3. Browser's JavaScript calls /recommend-data
         ↓
4. Flask looks up Inception's row in the similarity matrix
   → Sorts 4,807 scores from highest to lowest
   → Returns top 5 (skipping index 0 which is the movie itself)
         ↓
5. Flask fires 5 TMDB API calls in parallel (ThreadPoolExecutor)
   → Fetches poster, rating, overview for each film simultaneously
   → Total wait = slowest single call, not sum of all 5
         ↓
6. JSON response sent to browser
   → Cards render with staggered animation
   → Similarity bars animate in


Why a loading screen instead of waiting?

This is a deliberate UX decision worth explaining.

If Flask did everything before responding, the user would stare at a blank white page for 1-3 seconds while TMDB calls complete. Instead, Flask returns the loading page instantly (under 5ms). JavaScript then fetches the actual data in the background. The user sees a cinematic loading screen rather than a frozen browser.

This pattern is called optimistic UI — show something immediately, load the real content asynchronously.


Tech Stack

LayerTechnologyWhy I chose itData & MLPython, Pandas, Scikit-learn, NLTKIndustry standard for ML pipelinesBackendFlaskLightweight, perfect for serving a single ML modelPoster DataTMDB APIFree, reliable, comprehensive movie databaseFrontendHTML, CSS, Vanilla JSNo framework overhead needed for this scopeDeploymentRenderFree tier supports Python, easy GitHub integration


Project Structure

Movies-Recommendation-System/
├── notebooks/
│   ├── 01_eda_cleaning.ipynb              # Data exploration and cleaning
│   └── 02_feature_engineering_and_model.ipynb  # Model building
│
├── data/
│   ├── raw/                               # Original TMDB CSV files
│   └── processed/                         # Cleaned data
│
├── artifacts/
│   ├── movies.pkl                         # Processed movie dataframe
│   └── similarity.pkl                     # Precomputed 4807×4807 matrix
│
├── templates/
│   ├── index.html                         # Search page
│   └── loading.html                       # Results page with loader
│
├── static/
│   ├── css/style.css                      # Global styles
│   ├── css/loading.css                    # Results page styles
│   └── js/loading.js                      # Async fetch + card rendering
│
├── app.py                                 # Flask application
├── .env.example                           # API key template
└── requirements.txt


Running Locally

bash# 1. Clone the repo
git clone https://github.com/Gutsmaster/Movies-Recommendation-System
cd Movies-Recommendation-System

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Add your TMDB API key
cp .env.example .env
# Edit .env → TMDB_API_KEY=your_key_here
# Get a free key at https://www.themoviedb.org/settings/api

# 5. Generate model artifacts
# Run notebooks in order:
# → notebooks/01_eda_cleaning.ipynb
# → notebooks/02_feature_engineering_and_model.ipynb
# This creates artifacts/movies.pkl and artifacts/similarity.pkl

# 6. Start the server
python app.py
# Open http://localhost:5000


API Endpoints

EndpointMethodWhat it does/GETReturns the search page/recommend?movie=InceptionGETValidates title, returns loading page instantly/recommend-data?movie=InceptionGETRuns ML lookup + TMDB fetch, returns JSON/search-suggest?q=incGETReturns up to 8 autocomplete suggestions


Why content-based and not collaborative filtering?

Collaborative filtering works by finding patterns across users — "people who liked X also liked Y." It needs user interaction data: ratings, watch history, clicks.

The TMDB dataset has none of that. It only has movie metadata.

Content-based filtering doesn't need users at all. It recommends movies based on the movie's own attributes — genre, cast, director, and plot. That made it the only viable approach for this dataset.

The tradeoff is that content-based systems can't discover surprising recommendations. If you search for a comedy, you'll only get comedies. Collaborative filtering can surface unexpected matches because it learns from human taste patterns.

A production system like Netflix uses both together — a hybrid approach.


Limitations I'm aware of

These aren't excuses — they're genuine engineering tradeoffs I made given the scope and dataset:


~5,000 movies only — a larger dataset would dramatically improve coverage and recommendation diversity
No personalization — every user gets the same result for the same query. There's no concept of individual taste
Bag-of-words loses meaning — CountVectorizer treats "not funny" and "funny" as almost identical. Sentence Transformers would capture semantic meaning far better
Mismatched TMDB IDs — some older movies in the Kaggle dataset have IDs that don't match the current TMDB API, causing missing posters
No real-time data — the model is static. New movies released after the dataset was collected won't appear



What I'd build next


Sentence Transformers instead of CountVectorizer for semantic similarity
Hybrid model combining content-based filtering with popularity weighting
Redis for persistent TMDB caching instead of in-memory lru_cache (survives restarts)
User accounts and watch history for personalized recommendations
Docker for consistent deployment across environments
Better ID mapping using TMDB's search API to fix mismatched movie IDs



What I learned building this

Before this project I knew what "cosine similarity" meant in theory. Now I understand why the feature engineering step matters more than the algorithm itself — changing what goes into the vectors changed recommendation quality far more than tuning any model parameter.

I also learned that building the ML model is only half the work. Making it fast enough for a web app, handling edge cases, designing the UX, and deploying it are equally important parts of the job.


Dataset


TMDB 5000 Movies Dataset — Kaggle
Posters and ratings via The Movie Database API


This product uses the TMDB API but is not endorsed or certified by TMDB.


<div align="center">
Built by Roshan Kumar · GitHub

</div>