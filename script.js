// ── DATA ──
const articles = [
  { tag: "Strategy", title: "The Art of the Endgame: Rook & Pawn Mastery", excerpt: "Understanding why endgames are where true chess understanding is revealed — and how the world's best navigated them.", date: "May 2026", readTime: "8 min" },
  { tag: "History", title: "Fischer vs. Spassky: The Match That Stopped the World", excerpt: "A look back at the 1972 World Championship in Reykjavík — a Cold War showdown played on 64 squares.", date: "Apr 2026", readTime: "12 min" },
  { tag: "Opening Theory", title: "The Sicilian Dragon: Fire on the Board", excerpt: "One of chess's most double-edged openings — why the Dragon keeps burning generations of players.", date: "Mar 2026", readTime: "6 min" },
  { tag: "Psychology", title: "Tal's Mysticism: Sacrificing Logic for Chaos", excerpt: "How the Magician from Riga weaponised the irrational and made his opponents fear the board itself.", date: "Feb 2026", readTime: "10 min" },
  { tag: "Tactics", title: "Seven Immortal Combinations You Must Know", excerpt: "A curated tour of the most beautiful tactical sequences ever played — each one a lesson in disguise.", date: "Jan 2026", readTime: "15 min" },
  { tag: "Modern Chess", title: "AlphaZero & the Death of Opening Theory", excerpt: "What happens when an AI learns chess from scratch in four hours and then dismantles 200 years of theory?", date: "Dec 2025", readTime: "9 min" },
];

const players = [
  {
    name: "Garry Kasparov", country: "Russia", rating: "2851",
    bio: "Widely regarded as the greatest chess player of all time, Garry Kasparov dominated competitive chess for two decades. Born in Baku in 1963, he became World Champion at 22 — the youngest in history at the time — and held the title from 1985 to 2000. His deep preparation, fierce competitiveness, and profound understanding of dynamic positions set him apart from all contemporaries.",
    achievements: [
      { title: "World Chess Champion", year: "1985 – 2000" },
      { title: "Peak FIDE Rating 2851", year: "1999" },
      { title: "PCA World Championship", year: "1993 – 2000" },
      { title: "Chess Oscar (17 times)", year: "1982 – 1999" },
      { title: "USSR Champion", year: "1981, 1988" },
    ],
    career: "Kasparov's career began with his Soviet championship in 1981. He defeated Anatoly Karpov in a legendary series of five World Championship matches between 1984 and 1990. He famously lost a six-game match to IBM's Deep Blue in 1997 — the first time a computer defeated a reigning World Champion under standard time controls. He retired from professional chess in 2005.",
    bestGames: [
      { title: "The Immortal Game vs. Topalov", event: "Wijk aan Zee", year: "1999" },
      { title: "Kasparov vs. Karpov, Game 16", event: "WCC Match", year: "1985" },
      { title: "Kasparov vs. Short, Game 11", event: "PCA World Championship", year: "1993" },
    ]
  },
  {
    name: "Magnus Carlsen", country: "Norway", rating: "2830",
    bio: "Magnus Carlsen is a Norwegian chess grandmaster and the current highest-rated player in the world. Born in 1990, he became a grandmaster at 13 and rose to World #1 at 19. Known for his universal style, relentless endgame technique, and ability to generate winning chances from seemingly equal positions, Carlsen has redefined what modern elite chess looks like.",
    achievements: [
      { title: "FIDE World Chess Champion", year: "2013 – 2023" },
      { title: "Peak FIDE Rating 2882", year: "2014" },
      { title: "World Rapid Champion", year: "2014, 2015, 2019, 2022" },
      { title: "World Blitz Champion", year: "2009, 2014, 2017, 2018, 2019, 2022" },
      { title: "Grandmaster", year: "2004 (age 13)" },
    ],
    career: "Carlsen became World Champion in 2013, defeating Viswanathan Anand in Chennai. He successfully defended his title four more times before controversially declining to defend against Ding Liren in 2023. He remains the world's top-rated player and competes actively in rapid and blitz tournaments globally.",
    bestGames: [
      { title: "Carlsen vs. Karjakin, Game 10", event: "WCC Match", year: "2016" },
      { title: "Carlsen vs. Aronian", event: "Tata Steel Chess", year: "2013" },
      { title: "Carlsen vs. Anand, Game 5", event: "WCC Match", year: "2014" },
    ]
  },
  {
    name: "Bobby Fischer", country: "USA", rating: "2785",
    bio: "Robert James Fischer is an American chess legend and the 11th World Chess Champion. Born in Chicago in 1943, Fischer was a prodigy who became a grandmaster at 15. His extraordinary talent, relentless preparation, and demanding personality made him one of the most compelling and controversial figures in chess history.",
    achievements: [
      { title: "World Chess Champion", year: "1972 – 1975" },
      { title: "US Chess Champion (8 times)", year: "1957 – 1967" },
      { title: "Candidate for World Title", year: "1959, 1962, 1971" },
      { title: "Perfect Score, US Championship", year: "1963/64" },
    ],
    career: "Fischer's rise through the Candidates' Tournaments in 1971 was historic — he won 20 consecutive games. His 1972 match against Boris Spassky in Reykjavík was a global media event. After winning the title, Fischer refused to defend it in 1975 and was stripped of the championship. He played only one more competitive match — a rematch against Spassky in 1992.",
    bestGames: [
      { title: "The Game of the Century vs. Donald Byrne", event: "Rosenwald Trophy", year: "1956" },
      { title: "Fischer vs. Spassky, Game 6", event: "WCC Match", year: "1972" },
      { title: "Fischer vs. Taimanov, Game 1", event: "Candidates Match", year: "1971" },
    ]
  },
  {
    name: "Anatoly Karpov", country: "Russia", rating: "2780",
    bio: "Anatoly Karpov is a Russian grandmaster and former World Chess Champion known for his positional mastery and prophylactic style. Born in 1951, he was the dominant player of the 1970s and 1980s. His intuitive feel for piece placement and long-term strategic planning made him one of the greatest positional players who ever lived.",
    achievements: [
      { title: "FIDE World Chess Champion", year: "1975 – 1985" },
      { title: "FIDE World Champion (again)", year: "1993 – 1999" },
      { title: "Chess Oscar (9 times)", year: "1973 – 1977, 1979 – 1981, 1984" },
      { title: "USSR Champion", year: "1976, 1983, 1988" },
    ],
    career: "Karpov became World Champion in 1975 when Fischer refused to defend his title. He went on to defend the championship twice against Viktor Korchnoi before his legendary five-match series against Kasparov. Though he eventually lost to Kasparov, he remained an elite player well into the 1990s.",
    bestGames: [
      { title: "Karpov vs. Korchnoi, Game 2", event: "WCC Match", year: "1978" },
      { title: "Karpov vs. Kasparov, Game 44", event: "WCC Match", year: "1986" },
      { title: "Karpov vs. Miles", event: "Tilburg Tournament", year: "1986" },
    ]
  },
];

