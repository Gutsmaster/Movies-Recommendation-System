/* ═══════════════════════════════════════════════════════════════
   CineMatch — Loading Page Logic
   - Fetches /recommend-data once
   - Uses poster_url directly from JSON (no separate poster calls)
   - Loading screen dismisses as soon as backend responds
   - No artificial delays
═══════════════════════════════════════════════════════════════ */

const QUERY = window.CINEMATCH_QUERY;

// ── DOM refs (cached once) ───────────────────────────────────
const DOM = {
  loader:      document.getElementById('cinematic-loader'),
  funText:     document.getElementById('fun-text'),
  progressFill:document.getElementById('progress-fill'),
  resultsHero: document.getElementById('results-hero'),
  simSection:  document.getElementById('sim-section'),
  simBars:     document.getElementById('sim-bars'),
  resultsGrid: document.getElementById('results-grid'),
  searchAgain: document.getElementById('search-again'),
  errorState:  document.getElementById('error-state'),
};

// ── Fun text lines ───────────────────────────────────────────
const FUN_LINES = [
  '🍿 Grab your popcorn…',
  '🎬 Rolling the film reel…',
  '🧠 Crunching 5,000 movies…',
  '🎭 Matching genres & vibes…',
  '🌙 Almost there, sit tight…',
  '✨ Your picks are nearly ready…',
  '🎥 Lights, camera, almost!',
  '🍕 Go grab a snack — we got this…',
];

let lineIdx = 0;

// Cycle fun text with fade in/out
function cycleText() {
  DOM.funText.classList.add('exit');
  setTimeout(() => {
    lineIdx = (lineIdx + 1) % FUN_LINES.length;
    DOM.funText.textContent = FUN_LINES[lineIdx];
    DOM.funText.classList.remove('exit');
    // Re-trigger CSS animation
    DOM.funText.style.animation = 'none';
    DOM.funText.offsetHeight; // force reflow
    DOM.funText.style.animation = '';
  }, 300);
}

// Animate progress bar up to ~85% while waiting for response
function startProgress() {
  let pct = 0;
  return setInterval(() => {
    pct = Math.min(pct + Math.random() * 10, 85);
    DOM.progressFill.style.width = `${pct}%`;
  }, 350);
}

// Dismiss loader as soon as data is ready
function dismissLoader() {
  DOM.progressFill.style.width = '100%';
  DOM.loader.classList.add('hide');
  // Remove from flow after transition ends
  DOM.loader.addEventListener('transitionend', () => {
    DOM.loader.style.display = 'none';
  }, { once: true });
}

// ── Build similarity bars ────────────────────────────────────
function buildSimBars(recs) {
  DOM.simBars.innerHTML = recs.map(r => {
    const pct = (r.score * 100).toFixed(1);
    return `
      <div class="sim-row">
        <div class="sim-row-title">${r.title}</div>
        <div class="sim-track">
          <div class="sim-fill" data-pct="${pct}"></div>
        </div>
        <div class="sim-pct">${pct}%</div>
      </div>`;
  }).join('');
}

// Trigger bar animations (called after section is visible)
function animateSimBars() {
  DOM.simBars.querySelectorAll('.sim-fill').forEach(el => {
    el.style.width = `${el.dataset.pct}%`;
  });
}

// ── Build a single card HTML string ─────────────────────────
function buildCard(rec, rank) {
  const pct     = (rec.score * 100).toFixed(1);
  const rating  = rec.rating > 0 ? `<div class="rating-badge">⭐ ${rec.rating}</div>` : '';
  const overview = rec.overview
    ? `<p class="card-overview">${rec.overview}…</p>`
    : '';

  // poster_url comes directly from /recommend-data — no extra fetch needed
  const posterContent = rec.poster_url
    ? `<img class="poster-img" src="${rec.poster_url}"
          alt="${rec.title} poster"
          loading="lazy"
          onload="this.classList.add('loaded'); this.previousElementSibling.classList.add('hidden')"
          onerror="this.style.display='none'; this.previousElementSibling.classList.add('hidden'); this.nextElementSibling.classList.add('show')" />`
    : '';

  return `
    <div class="movie-card">
      <div class="poster-wrap">
        <div class="poster-skeleton"></div>
        ${posterContent}
        <div class="poster-fallback">
          <span class="icon">🎬</span>
          <span>No poster</span>
        </div>
        <div class="rank-badge">${rank}</div>
        ${rating}
      </div>
      <div class="card-body">
        <div class="card-title">${rec.title}</div>
        ${overview}
        <div class="card-meta">
          <div class="card-score">Match: <span>${pct}%</span></div>
        </div>
      </div>
    </div>`;
}

// ── Show results ─────────────────────────────────────────────
function showResults(recs) {
  // Build DOM
  buildSimBars(recs);
  DOM.resultsGrid.innerHTML = recs.map((r, i) => buildCard(r, i + 1)).join('');

  // Dismiss loader — happens immediately when backend responds
  dismissLoader();

  // Reveal content
  DOM.resultsHero.classList.remove('hidden');
  DOM.simSection.classList.remove('hidden');
  DOM.resultsGrid.classList.remove('hidden');
  DOM.searchAgain.classList.remove('hidden');

  // Animate sim bars after a short paint delay
  requestAnimationFrame(() => {
    requestAnimationFrame(animateSimBars);
  });
}

// ── Show error ───────────────────────────────────────────────
function showError() {
  dismissLoader();
  DOM.errorState.classList.remove('hidden');
}

// ── Main ─────────────────────────────────────────────────────
(async function init() {
  const textTimer     = setInterval(cycleText, 2000);
  const progressTimer = startProgress();

  try {
    const res  = await fetch(`/recommend-data?movie=${encodeURIComponent(QUERY)}`);
    const data = await res.json();

    clearInterval(textTimer);
    clearInterval(progressTimer);

    if (data.error || !data.recommendations) {
      showError();
      return;
    }

    showResults(data.recommendations);

  } catch {
    clearInterval(textTimer);
    clearInterval(progressTimer);
    showError();
  }
})();