const games = [
  { title: "The Opera Game", players: "Paul Morphy vs. Duke of Brunswick & Count Isouard", year: "1858", event: "Paris Opera", result: "1–0" },
  { title: "The Immortal Game", players: "Adolf Anderssen vs. Lionel Kieseritzky", year: "1851", event: "London", result: "1–0" },
  { title: "The Game of the Century", players: "Donald Byrne vs. Robert J. Fischer", year: "1956", event: "Rosenwald Trophy, New York", result: "0–1" },
  { title: "Deep Blue vs. Kasparov, Game 2", players: "Deep Blue vs. Garry Kasparov", year: "1997", event: "IBM Match, New York", result: "1–0" },
  { title: "Fischer vs. Spassky, Game 6", players: "Bobby Fischer vs. Boris Spassky", year: "1972", event: "World Championship, Reykjavík", result: "1–0" },
  { title: "Kasparov vs. Topalov", players: "Garry Kasparov vs. Veselin Topalov", year: "1999", event: "Wijk aan Zee", result: "1–0" },
  { title: "The Evergreen Game", players: "Adolf Anderssen vs. Jean Dufresne", year: "1852", event: "Berlin", result: "1–0" },
  { title: "Rotlewi vs. Rubinstein", players: "Georg Rotlewi vs. Akiba Rubinstein", year: "1907", event: "Łódź", result: "0–1" },
];

const pdfs = [
  { title: "My System", author: "Nimzowitsch", desc: "The foundational text of modern positional chess strategy, introducing concepts like blockade and prophylaxis.", size: "2.4 MB" },
  { title: "Zurich 1953", author: "Bronstein", desc: "David Bronstein's legendary game-by-game account of the 1953 Candidates Tournament — the gold standard of chess books.", size: "5.1 MB" },
  { title: "Chess Fundamentals", author: "Capablanca", desc: "The World Champion's essential guide to chess — covering endings, middle games, and openings with timeless clarity.", size: "1.8 MB" },
  { title: "The Life and Games of Mikhail Tal", author: "Tal", desc: "Autobiography and game collection of the Magician from Riga, one of the most entertaining chess books ever written.", size: "3.7 MB" },
  { title: "Silman's Complete Endgame Course", author: "Silman", desc: "A comprehensive endgame study structured by rating level — from beginner to master.", size: "6.2 MB" },
  { title: "The Soviet School of Chess", author: "Kotov & Yudovich", desc: "A thorough examination of Soviet chess methodology and the players who made the USSR dominant for 50 years.", size: "4.4 MB" },
];

// ── CHESS BOARD ──
function buildBoard() {
  const board = document.getElementById('chessBoard');
  const pieces = {
    0: ['♜','♞','♝','♛','♚','♝','♞','♜'],
    1: ['♟','♟','♟','♟','♟','♟','♟','♟'],
    6: ['♙','♙','♙','♙','♙','♙','♙','♙'],
    7: ['♖','♘','♗','♕','♔','♗','♘','♖'],
  };
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      sq.className = 'sq ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      if (pieces[r]) {
        const p = document.createElement('span');
        p.className = 'piece';
        p.textContent = pieces[r][c];
        p.style.color = r < 2
          ? (sq.classList.contains('dark') ? '#fff' : '#aaa')
          : (sq.classList.contains('dark') ? '#f9f7f4' : '#333');
        sq.appendChild(p);
      }
      board.appendChild(sq);
    }
  }
}

// ── RENDER ARTICLES ──
function renderArticles() {
  const grid = document.getElementById('articlesGrid');
  grid.innerHTML = articles.map(a => `
    <div class="article-card fade-in">
      <div class="article-tag">${a.tag}</div>
      <div class="article-title">${a.title}</div>
      <div class="article-excerpt">${a.excerpt}</div>
      <div class="article-meta">${a.date} &nbsp;·&nbsp; ${a.readTime} read</div>
      <div class="article-arrow">→</div>
    </div>
  `).join('');
}

// ── RENDER PLAYERS ──
function renderPlayers() {
  const grid = document.getElementById('playersGrid');
  grid.innerHTML = players.map((p, i) => `
    <div class="player-card fade-in" onclick="openPlayer(${i})">
      <div class="player-card-header">
        <div class="player-avatar">${p.name[0]}</div>
        <div>
          <div class="player-name">${p.name}</div>
          <div class="player-country">${p.country}</div>
        </div>
      </div>
      <div class="player-card-body">
        <div class="player-rating">Peak Rating <strong>${p.rating}</strong></div>
        <div class="player-tabs">
          <span class="player-tab-pill">Bio</span>
          <span class="player-tab-pill">Achievements</span>
          <span class="player-tab-pill">Career</span>
          <span class="player-tab-pill">Best Games</span>
        </div>
      </div>
    </div>
  `).join('');
}

// ── RENDER GAMES ──
function renderGames() {
  const list = document.getElementById('gamesList');
  list.innerHTML = games.map((g, i) => `
    <div class="game-row fade-in">
      <div class="game-num">${String(i + 1).padStart(2, '0')}</div>
      <div>
        <div class="game-title">${g.title}</div>
        <div class="game-meta">${g.players} &nbsp;·&nbsp; ${g.event} &nbsp;·&nbsp; ${g.result}</div>
      </div>
      <div class="game-year">${g.year}</div>
    </div>
  `).join('');
}

// ── RENDER PDFS ──
function renderPDFs() {
  const grid = document.getElementById('pdfGrid');
  grid.innerHTML = pdfs.map(p => `
    <div class="pdf-card fade-in">
      <div class="pdf-icon">PDF</div>
      <div class="pdf-title">${p.title}</div>
      <div class="pdf-desc">${p.desc}<br><br><em style="font-size:.78rem;">— ${p.author}</em></div>
      <div class="pdf-size">↓ Download &nbsp;·&nbsp; ${p.size}</div>
    </div>
  `).join('');
}

// ── MODAL ──
function openPlayer(i) {
  const p = players[i];
  document.getElementById('modalName').textContent = p.name;
  document.getElementById('modalCountry').textContent = p.country.toUpperCase();
  document.getElementById('tab-bio').innerHTML = `<p>${p.bio}</p>`;
  document.getElementById('tab-achievements').innerHTML = `
    <ul class="achievement-list">
      ${p.achievements.map(a => `<li>${a.title}<span>${a.year}</span></li>`).join('')}
    </ul>`;
  document.getElementById('tab-career').innerHTML = `<p>${p.career}</p>`;
  document.getElementById('tab-bestgames').innerHTML = p.bestGames.map(g => `
    <div class="best-game">
      <div class="bg-title">${g.title}</div>
      <div class="bg-meta">${g.event} · ${g.year}</div>
    </div>
  `).join('');
  document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.modal-tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.modal-tab')[0].classList.add('active');
  document.getElementById('tab-bio').classList.add('active');
  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function switchTab(el, tabId) {
  document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.modal-tab-content').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('tab-' + tabId).classList.add('active');
}

// ── SCROLL NAV ──
function scrollTo(id) {
  document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
}

// ── INTERSECTION OBSERVER (fade-in on scroll) ──
function initFadeIn() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add('visible'), i * 80);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.fade-in').forEach(el => obs.observe(el));
}

// ── ACTIVE NAV HIGHLIGHT ──
function initScrollSpy() {
  const sections = ['articles', 'players', 'games', 'library'];
  const links = document.querySelectorAll('.nav-links a');
  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(id => {
      const el = document.getElementById(id);
      if (el && window.scrollY >= el.offsetTop - 120) current = id;
    });
    links.forEach((l, i) => {
      l.classList.toggle('active', sections[i] === current);
    });
  });
}

// ── INIT ──
buildBoard();
renderArticles();
renderPlayers();
renderGames();
renderPDFs();
window.addEventListener('load', () => {
  initFadeIn();
  initScrollSpy();
  setTimeout(initFadeIn, 100);
});
