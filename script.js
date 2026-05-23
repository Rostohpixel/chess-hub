// ─── SUPABASE ──────────────────────────────────────────────
const SUPABASE_URL = "https://qeswoiiydspqdjyqjfep.supabase.co";
const SUPABASE_KEY = "sb_publishable_Bc5bRNgIXWeHScpSQql8Lw_oQsyeRN2";
const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── GLOBALS ───────────────────────────────────────────────
let players          = [];
let articles         = [];
let pdfs             = [];
let currentBoard     = null;
let engine           = null;
let engineBoard      = null;
let engineGame       = null;
let editIndex        = null;
let selectedCategory        = "all";
let selectedArticleCategory = "all";
let profileEngine    = null;
let pvLines          = {};
let lastEvalScore    = 0;
let boardOrientation = 'white';
let evalHistory      = [];
let engineMoveHistory = [];

// ─── VIEW TRACKING ─────────────────────────────────────────
let playerViews = JSON.parse(localStorage.getItem('playerViews') || '{}');

function trackView(playerId) {
  playerViews[playerId] = (playerViews[playerId] || 0) + 1;
  localStorage.setItem('playerViews', JSON.stringify(playerViews));
}

function getViews(playerId) {
  return playerViews[playerId] || 0;
}

// ─── PERFORMANCE: SIMPLE CACHE ─────────────────────────────
const cache = {
  players:  { data: null, ts: 0 },
  articles: { data: null, ts: 0 },
  pdfs:     { data: null, ts: 0 },
  TTL: 60000
};

function isCacheValid(key) {
  return cache[key].data !== null && (Date.now() - cache[key].ts) < cache.TTL;
}

// ─── PERFORMANCE: DEBOUNCE ─────────────────────────────────
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

const debouncedRenderPlayers      = debounce(renderPlayers, 250);
const debouncedRenderPDFs         = debounce(renderPDFs, 250);
const debouncedAnalyze            = debounce(analyzeEnginePosition, 300);
const debouncedRenderArticlesPage = debounce(renderArticlesPage, 250);

// ─── PERFORMANCE: DEBOUNCED GLOBAL SEARCH ──────────────────
const debouncedGlobalSearch = debounce(_globalSearchHandler, 250);
function globalSearchHandler() { debouncedGlobalSearch(); }

// ─── HELPERS ──────────────────────────────────────────────
function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function playMoveSound(move) {
  const sound = move && move.captured
    ? document.getElementById('captureSound')
    : document.getElementById('moveSound');
  sound.volume = 1.0;
  sound.currentTime = 0;
  sound.play();
}

// ─── TAB NAVIGATION ───────────────────────────────────────
function showTab(tabId) {
  if (tabId === 'admin' && !currentUser) {
    openAdminModal();
    return;
  }

  showProgress();

  const current = document.querySelector('section.active');
  if (current) {
    current.classList.add('fade-out');
    setTimeout(() => {
      current.classList.remove('active', 'fade-out');
      activateTab(tabId);
      hideProgress();
    }, 150);
  } else {
    activateTab(tabId);
    hideProgress();
  }
}

function activateTab(tabId) {
  document.querySelectorAll('section').forEach(sec => sec.classList.remove('active', 'fade-out'));
  const next = document.getElementById(tabId);
  next.classList.add('active', 'fade-in');
  setTimeout(() => next.classList.remove('fade-in'), 300);

  document.querySelectorAll('nav button:not(#themeToggle)').forEach(btn => btn.classList.remove('nav-active'));
  const tabMap  = ['home','articles','players','engine','play','puzzles','openings','pdf','admin'];
  const navBtns = document.querySelectorAll('nav button:not(#themeToggle)');
  const idx     = tabMap.indexOf(tabId);
  if (idx !== -1 && navBtns[idx]) navBtns[idx].classList.add('nav-active');

  if (tabId === 'pdf') {
    if (!isCacheValid('pdfs')) fetchPDFs();
    else renderPDFs();
  }
  if (tabId === 'articles') {
    if (!isCacheValid('articles')) fetchArticles();
    else renderArticlesPage();
  }
  if (tabId === 'engine') {
    initEngineBoard();
    if (engineBoard) setTimeout(() => engineBoard.resize(), 100);
  }
  if (tabId === 'puzzles') initPuzzle();
  if (tabId === 'players') setTimeout(() => renderRecentlyViewed(), 200);
}

// ─── PLAYERS ──────────────────────────────────────────────
function renderPlayers() {
  const container   = document.getElementById('playersContainer');
  const search      = document.getElementById('searchInput')?.value.toLowerCase() || '';
  const filterTitle  = document.getElementById('filterTitle')?.value || '';
  const filterRating = parseInt(document.getElementById('filterRating')?.value) || 0;
  const filterSort   = document.getElementById('filterSort')?.value || 'default';

  const fragment = document.createDocumentFragment();
  container.innerHTML = '';

  if (players.length === 0) {
    container.innerHTML = "<p>No players yet. Add one in Admin.</p>";
    return;
  }

  let filtered = players.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search) ||
      (p.bio && p.bio.toLowerCase().includes(search));
    const matchesTitle  = !filterTitle  || p.title === filterTitle;
    const matchesRating = !filterRating || (p.rating && p.rating >= filterRating);
    return matchesSearch && matchesTitle && matchesRating;
  });

  if (filterSort === 'rating_desc') filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  if (filterSort === 'rating_asc')  filtered.sort((a, b) => (a.rating || 0) - (b.rating || 0));
  if (filterSort === 'name_asc')    filtered.sort((a, b) => a.name.localeCompare(b.name));
  if (filterSort === 'most_viewed') filtered.sort((a, b) => getViews(b.id) - getViews(a.id));

  if (filtered.length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim); text-align:center; padding:40px;">No players match your filters.</p>';
    return;
  }

  filtered.forEach((p) => {
    const actualIndex = players.indexOf(p);
    const views       = getViews(p.id);
    const div = document.createElement('div');
    const pNameEnc = encodeURIComponent(p.name || 'Player');
    const imgSrc = (p.image && typeof p.image === 'string' && p.image.startsWith('http'))
      ? p.image
      : 'https://ui-avatars.com/api/?name=' + pNameEnc + '&background=1e293b&color=38bdf8&size=80&bold=true';
    const imgFallback = 'https://ui-avatars.com/api/?name=' + pNameEnc + '&background=1e293b&color=38bdf8&size=80&bold=true';
    div.innerHTML = `
      <div class="card">
        <div class="card-content">
          <img
            src="${imgSrc}"
            class="player-img"
            loading="lazy"
            onerror="this.src='${imgFallback}'"
          >
          <div class="player-info">
            <h2>
              ${p.title ? `<span class="title-badge title-${p.title}">${p.title}</span>` : ''}
              ${sanitize(p.name)}
            </h2>
            ${p.rating ? `<span class="player-rating">⭐ ${p.rating}</span>` : ''}
            ${views > 0 ? `<span class="player-views">👁 ${views} view${views !== 1 ? 's' : ''}</span>` : ''}
            <p>${p.bio.length > 100 ? sanitize(p.bio.substring(0, 100)) + '...' : sanitize(p.bio)}</p>
          </div>
        </div>
        <div class="player-menu">
          <button class="player-menu-btn" onclick="togglePlayerMenu(event, '${actualIndex}')">⋮</button>
          <div id="playerMenu-${actualIndex}" class="player-menu-dropdown">
            <button class="edit-btn">✏️ Edit</button>
            <button class="delete-btn">❌ Delete</button>
          </div>
        </div>
      </div>
    `;
    div.addEventListener('click', (e) => {
      if (e.target.closest('.delete-btn') || e.target.closest('.edit-btn')) return;
      openProfile(actualIndex);
    });
    div.querySelector('.edit-btn').addEventListener('click',   (e) => { closeAllPlayerMenus(); editPlayer(actualIndex, e); });
    div.querySelector('.delete-btn').addEventListener('click', (e) => { closeAllPlayerMenus(); deletePlayer(actualIndex, e); });
    fragment.appendChild(div);
  });

  container.appendChild(fragment);
}

function openProfile(index) {
  const player    = players[index];
  const container = document.getElementById('profileContent');

  // track views
  trackView(player.id);
  addToRecentlyViewed(player);

  const achievementList  = (player.achievements || '').split(',').filter(a => a.trim() !== '');
  const achievementIcons = ['🏆','🥇','🎖️','⭐','🏅','👑','🎯','💎','🔥','✨'];
  const totalGames       = player.games ? player.games.length : 0;
  const views            = getViews(player.id);
  const flagHTML         = getFlagHTML(player.name, player.bio);

  const achievementsHTML = achievementList.length > 0
    ? `<div class="achievements-grid">${achievementList.map((a, i) => `
        <div class="achievement-item">
          <span class="achievement-icon">${achievementIcons[i % achievementIcons.length]}</span>
          <span class="achievement-text">${sanitize(a.trim())}</span>
        </div>`).join('')}</div>`
    : `<p style="color:var(--text-dim);font-style:italic;">No achievements listed yet.</p>`;

  container.innerHTML = `
    <div class="card" style="cursor:default;">

      <!-- PROFILE HEADER -->
      <div class="profile-header">
        <img src="${player.image && player.image.startsWith('http') ? sanitize(player.image) : 'https://ui-avatars.com/api/?name=Player&background=1e293b&color=38bdf8&size=150&bold=true'}"
             class="profile-avatar" loading="lazy"
             onerror="this.src='https://ui-avatars.com/api/?name=' + encodeURIComponent('${sanitize(player.name)}') + '&background=1e293b&color=38bdf8&size=150'">
        <div class="profile-meta">
          <h2>
            ${player.title ? `<span class="title-badge title-${player.title}">${player.title}</span>` : ''}
            ${sanitize(player.name)}
          </h2>
          <div class="profile-badges">
            ${player.rating ? `<span class="profile-rating-badge">⭐ FIDE <span id="ratingCounter">${player.rating}</span></span>` : ''}
            ${flagHTML}
          </div>
        </div>
      </div>

      <!-- TABS -->
      <div class="profile-tabs">
        <button class="profile-tab-btn tab-active" data-tab="bio">📖 Bio</button>
        <button class="profile-tab-btn" data-tab="stats">📊 Stats</button>
        <button class="profile-tab-btn" data-tab="achievements">🏆 Achievements</button>
        <button class="profile-tab-btn" data-tab="games">🎮 Games</button>
      </div>

      <!-- TAB: BIO -->
      <div class="profile-tab-panel tab-panel-active" id="tab-bio">
        <div class="profile-section">
          <div class="profile-section-title">Biography</div>
          <div class="bio-box"><p>${sanitize(player.bio)}</p></div>
        </div>
        <div class="profile-section">
          <div class="profile-section-title">Chess Career</div>
          <div class="career-box"><p>${sanitize(player.career || 'No career info added yet.')}</p></div>
        </div>
      </div>

      <!-- TAB: STATS -->
      <div class="profile-tab-panel" id="tab-stats">
        <div class="player-stats-mini">
          <div class="player-stat-mini">
            <span class="player-stat-mini-value">${player.rating || '—'}</span>
            <span class="player-stat-mini-label">FIDE Rating</span>
          </div>
          <div class="player-stat-mini">
            <span class="player-stat-mini-value">${totalGames}</span>
            <span class="player-stat-mini-label">Games</span>
          </div>
          <div class="player-stat-mini">
            <span class="player-stat-mini-value">${views}</span>
            <span class="player-stat-mini-label">Profile Views</span>
          </div>
        </div>
        ${player.rating ? `
        <div class="rating-chart-container">
          <div class="rating-chart-header">
            <span class="rating-chart-title">📈 Rating History</span>
            <div style="display:flex;align-items:center;gap:10px;">
              <span class="rating-chart-current">${player.rating}</span>
              <span class="rating-chart-change rating-change-up">▲ Trending</span>
            </div>
          </div>
          <canvas id="ratingChartCanvas" data-rating="${player.rating}"></canvas>
        </div>` : '<p style="color:var(--text-dim);font-style:italic;">No rating data available.</p>'}
      </div>

      <!-- TAB: ACHIEVEMENTS -->
      <div class="profile-tab-panel" id="tab-achievements">
        <div class="profile-section">
          <div class="profile-section-title">Achievements</div>
          ${achievementsHTML}
        </div>
      </div>

      <!-- TAB: GAMES -->
      <div class="profile-tab-panel" id="tab-games">
        <div class="profile-section">
          <div class="profile-section-title">Best Games</div>
          <div class="games-btn-grid">
            ${player.games && player.games.length > 0
              ? player.games.map((g, i) =>
                  `<button class="game-btn" onclick="loadGame(${index}, ${i}); setActiveGameBtn(this)">${sanitize(g.name)}</button>`
                ).join('')
              : "<p style='color:var(--text-dim);font-style:italic;'>No games available yet.</p>"
            }
          </div>
        </div>
        <div class="profile-section" style="margin-top:20px;">
          <div class="profile-section-title">Game Viewer</div>
          <div class="game-container">
            <div style="display:flex;gap:10px;align-items:center;">
              <div id="evalBarContainer" style="width:25px;height:400px;background:#1a1a1a;border-radius:6px;overflow:hidden;position:relative;">
                <div id="evalBar" style="width:100%;height:50%;background:white;position:absolute;bottom:0;transition:height 0.3s;"></div>
                <div id="evalScore" style="position:absolute;width:100%;text-align:center;font-size:10px;font-weight:bold;z-index:10;left:0;bottom:4px;color:#333;">0.00</div>
              </div>
              <div class="board-section">
                <div id="blackLabel" class="player-label">
                  <span class="color-dot black"></span>
                  <span id="blackPlayerName">Black</span>
                </div>
                <div id="board" class="board"></div>
                <div id="whiteLabel" class="player-label">
                  <span class="color-dot white"></span>
                  <span id="whitePlayerName">White</span>
                </div>
                <div class="controls">
                  <button onclick="prevMove()">⏮</button>
                  <button onclick="nextMove()">⏭</button>
                </div>
              </div>
            </div>
            <div class="moves-section"><div id="moves"></div></div>
          </div>
        </div>
      </div>

      <!-- SHARE BAR -->
      <div class="share-bar" style="margin-top:20px;">
        <button class="share-btn" onclick="shareProfile(${index})">🔗 Share Profile</button>
        <button class="share-btn" onclick="downloadProfilePGN(${index})">⬇️ Download PGN</button>
        <button class="share-btn" onclick="sharePosition()">📋 Copy FEN</button>
      </div>

    </div>
  `;

  showTab('profile');

  // init tabs
  initProfileTabs();

  // animate rating counter
  if (player.rating) {
    const ratingEl = document.getElementById('ratingCounter');
    if (ratingEl) animateRating(ratingEl, player.rating);
  }

  // load first game
  if (player.games && player.games.length > 0) {
    setTimeout(() => loadGame(index, 0), 100);
  }
}

function loadGame(playerIndex, gameIndex) {
  const gameData = players[playerIndex].games[gameIndex];
  if (!gameData.pgn) { toast('No PGN available for this game.', 'info'); return; }

  const game = new Chess();
  if (!game.load_pgn(gameData.pgn)) { toast('Invalid PGN format', 'error'); return; }

  const moves = game.history();
  const chess = new Chess();

  // Destroy existing board
  if (currentBoard && currentBoard.board) {
    try { currentBoard.board.destroy(); } catch(e) {}
    currentBoard = null;
  }

  // Switch to games tab so #board div is in the DOM
  const gamesTab = document.querySelector('.profile-tab-btn[data-tab="games"]');
  if (gamesTab && !gamesTab.classList.contains('tab-active')) {
    gamesTab.click();
  }

  // Wait for tab transition + DOM paint before init
  setTimeout(() => {
    const boardEl = document.getElementById('board');
    if (!boardEl) {
      console.warn('Board element not found');
      return;
    }

    // clear any existing chessboard inside
    boardEl.innerHTML = '';

    const board = Chessboard('board', {
      position: 'start',
      pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
      showNotation: true,
    });

    currentBoard = { chess, board, moves, moveIndex: 0 };

    // set player name labels
    const white      = gameData.white_player || 'White';
    const black      = gameData.black_player || 'Black';
    const whiteTitle = gameData.white_title  || '';
    const blackTitle = gameData.black_title  || '';
    const whiteEl    = document.getElementById('whitePlayerName');
    const blackEl    = document.getElementById('blackPlayerName');
    const whiteBadge = whiteTitle ? `<span class="title-badge title-${whiteTitle}">${whiteTitle}</span> ` : '';
    const blackBadge = blackTitle ? `<span class="title-badge title-${blackTitle}">${blackTitle}</span> ` : '';
    if (whiteEl) whiteEl.innerHTML = whiteBadge + sanitize(white);
    if (blackEl) blackEl.innerHTML = blackBadge + sanitize(black);

    renderMoves();
    updateBoard();

    // resize + engine after paint
    requestAnimationFrame(() => {
      board.resize();
      setTimeout(() => {
        initProfileEngine();
        analyzeProfilePosition();
        injectReplayControls();
        injectAnnotationEditor();
      }, 150);
    });

  }, 120); // wait for tab switch animation
}

function nextMove() {
  if (!currentBoard) return;
  if (currentBoard.moveIndex < currentBoard.moves.length) {
    const move = currentBoard.chess.move(currentBoard.moves[currentBoard.moveIndex]);
    currentBoard.board.position(currentBoard.chess.fen());
    currentBoard.moveIndex++;
    renderMoves();
    playMoveSound(move);
    analyzeProfilePosition();
  }
}

function prevMove() {
  if (!currentBoard) return;
  if (currentBoard.moveIndex > 0) {
    const move = currentBoard.chess.undo();
    currentBoard.board.position(currentBoard.chess.fen());
    currentBoard.moveIndex--;
    renderMoves();
    playMoveSound(move);
    analyzeProfilePosition();
  }
}

function renderMoves() {
  const movesDiv = document.getElementById('moves');
  if (!currentBoard || !movesDiv) return;

  const fragment = document.createDocumentFragment();
  const moves    = currentBoard.moves;

  for (let i = 0; i < moves.length; i += 2) {
    const row    = document.createElement('div');
    const number = document.createElement('span');
    number.className = 'move-number';
    number.innerText = `${Math.floor(i / 2) + 1}.`;
    row.appendChild(number);

    const white = document.createElement('span');
    white.className = 'move';
    white.innerText = moves[i];
    white.onclick   = () => goToMove(i);
    if (i === currentBoard.moveIndex - 1) white.classList.add('active');
    row.appendChild(white);

    if (moves[i + 1]) {
      const black = document.createElement('span');
      black.className = 'move';
      black.innerText = moves[i + 1];
      black.onclick   = () => goToMove(i + 1);
      if (i + 1 === currentBoard.moveIndex - 1) black.classList.add('active');
      row.appendChild(black);
    }
    fragment.appendChild(row);
  }

  movesDiv.innerHTML = '';
  movesDiv.appendChild(fragment);
}

function goToMove(index) {
  const chess = new Chess();
  for (let i = 0; i <= index; i++) chess.move(currentBoard.moves[i]);
  const lastMove         = currentBoard.moves[index];
  currentBoard.chess     = chess;
  currentBoard.moveIndex = index + 1;
  updateBoard();
  playMoveSound({ captured: lastMove && lastMove.includes('x') });
  analyzeProfilePosition();
}

function updateBoard() {
  if (!currentBoard) return;
  currentBoard.board.position(currentBoard.chess.fen());
  renderMoves();
}

function renderExistingGames(player) {
  const container = document.getElementById('existingGamesList');
  container.innerHTML = '';
  if (!player.games || player.games.length === 0) {
    container.innerHTML = '<p style="color:#94a3b8;">No games yet.</p>';
    return;
  }
  player.games.forEach(game => {
    const div = document.createElement('div');
    div.className = 'game-item';
    div.innerHTML = `
      <span>${sanitize(game.name)}</span>
      <button onclick="deleteGame('${game.id}')">❌ Delete</button>
    `;
    container.appendChild(div);
  });
}

async function deleteGame(gameId) {
  if (!confirm('Delete this game?')) return;
  const { error } = await client.from('games').delete().eq('id', gameId);
  if (error) { toast('Delete failed', 'error'); return; }
  cache.players.data = null;
  await fetchPlayers();
  renderExistingGames(players[editIndex]);
}

async function saveNewGame() {
  const name = document.getElementById('newGameName').value.trim();
  const pgn  = document.getElementById('newGamePgn').value.trim();
  if (!name || !pgn) { toast('Fill in game name and PGN', 'error'); return; }

  const player = players[editIndex];
  const chess  = new Chess();
  if (!chess.load_pgn(pgn)) { toast('Invalid PGN format', 'error'); return; }

  const white      = document.getElementById('newGameWhite').value.trim();
  const black      = document.getElementById('newGameBlack').value.trim();
  const whiteTitle = document.getElementById('newWhiteTitle').value;
  const blackTitle = document.getElementById('newBlackTitle').value;

  const { error } = await client.from('games').insert([{
    player_id: player.id, name, pgn,
    white_player: white, black_player: black,
    white_title: whiteTitle, black_title: blackTitle
  }]);
  if (error) { alert('Save failed'); return; }

  document.getElementById('newGameName').value  = '';
  document.getElementById('newGameWhite').value = '';
  document.getElementById('newGameBlack').value = '';
  document.getElementById('newWhiteTitle').value = '';
  document.getElementById('newBlackTitle').value = '';
  document.getElementById('newGamePgn').value   = '';

  cache.players.data = null;
  await fetchPlayers();
  renderExistingGames(players[editIndex]);
  toast('Game saved! 🎮', 'success');
}

function addGameField() {
  const container = document.getElementById('extraGames');
  const entry     = document.createElement('div');
  entry.className = 'game-entry';
  entry.innerHTML = `
    <input placeholder="Game Name (e.g. Brilliant Win)">
    <input placeholder="White Player">
    <input placeholder="Black Player">
    <textarea rows="3" placeholder="Paste PGN here"></textarea>
    <button class="remove-game-btn" onclick="this.parentElement.remove()">Remove</button>
  `;
  container.appendChild(entry);
}

// ─── ADD PLAYER ────────────────────────────────────────────
async function addPlayer() {
  const name         = document.getElementById('name').value.trim();
  const bio          = document.getElementById('bio').value.trim();
  const career       = document.getElementById('career').value.trim();
  const gameName     = document.getElementById('gameName').value.trim();
  const pgn          = document.getElementById('pgn').value.trim();
  const rating       = parseInt(document.getElementById('rating').value) || null;
  const title        = document.getElementById('title').value;
  const achievements = document.getElementById('achievements').value
    .split(',').map(a => a.trim()).filter(a => a).join(',');

  if (!name || !bio) { toast('Name and Biography are required.', 'error'); return; }

  if (editIndex !== null) {
    const player = players[editIndex];
    const { error } = await client
      .from('players')
      .update({ name, bio, career, achievements, rating, title })
      .eq('id', player.id);
    if (error) { toast(error.message, 'error'); return; }

    editIndex = null;
    document.querySelector('#admin .card > button[onclick="addPlayer()"]').innerText = "Add Player";
    document.getElementById('editGamesSection').style.display = 'none';
    ['name','bio','career','achievements','rating','title','gameName','whitePlayer','blackPlayer','pgn']
      .forEach(id => document.getElementById(id).value = '');
    document.getElementById('whiteTitle').value = '';
    document.getElementById('blackTitle').value = '';
    document.getElementById('extraGames').innerHTML = '';
    cache.players.data = null;
    await fetchPlayers(true);
    toast('Player updated! ✅', 'success');
    showTab('players');
    return;
  }

  const fileInput = document.getElementById('imageFile');
  const file      = fileInput.files[0];
  let image       = "";

  if (file) {
    // sanitize filename — remove spaces and special chars
    const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName  = Date.now() + "-" + safeName;

    const { error: uploadError } = await client.storage
      .from('player-images')
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      toast('Image upload failed: ' + uploadError.message, 'error');
      console.error('Upload error:', uploadError);
      // continue without image rather than stopping
    } else {
      const { data } = client.storage.from('player-images').getPublicUrl(fileName);
      image = data.publicUrl;
      console.log('Image uploaded:', image);
    }
  }

  const { data: playerData, error: playerError } = await client
    .from('players')
    .insert([{ name, bio, career, image: image || null, achievements, rating, title }])
    .select();
  if (playerError) { toast(playerError.message, 'error'); return; }

  const playerId    = playerData[0].id;
  const gamesToSave = [];
  const whitePlayer = document.getElementById('whitePlayer').value.trim();
  const blackPlayer = document.getElementById('blackPlayer').value.trim();
  const whiteTitle  = document.getElementById('whiteTitle').value;
  const blackTitle  = document.getElementById('blackTitle').value;

  if (pgn && gameName) {
    gamesToSave.push({ player_id: playerId, name: gameName, pgn, white_player: whitePlayer, black_player: blackPlayer, white_title: whiteTitle, black_title: blackTitle });
  }

  document.querySelectorAll('#extraGames .game-entry').forEach(entry => {
    const inputs          = entry.querySelectorAll('input');
    const selects         = entry.querySelectorAll('select');
    const extraName       = inputs[0].value.trim();
    const extraWhite      = inputs[1].value.trim();
    const extraBlack      = inputs[2].value.trim();
    const extraWhiteTitle = selects[0] ? selects[0].value : '';
    const extraBlackTitle = selects[1] ? selects[1].value : '';
    const extraPgn        = entry.querySelector('textarea').value.trim();
    if (extraName && extraPgn) {
      gamesToSave.push({ player_id: playerId, name: extraName, pgn: extraPgn, white_player: extraWhite, black_player: extraBlack, white_title: extraWhiteTitle, black_title: extraBlackTitle });
    }
  });

  if (gamesToSave.length > 0) {
    console.log('Saving games:', gamesToSave);
    const { data: savedGames, error: gameError } = await client.from('games').insert(gamesToSave).select();
    if (gameError) {
      console.error('Game save error:', gameError);
      toast('Game save failed: ' + gameError.message, 'error');
    } else {
      console.log('Games saved:', savedGames);
    }
  }

  ['name','bio','career','achievements','rating','title','gameName','whitePlayer','blackPlayer','pgn']
    .forEach(id => document.getElementById(id).value = '');
  document.getElementById('whiteTitle').value = '';
  document.getElementById('blackTitle').value = '';
  document.getElementById('imageFile').value  = '';
  document.getElementById('extraGames').innerHTML = '';
  document.getElementById('editGamesSection').style.display = 'none';
  cache.players.data = null;
  await fetchPlayers(true);
  toast('Player added! ♟', 'success');
  launchConfetti();
  showTab('players');
}

async function deletePlayer(index, event) {
  event.stopPropagation();
  const player = players[index];
  showConfirm(
    'Delete Player',
    `Are you sure you want to delete "${player.name}"? This cannot be undone.`,
    async () => {
      await client.from('games').delete().eq('player_id', player.id);
      const { error } = await client.from('players').delete().eq('id', player.id);
      if (error) { toast('Delete failed', 'error'); return; }
      cache.players.data = null;
      fetchPlayers(true);
      toast(`${player.name} deleted.`, 'info');
    }
  );
}

function editPlayer(index, event) {
  event.stopPropagation();
  const player = players[index];
  editIndex    = index;
  document.getElementById('name').value         = player.name;
  document.getElementById('bio').value          = player.bio;
  document.getElementById('career').value       = player.career || '';
  document.getElementById('achievements').value = player.achievements || '';
  document.getElementById('rating').value       = player.rating || '';
  document.getElementById('title').value        = player.title || '';
  document.getElementById('gameName').value     = '';
  document.getElementById('pgn').value          = '';
  document.querySelector('#admin .card > button[onclick="addPlayer()"]').innerText = "Update Player";
  document.getElementById('editGamesSection').style.display = 'block';
  renderExistingGames(player);
  showTab('admin');
  setTimeout(() => document.getElementById('editGamesSection').scrollIntoView({ behavior: 'smooth' }), 300);
}

// ─── FETCH PLAYERS ─────────────────────────────────────────
async function fetchPlayers(force = false) {
  if (!force && isCacheValid('players')) {
    players = cache.players.data;
    renderPlayers();
    renderFeaturedPlayers();
    updateHeroStats();
    updateStats();
    renderDailyGame();
    renderPlayerOfMonth();
    renderLeaderboard();
    renderGameOfWeek();
    populateCompareSelects();
    return;
  }
  // always invalidate on forced fetch
  cache.players.data = null;

  showSkeletons('featuredPlayers', 3, 'featured');
  showSkeletons('playersContainer', 6, 'player');

  const [playersRes, gamesRes] = await Promise.all([
    client.from('players').select('*'),
    client.from('games').select('*')
  ]);

  if (playersRes.error) { console.error(playersRes.error); return; }
  if (gamesRes.error)   { console.error(gamesRes.error);   return; }

  players = playersRes.data.map(player => ({
    ...player,
    image: player.image || '',
    games: gamesRes.data.filter(g => g.player_id === player.id)
  }));

  cache.players.data = players;
  cache.players.ts   = Date.now();

  renderPlayers();
  renderFeaturedPlayers();
  updateHeroStats();
  updateStats();
  renderDailyGame();
  renderPlayerOfMonth();
  renderLeaderboard();
  renderGameOfWeek();
  populateCompareSelects();
}

// ─── PLAYER OF THE MONTH ──────────────────────────────────
function renderPlayerOfMonth() {
  const container = document.getElementById('playerOfMonth');
  if (!container || players.length === 0) return;

  const sorted = [...players].sort((a, b) => getViews(b.id) - getViews(a.id));
  const star   = sorted[0];
  const idx    = players.indexOf(star);
  const totalGames = star.games ? star.games.length : 0;
  const views      = getViews(star.id);

  container.innerHTML = `
    <div class="potm-card">
      <div class="potm-badge">🏆 Player of the Month</div>
      <div class="potm-inner">
        <div class="potm-img-wrapper">
          <img src="${sanitize(star.image || 'https://placehold.co/80x80/1e293b/38bdf8?text=♟')}" loading="lazy" onerror="this.src='https://placehold.co/80x80/1e293b/38bdf8?text=♟'">
        </div>
        <div class="potm-info">
          <div class="potm-name">
            ${star.title ? `<span class="title-badge title-${star.title}">${star.title}</span>` : ''}
            <h2>${sanitize(star.name)}</h2>
          </div>
          ${star.rating ? `<div class="potm-rating">⭐ FIDE ${star.rating}</div>` : ''}
          <div class="potm-stats">
            <span>🎮 ${totalGames} Games</span>
            <span>👁 ${views} Views</span>
          </div>
          <p>${star.bio.length > 120 ? sanitize(star.bio.substring(0, 120)) + '...' : sanitize(star.bio)}</p>
          <button class="potm-btn" onclick="openProfile(${idx})">View Profile →</button>
        </div>
      </div>
    </div>
  `;
}

// ─── COMPARE PLAYERS ──────────────────────────────────────
function toggleComparePanel() {
  const panel = document.getElementById('comparePanel');
  panel.classList.toggle('hidden');
}

function populateCompareSelects() {
  const selA = document.getElementById('comparePlayerA');
  const selB = document.getElementById('comparePlayerB');
  if (!selA || !selB) return;

  const opts = players.map((p, i) =>
    `<option value="${i}">${p.title ? p.title + ' ' : ''}${p.name}${p.rating ? ' (' + p.rating + ')' : ''}</option>`
  ).join('');

  selA.innerHTML = '<option value="">Select Player A</option>' + opts;
  selB.innerHTML = '<option value="">Select Player B</option>' + opts;
}

function renderComparison() {
  const idxA = document.getElementById('comparePlayerA').value;
  const idxB = document.getElementById('comparePlayerB').value;
  const container = document.getElementById('comparisonResult');
  if (!container) return;

  if (idxA === '' || idxB === '') { container.innerHTML = ''; return; }

  if (idxA === idxB) {
    container.innerHTML = '<p style="color:var(--text-dim); text-align:center; padding:20px;">Select two different players!</p>';
    return;
  }

  const a = players[idxA];
  const b = players[idxB];

  const aGames  = a.games ? a.games.length : 0;
  const bGames  = b.games ? b.games.length : 0;
  const aRating = a.rating || 0;
  const bRating = b.rating || 0;
  const aViews  = getViews(a.id);
  const bViews  = getViews(b.id);
  const aAch    = (a.achievements || '').split(',').filter(x => x.trim()).length;
  const bAch    = (b.achievements || '').split(',').filter(x => x.trim()).length;

  function bar(valA, valB) {
    const max  = Math.max(valA, valB, 1);
    const pctA = Math.round((valA / max) * 100);
    const pctB = Math.round((valB / max) * 100);
    const winA = valA >= valB;
    return { pctA, pctB, winA };
  }

  function row(label, valA, valB, suffix = '') {
    const { pctA, pctB, winA } = bar(valA, valB);
    return `
      <div class="compare-row">
        <div class="compare-val ${winA ? 'compare-winner' : ''}">${valA}${suffix}</div>
        <div class="compare-label">${label}</div>
        <div class="compare-val ${!winA ? 'compare-winner' : ''}">${valB}${suffix}</div>
      </div>
      <div class="compare-bars">
        <div class="compare-bar-a" style="width:${pctA}%"></div>
        <div class="compare-bar-b" style="width:${pctB}%"></div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="compare-result">
      <div class="compare-headers">
        <div class="compare-player-head">
          <img src="${sanitize(a.image || 'https://placehold.co/80x80/1e293b/38bdf8?text=♟')}" onerror="this.src='https://placehold.co/80x80/1e293b/38bdf8?text=♟'">
          <div>
            ${a.title ? `<span class="title-badge title-${a.title}">${a.title}</span>` : ''}
            <strong>${sanitize(a.name)}</strong>
          </div>
        </div>
        <div class="compare-vs">VS</div>
        <div class="compare-player-head">
          <img src="${sanitize(b.image || 'https://placehold.co/80x80/1e293b/38bdf8?text=♟')}" onerror="this.src='https://placehold.co/80x80/1e293b/38bdf8?text=♟'">
          <div>
            ${b.title ? `<span class="title-badge title-${b.title}">${b.title}</span>` : ''}
            <strong>${sanitize(b.name)}</strong>
          </div>
        </div>
      </div>
      <div class="compare-rows">
        ${row('FIDE Rating', aRating, bRating)}
        ${row('Games', aGames, bGames)}
        ${row('Achievements', aAch, bAch)}
        ${row('Profile Views', aViews, bViews)}
      </div>
    </div>
  `;
}

function renderFeaturedPlayers() {
  const container = document.getElementById('featuredPlayers');
  if (!container) return;

  if (players.length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:40px;grid-column:1/-1;">No players yet. Add one in Admin.</p>';
    return;
  }

  container.innerHTML = players.slice(0, 3).map((p, i) => {
    const totalGames = p.games ? p.games.length : 0;
    const views      = getViews(p.id);
    const nameEnc    = encodeURIComponent(p.name || 'Player');
    const imgSrc     = (p.image && p.image.startsWith('http'))
      ? sanitize(p.image)
      : 'https://ui-avatars.com/api/?name=' + nameEnc + '&background=1e293b&color=38bdf8&size=200&bold=true';
    const titleBadge = p.title
      ? `<span class="featured-title-pill title-${p.title}">${p.title}</span>`
      : '';
    const ratingHtml = p.rating
      ? `<div class="featured-rating">⭐ ${p.rating} FIDE</div>`
      : '';
    const viewsHtml  = views > 0
      ? `<span>👁 ${views}</span>`
      : '';

    return `
      <div class="featured-card" onclick="openProfile(${i})">
        <div class="featured-img-wrapper">
          <img src="${imgSrc}" loading="lazy" onerror="this.src='https://ui-avatars.com/api/?name=Player&background=1e293b&color=38bdf8&size=200'">
          <div class="featured-overlay">
            <button class="featured-view-btn">View Profile →</button>
          </div>
          ${titleBadge}
        </div>
        <div class="featured-info">
          <div class="featured-name">
            <strong>${sanitize(p.name)}</strong>
          </div>
          ${ratingHtml}
          <div class="featured-meta">
            <span>🎮 ${totalGames} Game${totalGames !== 1 ? 's' : ''}</span>
            ${viewsHtml}
          </div>
          <p class="featured-bio">${p.bio.length > 90 ? sanitize(p.bio.substring(0, 90)) + '...' : sanitize(p.bio)}</p>
        </div>
      </div>
    `;
  }).join('');
}

function renderDailyGame() {
  const container = document.getElementById('dailyGame');
  if (!container) return;
  container.innerHTML = '';
  if (players.length === 0) return;

  const validPlayers = players.filter(p => p.games && p.games.length > 0);
  if (validPlayers.length === 0) { container.innerHTML = "<p>No games available yet.</p>"; return; }

  const randomPlayer = validPlayers[Math.floor(Math.random() * validPlayers.length)];
  const randomGame   = randomPlayer.games[0];

  container.innerHTML = `
    <div class="card">
      <h3>${sanitize(randomGame.name)}</h3>
      <p>by ${sanitize(randomPlayer.name)}</p>
      <button onclick="openProfile(${players.indexOf(randomPlayer)})">Watch Game</button>
    </div>
  `;
}

function goToCategory(category) {
  selectedCategory = category;
  showTab('pdf');
}

// ─── ARTICLES ─────────────────────────────────────────────
async function fetchArticles() {
  if (isCacheValid('articles')) {
    articles = cache.articles.data;
    renderArticles();
    updateStats();
    return;
  }

  showSkeletons('articlesContainer', 3, 'article');

  const { data, error } = await client
    .from('articles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { console.error(error); return; }

  articles = data;
  cache.articles.data = articles;
  cache.articles.ts   = Date.now();

  renderArticles();
  updateStats();
}

const ARTICLE_CATEGORIES = {
  openings: { label: '♟ Openings',  color: '#38bdf8' },
  tactics:  { label: '⚔️ Tactics',  color: '#f97316' },
  strategy: { label: '🧠 Strategy', color: '#8b5cf6' },
  history:  { label: '📜 History',  color: '#22c55e' },
  news:     { label: '📰 News',     color: '#ec4899' },
};

function articleCategoryBadge(category) {
  if (!category || !ARTICLE_CATEGORIES[category]) return '';
  const cat = ARTICLE_CATEGORIES[category];
  return `<span class="article-category-badge" style="background:${cat.color}20; color:${cat.color}; border:1px solid ${cat.color}40;">${cat.label}</span>`;
}

function readingTime(text) {
  const words   = text.trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min read`;
}

function setArticleCategory(value, btn) {
  selectedArticleCategory = value;
  document.querySelectorAll('.article-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderArticlesPage();
}

function renderArticles() {
  const container = document.getElementById('articlesContainer');
  if (!container) return;

  const visibleArticles = articles.slice(0, 3);
  container.innerHTML = visibleArticles.map(article => `
    <div class="article-card" onclick="openArticleById('${article.id}')">
      <div class="article-thumb">
        <div class="article-menu">
          <button class="menu-btn" onclick="toggleMenu(event, '${article.id}')">⋮</button>
          <div id="menu-${article.id}" class="menu-dropdown">
            <button onclick="deleteArticle('${article.id}', event)">Delete</button>
          </div>
        </div>
        <img src="${article.image || 'https://placehold.co/80x80/1e293b/38bdf8?text=♟'}" alt="${sanitize(article.title)}" loading="lazy" onerror="this.src='https://placehold.co/80x80/1e293b/38bdf8?text=♟'">
      </div>
      <div class="article-content">
        <div class="article-meta-row">
          ${articleCategoryBadge(article.category)}
          <span class="article-reading-time">⏱ ${readingTime(article.content)}</span>
        </div>
        <h3>${sanitize(article.title)}</h3>
        <p class="article-date">${new Date(article.created_at).toLocaleDateString()}</p>
        <p>${article.content.length > 90 ? sanitize(article.content.substring(0, 90)) + '...' : sanitize(article.content)}</p>
      </div>
    </div>
  `).join('') + (articles.length > 3 ? `
    <div class="read-more-container">
      <button onclick="showTab('articles')">Read More Articles →</button>
    </div>
  ` : '');
}

function renderArticlesPage() {
  const container = document.getElementById('articlesPageContainer');
  if (!container) return;

  const search = document.getElementById('articleSearch')?.value?.toLowerCase() || '';

  const filtered = articles.filter(a => {
    const matchesCategory = selectedArticleCategory === 'all' || a.category === selectedArticleCategory;
    const matchesSearch   = !search ||
      a.title.toLowerCase().includes(search) ||
      a.content.toLowerCase().includes(search);
    return matchesCategory && matchesSearch;
  });

  // update count badge
  const badge = document.getElementById('articleCountBadge');
  if (badge) badge.innerText = `${filtered.length} Article${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="no-articles-placeholder" style="grid-column:1/-1;">
        <div class="placeholder-icon">📰</div>
        <p>No articles found matching your search.</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(article => `
    <div class="article-card" onclick="openArticleById('${article.id}')">
      <div class="article-thumb">
        <div class="article-menu">
          <button class="menu-btn" onclick="toggleMenu(event, '${article.id}')">⋮</button>
          <div id="menu-${article.id}" class="menu-dropdown">
            <button onclick="deleteArticle('${article.id}', event)">Delete</button>
          </div>
        </div>
        <img src="${article.image || 'https://placehold.co/80x80/1e293b/38bdf8?text=♟'}" alt="${sanitize(article.title)}" loading="lazy" onerror="this.src='https://placehold.co/80x80/1e293b/38bdf8?text=♟'">
      </div>
      <div class="article-content">
        <div class="article-meta-row">
          ${articleCategoryBadge(article.category)}
          <span class="article-reading-time">⏱ ${readingTime(article.content)}</span>
        </div>
        <h3>${sanitize(article.title)}</h3>
        <p class="article-date">📅 ${new Date(article.created_at).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' })}</p>
        <p>${article.content.length > 120 ? sanitize(article.content.substring(0, 120)) + '...' : sanitize(article.content)}</p>
      </div>
    </div>
  `).join('');
}

function openArticle(index) {
  const article = articles[index];
  const container = document.getElementById('profileContent');

  const related = articles
    .filter(a => a.id !== article.id && a.category && a.category === article.category)
    .slice(0, 3);

  const relatedHTML = related.length > 0 ? `
    <div class="related-articles">
      <h3>Related Articles</h3>
      <div class="related-grid">
        ${related.map(r => `
          <div class="related-card" onclick="openArticleById('${r.id}')">
            <img src="${r.image || 'https://placehold.co/80x80/1e293b/38bdf8?text=♟'}" loading="lazy" onerror="this.src='https://placehold.co/80x80/1e293b/38bdf8?text=♟'">
            <div class="related-info">
              ${articleCategoryBadge(r.category)}
              <strong>${sanitize(r.title)}</strong>
              <span>⏱ ${readingTime(r.content)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  container.innerHTML = `
    <div class="card" style="cursor:default;">
      <div class="back" onclick="showTab('articles')">← Back to Articles</div>

      <img
        src="${article.image || 'https://placehold.co/80x80/1e293b/38bdf8?text=♟'}"
        class="article-detail-hero"
        loading="lazy"
        onerror="this.src='https://placehold.co/80x80/1e293b/38bdf8?text=♟'"
      >

      <div class="article-detail-meta">
        ${articleCategoryBadge(article.category)}
        <span class="article-detail-date">📅 ${new Date(article.created_at).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}</span>
        <span class="article-reading-time">⏱ ${readingTime(article.content)}</span>
      </div>

      <h2 style="font-size:26px; font-weight:900; margin:0 0 16px 0; line-height:1.3;">${sanitize(article.title)}</h2>

      <div class="article-detail-body">
        <p>${sanitize(article.content)}</p>
      </div>

      ${relatedHTML}
    </div>
  `;
  showTab('profile');
}

function openArticleById(id) {
  const index = articles.findIndex(a => a.id == id);
  if (index !== -1) openArticle(index);
}

function toggleMenu(event, id) {
  event.stopPropagation();
  const menu = document.getElementById(`menu-${id}`);
  document.querySelectorAll('.menu-dropdown').forEach(m => { if (m !== menu) m.style.display = 'none'; });
  menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

async function deleteArticle(id, event) {
  event.stopPropagation();
  showConfirm(
    'Delete Article',
    'Are you sure you want to delete this article? This cannot be undone.',
    async () => {
      const { error } = await client.from('articles').delete().eq('id', id);
      if (error) { toast('Delete failed', 'error'); return; }
      cache.articles.data = null;
      fetchArticles();
      toast('Article deleted.', 'info');
    }
  );
}

async function addArticle() {
  const title    = document.getElementById('articleTitle').value.trim();
  const content  = document.getElementById('articleContent').value.trim();
  const category = document.getElementById('articleCategory').value;
  const file     = document.getElementById('articleImage').files[0];
  if (!title || !content) { toast('Fill all fields', 'error'); return; }

  let imageUrl = '';
  if (file) {
    const fileName = Date.now() + "-" + file.name;
    const { error: uploadError } = await client.storage.from('article-images').upload(fileName, file);
    if (uploadError) { toast(uploadError.message, 'error'); return; }
    const { data } = client.storage.from('article-images').getPublicUrl(fileName);
    imageUrl = data.publicUrl;
  }

  const { error } = await client.from('articles').insert([{ title, content, image: imageUrl, category }]);
  if (error) { toast(error.message, 'error'); return; }

  document.getElementById('articleTitle').value    = '';
  document.getElementById('articleContent').value  = '';
  document.getElementById('articleImage').value    = '';
  document.getElementById('articleCategory').value = '';

  toast('Article published! 📰', 'success'); launchConfetti();
  cache.articles.data = null;
  fetchArticles();
}

// ─── PDF ───────────────────────────────────────────────────
async function uploadPDF() {
  const fileInput = document.getElementById('pdfFile');
  const file      = fileInput.files[0];
  if (!file) { toast('Select a PDF first', 'info'); return; }

  const category = document.getElementById('pdfUploadCategory').value;
  const fileName = Date.now() + "-" + file.name;
  const { error } = await client.storage.from('chess-pdf').upload(fileName, file);
  if (error) { toast(error.message, 'error'); return; }

  const { data } = client.storage.from('chess-pdf').getPublicUrl(fileName);
  await savePDF(file.name, data.publicUrl, category);
  cache.pdfs.data = null;
  fetchPDFs();
}

async function savePDF(name, url, category) {
  await client.from('pdfs').insert([{ name, url, category }]);
}

async function fetchPDFs() {
  if (isCacheValid('pdfs')) {
    pdfs = cache.pdfs.data;
    renderPDFs();
    updateStats();
    return;
  }

  const { data, error } = await client.from('pdfs').select('*');
  if (error) { console.error(error); return; }

  pdfs = data;
  cache.pdfs.data = pdfs;
  cache.pdfs.ts   = Date.now();

  renderPDFs();
  updateStats();
}

function renderPDFs() {
  const container = document.getElementById('pdfList');
  const search    = document.getElementById('pdfSearch')?.value?.toLowerCase() || '';
  const filtered  = pdfs.filter(pdf => {
    const matchesSearch   = pdf.name.toLowerCase().includes(search);
    const matchesCategory = selectedCategory === "all" || pdf.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  container.innerHTML = filtered.map(pdf => `
    <div class="pdf-card">
      <div class="pdf-info">
        <h3>${sanitize(pdf.name)}</h3>
        <p>Chess Study Material</p>
      </div>
      <a href="${sanitize(pdf.url)}" target="_blank" class="open-btn">Open</a>
    </div>
  `).join('');
}

function togglePdfForm() {
  document.getElementById('pdfForm').classList.toggle('hidden');
}

function setCategory(value) {
  selectedCategory = value;
  renderPDFs();
}

// ─── ENGINE ────────────────────────────────────────────────
function initEngineBoard() {
  if (engineBoard) return;

  engineGame = new Chess();

  engineBoard = Chessboard('engineBoard', {
    draggable: true,
    position: 'start',
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    onDrop: function(source, target) {
      const move = engineGame.move({ from: source, to: target, promotion: 'q' });
      if (move === null) return 'snapback';
      engineMoveHistory = [];
      engineBoard.position(engineGame.fen());
      playMoveSound(move);
      highlightLastMove(source, target);
      renderEngineMoves();
      if (engine) debouncedAnalyze();
      updateOpeningName();
    }
  });

  try {
    const stockfishUrl = 'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js';
    const blob = new Blob([`importScripts('${stockfishUrl}');`], { type: 'application/javascript' });
    engine = new Worker(URL.createObjectURL(blob));
    engine.postMessage('uci');

    engine.onmessage = function(event) {
      const line = event.data;
      if (line.includes('score cp')) {
        const match = line.match(/score cp (-?\d+)/);
        if (match) updateEvalBar(parseInt(match[1]) / 100);
      }
      if (line.includes('score mate')) {
        const match = line.match(/score mate (-?\d+)/);
        if (match) updateEvalBar(parseInt(match[1]) > 0 ? 10 : -10);
      }
      if (line.includes('depth') && line.includes('nps')) {
        const depth     = line.match(/depth (\d+)/);
        const nps       = line.match(/nps (\d+)/);
        const nodes     = line.match(/nodes (\d+)/);
        const multipv   = line.match(/multipv (\d+)/);
        const scorecp   = line.match(/score cp (-?\d+)/);
        const scoremate = line.match(/score mate (-?\d+)/);
        const pvMatch   = line.match(/ pv (.+)/);
        if (depth) document.getElementById('engineDepth').innerText = depth[1];
        if (nps)   document.getElementById('engineNps').innerText   = parseInt(nps[1]).toLocaleString();
        if (nodes) document.getElementById('engineNodes').innerText = parseInt(nodes[1]).toLocaleString();
        if (multipv && pvMatch) {
          const rank  = parseInt(multipv[1]);
          const moves = pvMatch[1].trim().split(' ').slice(0, 5);
          let score   = '—';
          if (scorecp)   score = (parseInt(scorecp[1]) / 100).toFixed(2);
          if (scoremate) score = 'M' + Math.abs(parseInt(scoremate[1]));
          pvLines[rank] = { score, moves };
          renderMultiPV();
          if (rank === 1) renderPVLine(pvMatch[1].trim().split(' ').slice(0, 8));
        }
      }
      if (line.startsWith('bestmove')) {
        // hide thinking indicator
        const thinking = document.getElementById('engineThinking');
        if (thinking) thinking.style.display = 'none';

        const match = line.match(/bestmove\s+(\w+)/);
        if (match && match[1] !== '(none)') {
          drawArrow(match[1].substring(0, 2), match[1].substring(2, 4));
        }
        const history = engineGame.history({ verbose: true });
        if (history.length > 0) {
          const lastMove = history[history.length - 1];
          const isWhite  = lastMove.color === 'w';
          const cpMatch  = line.match(/score cp (-?\d+)/);
          const newScore = cpMatch ? parseInt(cpMatch[1]) / 100 : lastEvalScore;
          const classify = classifyMove(lastEvalScore, newScore, isWhite);
          lastEvalScore  = newScore;
          const san = engineGame.history();
          evalHistory.push({ label: san[san.length - 1] || '—', score: lastEvalScore });
          drawEvalGraph();
          if (classify.badge) showMoveClassification(classify);
        }
      }
    };

    engine.onerror = function(e) { console.warn('Stockfish failed:', e); engine = null; };
  } catch(e) {
    console.warn('Worker blocked:', e);
    engine = null;
  }

  setTimeout(() => engineBoard.resize(), 500);
}

function analyzeEnginePosition() {
  if (!engine) return;
  pvLines = {};
  engine.postMessage('stop');
  engine.postMessage('setoption name MultiPV value 3');
  engine.postMessage('position fen ' + engineGame.fen());
  engine.postMessage('go depth 15');

  // show thinking indicator
  const thinking = document.getElementById('engineThinking');
  if (thinking) thinking.style.display = 'flex';
}

function updateEvalBar(score) {
  score = Math.max(-10, Math.min(10, score));
  const percentage  = 50 + (score * 5);
  const scoreLabel  = score > 0 ? '+' + score.toFixed(1) : score === 0 ? '0.0' : score.toFixed(1);
  const isWhiteAhead = score >= 0;

  // engine eval bar
  const engineFill = document.getElementById('engineEvalFill');
  const engineText = document.getElementById('engineEvalText');
  if (engineFill) engineFill.style.height = percentage + '%';
  if (engineText) {
    engineText.innerText = scoreLabel;
    engineText.style.bottom = isWhiteAhead ? 'auto' : '4px';
    engineText.style.top    = isWhiteAhead ? '4px'  : 'auto';
    engineText.style.color  = isWhiteAhead ? '#1a1a1a' : '#f1f5f9';
  }

  // profile eval bar
  const evalBar   = document.getElementById('evalBar');
  const evalScore = document.getElementById('evalScore');
  if (evalBar) evalBar.style.height = percentage + '%';
  if (evalScore) {
    evalScore.innerText = scoreLabel;
    evalScore.style.bottom = isWhiteAhead ? 'auto' : '4px';
    evalScore.style.top    = isWhiteAhead ? '4px'  : 'auto';
    evalScore.style.color  = isWhiteAhead ? '#e2e8f0' : '#1a1a1a';
  }

  // score display in stats bar
  const scoreDisplay = document.getElementById('engineScoreDisplay');
  if (scoreDisplay) {
    scoreDisplay.innerText = scoreLabel;
    scoreDisplay.style.color = score > 0.5 ? '#86efac' : score < -0.5 ? '#fca5a5' : 'var(--accent)';
  }
}

function nextEngineMove() {
  if (!engineBoard || !engineGame) return;
  if (engineMoveHistory.length === 0) return;
  const move = engineMoveHistory.pop();
  engineGame.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
  engineBoard.position(engineGame.fen());
  playMoveSound(move);
  highlightLastMove(move.from, move.to);
  renderEngineMoves();
  debouncedAnalyze();
}

function prevEngineMove() {
  if (!engineBoard || !engineGame) return;
  const undo = engineGame.undo();
  if (!undo) return;
  engineMoveHistory.push(undo);
  engineBoard.position(engineGame.fen());
  playMoveSound(undo);
  highlightLastMove(undo.from, undo.to);
  renderEngineMoves();
  debouncedAnalyze();
}

function renderEngineMoves() {
  const movesDiv = document.getElementById('engineMoves');
  if (!movesDiv) return;

  const fragment = document.createDocumentFragment();
  const history  = engineGame.history({ verbose: true });
  const total    = history.length;

  for (let i = 0; i < history.length; i += 2) {
    const row    = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.flexWrap = 'wrap';

    const number = document.createElement('span');
    number.className = 'move-number';
    number.innerText = `${Math.floor(i / 2) + 1}.`;
    row.appendChild(number);

    const white = document.createElement('span');
    white.className = 'move' + (i === total - 1 ? ' move-current' : '');
    white.innerText = history[i].san;
    row.appendChild(white);

    if (history[i + 1]) {
      const black = document.createElement('span');
      black.className = 'move' + (i + 1 === total - 1 ? ' move-current' : '');
      black.innerText = history[i + 1].san;
      row.appendChild(black);
    }
    fragment.appendChild(row);
  }

  movesDiv.innerHTML = '';
  movesDiv.appendChild(fragment);
  movesDiv.scrollTop = movesDiv.scrollHeight;

  // flash the last move
  const lastMove = movesDiv.querySelector('.move-current');
  if (lastMove) {
    lastMove.classList.add('move-flash');
    setTimeout(() => lastMove.classList.remove('move-flash'), 500);
  }
}

function resetEngineBoard() {
  if (!engineGame || !engineBoard) return;
  engineGame.reset();
  engineMoveHistory = [];
  pvLines           = {};
  lastEvalScore     = 0;
  evalHistory       = [];
  drawEvalGraph();
  boardOrientation  = 'white';
  engineBoard.orientation('white');
  engineBoard.position('start');
  clearHighlights();
  updateEvalBar(0);
  renderEngineMoves();
  clearArrow();
  const eDepth   = document.getElementById('engineDepth');
  const eNps     = document.getElementById('engineNps');
  const eNodes   = document.getElementById('engineNodes');
  const eScore   = document.getElementById('engineScoreDisplay');
  const ePV      = document.getElementById('pvLine');
  const eOpening = document.getElementById('openingName');
  const eEvalFill= document.getElementById('engineEvalFill');
  const eEvalText= document.getElementById('engineEvalText');
  const eThink   = document.getElementById('engineThinking');
  const bestBar  = document.getElementById('bestMoveBar');

  if (eDepth)    eDepth.innerText    = '—';
  if (eNps)      eNps.innerText      = '—';
  if (eNodes)    eNodes.innerText    = '—';
  if (eScore)    eScore.innerText    = '—';
  if (ePV)       ePV.innerHTML       = '<span>Best Line</span>';
  if (eOpening)  eOpening.innerText  = 'Opening: —';
  if (eEvalFill) eEvalFill.style.height = '50%';
  if (eEvalText) eEvalText.innerText = '0.0';
  if (eThink)    eThink.style.display = 'none';
  if (bestBar)   bestBar.remove();
  document.getElementById('multiPV').innerHTML = '';
}

function flipEngineBoard() {
  if (!engineBoard) return;
  boardOrientation = boardOrientation === 'white' ? 'black' : 'white';
  engineBoard.orientation(boardOrientation);
}

function loadPGN() {
  const pgn = document.getElementById('pgnInput').value.trim();
  if (!pgn) { toast('Paste a PGN first', 'info'); return; }
  const chess = new Chess();
  if (!chess.load_pgn(pgn)) { toast('Invalid PGN format', 'error'); return; }
  engineGame = chess;
  engineBoard.position(engineGame.fen());
  engineMoveHistory = [];
  pvLines           = {};
  lastEvalScore     = 0;
  clearHighlights();
  clearArrow();
  renderEngineMoves();
  updateEvalBar(0);
  document.getElementById('pgnInput').value = '';
  if (engine) debouncedAnalyze();
  updateOpeningName();
  toast('PGN loaded! ♟', 'success');
}

function loadFEN() {
  const fen = document.getElementById('fenInput').value.trim();
  if (!fen) { toast('Paste a FEN first', 'info'); return; }
  const chess = new Chess();
  if (!chess.load(fen)) { toast('Invalid FEN format', 'error'); return; }
  engineGame = chess;
  engineBoard.position(engineGame.fen());
  engineMoveHistory = [];
  pvLines           = {};
  lastEvalScore     = 0;
  clearHighlights();
  clearArrow();
  renderEngineMoves();
  updateEvalBar(0);
  document.getElementById('fenInput').value = '';
  if (engine) debouncedAnalyze();
}

function saveAnalysis() {
  const history = engineGame.history({ verbose: true });
  if (history.length === 0) { toast('No moves to save', 'info'); return; }
  let text = 'Chess Analysis\n==============\n\nMoves:\n';
  history.forEach((move, i) => {
    const moveNum = Math.floor(i / 2) + 1;
    if (i % 2 === 0) text += `${moveNum}. `;
    text += `${move.san} `;
    if (i % 2 === 1) text += '\n';
  });
  text += '\n\nFEN: ' + engineGame.fen();
  text += '\nPGN: ' + engineGame.pgn();
  const blob = new Blob([text], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'chess-analysis.txt';
  a.click();
  URL.revokeObjectURL(url);
}

function clearHighlights() {
  document.querySelectorAll('.highlight-from, .highlight-to').forEach(el => {
    el.classList.remove('highlight-from', 'highlight-to');
  });
}

function highlightLastMove(from, to) {
  clearHighlights();
  // try engine board first, then profile board
  const boards = ['engineBoard', 'board'];
  boards.forEach(boardId => {
    const boardEl = document.getElementById(boardId);
    if (!boardEl) return;
    const fromSquare = boardEl.querySelector(`.square-${from}`);
    const toSquare   = boardEl.querySelector(`.square-${to}`);
    if (fromSquare) fromSquare.classList.add('highlight-from');
    if (toSquare)   toSquare.classList.add('highlight-to');
  });
}

function initProfileEngine() {
  if (profileEngine) return;
  try {
    const stockfishUrl = 'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js';
    const blob = new Blob([`importScripts('${stockfishUrl}');`], { type: 'application/javascript' });
    profileEngine = new Worker(URL.createObjectURL(blob));
    profileEngine.postMessage('uci');
    profileEngine.onmessage = function(event) {
      const line = event.data;
      if (line.includes('score cp')) {
        const match = line.match(/score cp (-?\d+)/);
        if (match) updateEvalBar(parseInt(match[1]) / 100);
      }
      if (line.includes('score mate')) {
        const match = line.match(/score mate (-?\d+)/);
        if (match) updateEvalBar(parseInt(match[1]) > 0 ? 10 : -10);
      }
    };
    profileEngine.onerror = function(e) { console.warn('Profile engine failed:', e); profileEngine = null; };
  } catch(e) {
    console.warn('Profile engine blocked:', e);
    profileEngine = null;
  }
}

function classifyMove(prevScore, newScore, isWhite) {
  const diff = isWhite ? prevScore - newScore : newScore - prevScore;
  if (diff >= 3)    return { label: 'Blunder',    class: 'move-blunder',    badge: '??' };
  if (diff >= 1.5)  return { label: 'Mistake',    class: 'move-mistake',    badge: '?'  };
  if (diff >= 0.5)  return { label: 'Inaccuracy', class: 'move-inaccuracy', badge: '?!' };
  if (diff >= -0.1) return { label: 'Good',       class: 'move-good',       badge: ''   };
  if (diff < -0.1)  return { label: 'Excellent',  class: 'move-excellent',  badge: '!'  };
  return { label: '', class: '', badge: '' };
}

function showMoveClassification(classify) {
  const movesDiv = document.getElementById('engineMoves');
  if (!movesDiv) return;
  const allMoves = movesDiv.querySelectorAll('.move');
  if (allMoves.length === 0) return;
  const lastMoveEl = allMoves[allMoves.length - 1];
  lastMoveEl.classList.add(classify.class);
  if (classify.badge) {
    const badge = document.createElement('span');
    badge.className = 'move-badge';
    badge.innerText = classify.badge;
    lastMoveEl.appendChild(badge);
  }
}

function renderMultiPV() {
  const container = document.getElementById('multiPV');
  if (!container) return;
  container.innerHTML = Object.keys(pvLines).sort().map(rank => {
    const line  = pvLines[rank];
    const score = parseFloat(line.score) >= 0 ? '+' + line.score : line.score;
    return `
      <div class="pv-line">
        <span class="pv-rank">${rank}</span>
        <span class="pv-score">${line.score.toString().startsWith('M') ? line.score : score}</span>
        <span class="pv-moves">${line.moves.join(' ')}</span>
      </div>
    `;
  }).join('');
}

function renderPVLine(moves) {
  const container = document.getElementById('pvLine');
  if (!container) return;
  container.innerHTML = '<span>Best Line:</span>';
  const chess = new Chess();
  engineGame.history({ verbose: true }).forEach(m => {
    chess.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' });
  });
  moves.forEach((uci, i) => {
    const from   = uci.substring(0, 2);
    const to     = uci.substring(2, 4);
    const promo  = uci[4] || 'q';
    const result = chess.move({ from, to, promotion: promo });
    if (!result) return;
    const moveNum = Math.floor((engineGame.history().length + i) / 2) + 1;
    const isWhite = (engineGame.history().length + i) % 2 === 0;
    const span = document.createElement('span');
    span.className = 'pv-move';
    span.innerText = (isWhite ? `${moveNum}. ` : '') + result.san;
    container.appendChild(span);
  });
}

function drawArrow(from, to) {
  const canvas = document.getElementById('arrowCanvas');
  const ctx    = canvas.getContext('2d');
  const size   = canvas.width / 8;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const files   = 'abcdefgh';
  const fromX   = (files.indexOf(from[0]) + 0.5) * size;
  const fromY   = (8 - parseInt(from[1]) + 0.5) * size;
  const toX     = (files.indexOf(to[0]) + 0.5) * size;
  const toY     = (8 - parseInt(to[1]) + 0.5) * size;
  const angle   = Math.atan2(toY - fromY, toX - fromX);
  const headLen = size * 0.35;
  const dist    = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
  const shortEnd = dist - headLen * 0.8;
  const endX    = fromX + Math.cos(angle) * shortEnd;
  const endY    = fromY + Math.sin(angle) * shortEnd;
  ctx.save();
  ctx.shadowColor  = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur   = 6;
  ctx.fillStyle    = 'rgba(0,163,108,0.85)';
  ctx.strokeStyle  = 'rgba(0,163,108,0.85)';
  ctx.lineWidth    = size * 0.18;
  ctx.lineCap      = 'round';
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 7), toY - headLen * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(toX - headLen * 0.6 * Math.cos(angle), toY - headLen * 0.6 * Math.sin(angle));
  ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 7), toY - headLen * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function clearArrow() {
  const canvas = document.getElementById('arrowCanvas');
  if (!canvas) return;
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

const OPENINGS = [
  { moves: 'e4 e5', name: "Open Game" },
  { moves: 'e4 e5 Nf3 Nc6 Bb5', name: "Ruy Lopez" },
  { moves: 'e4 e5 Nf3 Nc6 Bc4', name: "Italian Game" },
  { moves: 'e4 e5 Nf3 Nc6 d4', name: "Scotch Game" },
  { moves: 'e4 e5 Nf3 f6', name: "Damiano Defence" },
  { moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5', name: "Giuoco Piano" },
  { moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6', name: "Two Knights Defence" },
  { moves: 'e4 c5', name: "Sicilian Defence" },
  { moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6', name: "Sicilian Dragon" },
  { moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', name: "Sicilian Najdorf" },
  { moves: 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6', name: "Sicilian Scheveningen" },
  { moves: 'e4 e6', name: "French Defence" },
  { moves: 'e4 e6 d4 d5 Nc3', name: "French Classical" },
  { moves: 'e4 e6 d4 d5 e5', name: "French Advance" },
  { moves: 'e4 c6', name: "Caro-Kann Defence" },
  { moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4', name: "Caro-Kann Classical" },
  { moves: 'e4 d5', name: "Scandinavian Defence" },
  { moves: 'e4 d5 exd5 Qxd5', name: "Scandinavian Classical" },
  { moves: 'e4 Nf6', name: "Alekhine Defence" },
  { moves: 'e4 g6', name: "Modern Defence" },
  { moves: 'd4 d5', name: "Closed Game" },
  { moves: 'd4 d5 c4', name: "Queen's Gambit" },
  { moves: 'd4 d5 c4 dxc4', name: "Queen's Gambit Accepted" },
  { moves: 'd4 d5 c4 e6', name: "Queen's Gambit Declined" },
  { moves: 'd4 d5 c4 c6', name: "Slav Defence" },
  { moves: 'd4 Nf6 c4 e6 Nc3 Bb4', name: "Nimzo-Indian Defence" },
  { moves: 'd4 Nf6 c4 g6 Nc3 d5', name: "Grünfeld Defence" },
  { moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6', name: "King's Indian Defence" },
  { moves: 'd4 Nf6 c4 e6 g3 d5', name: "Catalan Opening" },
  { moves: 'd4 f5', name: "Dutch Defence" },
  { moves: 'Nf3 d5 c4', name: "Réti Opening" },
  { moves: 'c4', name: "English Opening" },
  { moves: 'c4 e5', name: "English Opening - Reversed Sicilian" },
  { moves: 'e4 e5 f4', name: "King's Gambit" },
  { moves: 'e4 e5 f4 exf4', name: "King's Gambit Accepted" },
  { moves: 'e4 e5 f4 Bc5', name: "King's Gambit Declined" },
  { moves: 'd4 d5 Bf4', name: "London System" },
  { moves: 'Nf3 Nf6 g3', name: "King's Indian Attack" },
  { moves: 'e4 e5 Nc3', name: "Vienna Game" },
  { moves: 'e4 e5 d4 exd4 c3', name: "Danish Gambit" },
  { moves: 'e4 e5 Nf3 Nf6', name: "Petrov's Defence" },
  { moves: 'e4 e5 Nf3 d6', name: "Philidor Defence" },
];

// ─── GLOBAL SEARCH ────────────────────────────────────────
function _globalSearchHandler() {
  const query   = document.getElementById('globalSearch').value.trim().toLowerCase();
  const results = document.getElementById('searchResults');
  const clear   = document.getElementById('searchClear');

  if (!query) {
    results.classList.add('hidden');
    clear.style.display = 'none';
    return;
  }

  clear.style.display = 'block';
  results.classList.remove('hidden');
  results.innerHTML = '';

  let found = false;

  const matchedPlayers = players.filter(p =>
    p.name.toLowerCase().includes(query) || (p.bio && p.bio.toLowerCase().includes(query))
  );
  if (matchedPlayers.length > 0) {
    found = true;
    const header = document.createElement('div');
    header.className = 'search-group-header';
    header.innerText = '♟ Players';
    results.appendChild(header);
    matchedPlayers.slice(0, 3).forEach(p => {
      const index = players.indexOf(p);
      const div   = document.createElement('div');
      div.className = 'search-result-item';
      div.innerHTML = `
        <img src="${p.image || 'https://placehold.co/80x80/1e293b/38bdf8?text=♟'}" loading="lazy" onerror="this.src='https://placehold.co/80x80/1e293b/38bdf8?text=♟'">
        <div><strong>${sanitize(p.name)}</strong><span>${p.title || 'Player'}</span></div>
      `;
      div.onclick = () => { openProfile(index); clearGlobalSearch(); };
      results.appendChild(div);
    });
  }

  const matchedArticles = articles.filter(a =>
    a.title.toLowerCase().includes(query) || (a.content && a.content.toLowerCase().includes(query))
  );
  if (matchedArticles.length > 0) {
    found = true;
    const header = document.createElement('div');
    header.className = 'search-group-header';
    header.innerText = '📰 Articles';
    results.appendChild(header);
    matchedArticles.slice(0, 3).forEach(a => {
      const div = document.createElement('div');
      div.className = 'search-result-item';
      div.innerHTML = `
        <img src="${a.image || 'https://placehold.co/80x80/1e293b/38bdf8?text=♟'}" loading="lazy" onerror="this.src='https://placehold.co/80x80/1e293b/38bdf8?text=♟'">
        <div><strong>${sanitize(a.title)}</strong><span>Article</span></div>
      `;
      div.onclick = () => { openArticleById(a.id); clearGlobalSearch(); };
      results.appendChild(div);
    });
  }

  const matchedPDFs = pdfs.filter(p => p.name.toLowerCase().includes(query));
  if (matchedPDFs.length > 0) {
    found = true;
    const header = document.createElement('div');
    header.className = 'search-group-header';
    header.innerText = '📚 PDFs';
    results.appendChild(header);
    matchedPDFs.slice(0, 3).forEach(p => {
      const div = document.createElement('div');
      div.className = 'search-result-item';
      div.innerHTML = `
        <div class="search-pdf-icon">📄</div>
        <div><strong>${sanitize(p.name)}</strong><span>${p.category || 'PDF'}</span></div>
      `;
      div.onclick = () => { window.open(p.url, '_blank'); clearGlobalSearch(); };
      results.appendChild(div);
    });
  }

  if (!found) results.innerHTML = '<div class="search-no-results">No results found</div>';
}

function clearGlobalSearch() {
  document.getElementById('globalSearch').value = '';
  document.getElementById('searchResults').classList.add('hidden');
  document.getElementById('searchClear').style.display = 'none';
}

const CHESS_QUOTES = [
  { quote: "Chess is life in miniature. Chess is struggle, chess is battles.", author: "Garry Kasparov" },
  { quote: "Every chess master was once a beginner.", author: "Irving Chernev" },
  { quote: "Chess is not about the next move, but about the plan.", author: "Mikhail Botvinnik" },
  { quote: "The most important feature of the chess position is the activity of the pieces.", author: "Garry Kasparov" },
  { quote: "Chess is the art of analysis.", author: "Mikhail Botvinnik" },
  { quote: "I have always a slight feeling of pity for the man who has no knowledge of chess.", author: "Siegbert Tarrasch" },
  { quote: "Chess is everything: art, science, and sport.", author: "Anatoly Karpov" },
  { quote: "No price is too great for the scalp of an enemy King.", author: "Koblentz" },
  { quote: "Chess holds its master in its own bonds, shackling the mind and brain so that the inner freedom of the very strongest must suffer.", author: "Albert Einstein" },
  { quote: "When you see a good move, look for a better one.", author: "Emanuel Lasker" },
  { quote: "The game of chess is not merely an idle amusement.", author: "Benjamin Franklin" },
  { quote: "Chess is a war over the board. The object is to crush the opponent's mind.", author: "Bobby Fischer" },
  { quote: "Tactics flow from a superior position.", author: "Bobby Fischer" },
  { quote: "A bad plan is better than no plan at all.", author: "Frank Marshall" },
  { quote: "Chess is the gymnasium of the mind.", author: "Blaise Pascal" },
  { quote: "In chess, as in life, opportunity strikes but once.", author: "Victor Korchnoi" },
  { quote: "The pin is mightier than the sword.", author: "Fred Reinfeld" },
  { quote: "Chess is mental torture.", author: "Garry Kasparov" },
  { quote: "Play the opening like a book, the middlegame like a magician, and the endgame like a machine.", author: "Rudolf Spielmann" },
  { quote: "Even the best grandmaster needs to remain humble before the mysteries of chess.", author: "Viswanathan Anand" },
];

function renderQuoteOfDay() {
  const container = document.getElementById('quoteOfDay');
  if (!container) return;
  const day   = new Date().getDate();
  const quote = CHESS_QUOTES[day % CHESS_QUOTES.length];
  container.innerHTML = `
    <div class="quote-inner">
      <div class="quote-mark">"</div>
      <p class="quote-text">${quote.quote}</p>
      <div class="quote-author">— ${quote.author}</div>
      <button class="quote-refresh" onclick="renderRandomQuote()">↻ New Quote</button>
    </div>
  `;
}

function renderRandomQuote() {
  const container = document.getElementById('quoteOfDay');
  if (!container) return;
  const quote = CHESS_QUOTES[Math.floor(Math.random() * CHESS_QUOTES.length)];
  container.classList.add('quote-fade');
  setTimeout(() => {
    container.innerHTML = `
      <div class="quote-inner">
        <div class="quote-mark">"</div>
        <p class="quote-text">${quote.quote}</p>
        <div class="quote-author">— ${quote.author}</div>
        <button class="quote-refresh" onclick="renderRandomQuote()">↻ New Quote</button>
      </div>
    `;
    container.classList.remove('quote-fade');
  }, 300);
}

function updateStats() {
  const totalGames = players.reduce((acc, p) => acc + (p.games ? p.games.length : 0), 0);
  const statPlayers  = document.getElementById('statPlayers');
  const statGames    = document.getElementById('statGames');
  const statArticles = document.getElementById('statArticles');
  const statPDFs     = document.getElementById('statPDFs');
  if (statPlayers)  animateCount(statPlayers,  players.length);
  if (statGames)    animateCount(statGames,    totalGames);
  if (statArticles) animateCount(statArticles, articles.length);
  if (statPDFs)     animateCount(statPDFs,     pdfs.length);
}

function updateHeroStats() {
  const totalGames = players.reduce((acc, p) => acc + (p.games ? p.games.length : 0), 0);
  const playerEl   = document.getElementById('heroPlayerCount');
  const gameEl     = document.getElementById('heroGameCount');
  const articleEl  = document.getElementById('heroArticleCount');
  const pdfEl      = document.getElementById('heroPDFCount');
  if (playerEl)  animateCount(playerEl,  players.length);
  if (gameEl)    animateCount(gameEl,    totalGames);
  if (articleEl) animateCount(articleEl, articles.length);
  if (pdfEl)     animateCount(pdfEl,     pdfs.length);
}

function animateCount(el, target) {
  let current = 0;
  const step  = Math.ceil(target / 30);
  const timer = setInterval(() => {
    current += step;
    if (current >= target) { current = target; clearInterval(timer); }
    el.innerText = current;
  }, 40);
}

function showSkeletons(containerId, count, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const div = document.createElement('div');
    if (type === 'featured') {
      div.innerHTML = `
        <div class="skeleton-featured">
          <div class="skeleton skeleton-img"></div>
          <div class="skeleton-info">
            <div class="skeleton skeleton-title"></div>
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line short"></div>
          </div>
        </div>`;
    } else if (type === 'player') {
      div.innerHTML = `
        <div class="skeleton-player-card">
          <div class="skeleton skeleton-avatar"></div>
          <div class="skeleton-info">
            <div class="skeleton skeleton-title"></div>
            <div class="skeleton skeleton-line"></div>
          </div>
        </div>`;
    } else if (type === 'article') {
      div.innerHTML = `
        <div class="skeleton-article">
          <div class="skeleton skeleton-article-img"></div>
          <div class="skeleton-info">
            <div class="skeleton skeleton-title"></div>
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line short"></div>
          </div>
        </div>`;
    }
    fragment.appendChild(div);
  }
  container.appendChild(fragment);
}

function togglePlayerMenu(event, index) {
  event.stopPropagation();
  const menu = document.getElementById(`playerMenu-${index}`);
  closeAllPlayerMenus(menu);
  menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

function closeAllPlayerMenus(except) {
  document.querySelectorAll('.player-menu-dropdown').forEach(m => {
    if (m !== except) m.style.display = 'none';
  });
}

function updateOpeningName() {
  const history  = engineGame.history();
  const movesStr = history.join(' ');
  let bestMatch  = null;
  let bestLen    = 0;
  OPENINGS.forEach(opening => {
    if (movesStr.startsWith(opening.moves) && opening.moves.length > bestLen) {
      bestMatch = opening.name;
      bestLen   = opening.moves.length;
    }
  });
  const el = document.getElementById('openingName');
  if (el) {
    el.innerText = bestMatch ? bestMatch : 'Opening: —';
    // add glow if opening found
    if (bestMatch) {
      el.style.textShadow = '0 0 10px rgba(56,189,248,0.5)';
      setTimeout(() => { if (el) el.style.textShadow = ''; }, 1500);
    }
  }
}



function analyzeProfilePosition() {
  if (!profileEngine || !currentBoard) return;
  profileEngine.postMessage('isready');
  profileEngine.postMessage('position fen ' + currentBoard.chess.fen());
  profileEngine.postMessage('go depth 12');
}

// ─── PLAY VS COMPUTER ─────────────────────────────────────
let playBoard       = null;
let playGame        = null;
let playEngine      = null;
let playColor       = 'white';
let playDepth       = 4;
let blindfoldMode   = false;
let playMoveHistory = [];

function setPlayColor(color) {
  playColor = color;
  document.getElementById('playWhiteBtn').classList.toggle('active', color === 'white');
  document.getElementById('playBlackBtn').classList.toggle('active', color === 'black');
}

function setDifficulty(depth) {
  playDepth = depth;
  document.querySelectorAll('.play-diff-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
}

function startGame() {
  document.getElementById('playSettings').classList.add('hidden');
  document.getElementById('playArea').classList.remove('hidden');
  document.getElementById('playResult').classList.add('hidden');

  playGame = new Chess();
  playMoveHistory = [];

  playBoard = Chessboard('playBoard', {
    draggable: true,
    position: 'start',
    orientation: playColor,
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    onDrop: handlePlayDrop,
    onSnapEnd: () => playBoard.position(playGame.fen())
  });

  document.querySelector('#playBlackLabel span:nth-child(2)').innerText = playColor === 'white' ? 'Computer' : 'You';
  document.querySelector('#playWhiteLabel span:nth-child(2)').innerText = playColor === 'white' ? 'You'      : 'Computer';

  initPlayEngine();
  updatePlayStatus();

  if (playColor === 'black') {
    setTimeout(() => computerPlayMove(), 500);
  }
}

function handlePlayDrop(source, target) {
  if (playGame.turn() !== playColor[0]) return 'snapback';

  const move = playGame.move({ from: source, to: target, promotion: 'q' });
  if (!move) return 'snapback';

  playMoveHistory.push(move);
  playMoveSound(move);
  renderPlayMoves();
  updatePlayEval();
  updatePlayStatus();

  if (playGame.game_over()) { showPlayResult(); return; }

  // switch clock to computer after player moves
  if (clockRunning) startClock(playColor === 'white' ? 'b' : 'w');

  setTimeout(() => computerPlayMove(), 400);
}

function computerPlayMove() {
  if (!playEngine || playGame.game_over()) return;
  updatePlayStatus('Computer is thinking...');
  playEngine.postMessage('position fen ' + playGame.fen());
  playEngine.postMessage('go depth ' + playDepth);
}

function initPlayEngine() {
  if (playEngine) return;
  try {
    const url  = 'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js';
    const blob = new Blob([`importScripts('${url}');`], { type: 'application/javascript' });
    playEngine = new Worker(URL.createObjectURL(blob));
    playEngine.postMessage('uci');

    playEngine.onmessage = function(e) {
      const line = e.data;
      if (line.startsWith('bestmove')) {
        const match = line.match(/bestmove\s+(\w+)/);
        if (match && match[1] !== '(none)') {
          const from = match[1].substring(0, 2);
          const to   = match[1].substring(2, 4);
          const promo = match[1][4] || 'q';
          const move  = playGame.move({ from, to, promotion: promo });
          if (move) {
            playBoard.position(playGame.fen());
            playMoveHistory.push(move);
            playMoveSound(move);
            renderPlayMoves();
            updatePlayStatus();
            updatePlayEval();
            if (playGame.game_over()) showPlayResult();
          }
        }
      }
      if (line.includes('score cp')) {
        const m = line.match(/score cp (-?\d+)/);
        if (m) {
          const score = parseInt(m[1]) / 100;
          const pct   = 50 + Math.max(-10, Math.min(10, score)) * 5;
          const fill  = document.getElementById('playEvalFill');
          if (fill) fill.style.height = pct + '%';
        }
      }
    };
    playEngine.onerror = () => { playEngine = null; };
  } catch(e) { playEngine = null; }
}

function updatePlayStatus(msg) {
  const el = document.getElementById('playStatus');
  if (!el) return;
  if (msg) { el.innerText = msg; return; }
  if (playGame.in_checkmate()) { el.innerText = '♟ Checkmate!'; return; }
  if (playGame.in_draw())      { el.innerText = '½ Draw!';      return; }
  if (playGame.in_check())     { el.innerText = '⚠️ Check!';    return; }
  el.innerText = playGame.turn() === playColor[0] ? 'Your turn' : 'Computer is thinking...';
}

function updatePlayEval() {
  if (!playEngine) return;
  playEngine.postMessage('position fen ' + playGame.fen());
  playEngine.postMessage('go depth 6');
}

function showPlayResult() {
  const el = document.getElementById('playResult');
  el.classList.remove('hidden');
  if (playGame.in_checkmate()) {
    const winner = playGame.turn() === playColor[0] ? 'Computer wins! 😢' : 'You win! 🎉';
    el.innerHTML = `<div class="play-result-msg">${winner}</div><button onclick="resetPlayGame()">Play Again</button>`;
    if (playGame.turn() !== playColor[0]) launchConfetti();
  } else {
    el.innerHTML = `<div class="play-result-msg">½ Draw!</div><button onclick="resetPlayGame()">Play Again</button>`;
  }
}

function renderPlayMoves() {
  const div  = document.getElementById('playMoves');
  if (!div) return;
  const hist = playGame.history();
  div.innerHTML = '';
  for (let i = 0; i < hist.length; i += 2) {
    const row = document.createElement('div');
    const num = document.createElement('span');
    num.className = 'move-number';
    num.innerText = `${Math.floor(i/2)+1}.`;
    row.appendChild(num);
    const w = document.createElement('span');
    w.className = 'move'; w.innerText = hist[i]; row.appendChild(w);
    if (hist[i+1]) {
      const b = document.createElement('span');
      b.className = 'move'; b.innerText = hist[i+1]; row.appendChild(b);
    }
    div.appendChild(row);
  }
  div.scrollTop = div.scrollHeight;
}

function undoPlayMove() {
  if (playGame.history().length < 2) return;
  playGame.undo(); playGame.undo();
  playBoard.position(playGame.fen());
  renderPlayMoves();
  updatePlayStatus();
}

function toggleBlindfold() {
  blindfoldMode = !blindfoldMode;
  const board = document.getElementById('playBoard');
  board.querySelectorAll('img').forEach(img => {
    img.style.opacity = blindfoldMode ? '0' : '1';
  });
  toast(blindfoldMode ? '👁 Blindfold ON' : '👁 Blindfold OFF', 'info');
}

function resetPlayGame() {
  document.getElementById('playSettings').classList.remove('hidden');
  document.getElementById('playArea').classList.add('hidden');
  document.getElementById('playResult').classList.add('hidden');
  if (playBoard) { playBoard.destroy(); playBoard = null; }
  playGame = null;
  blindfoldMode = false;
}

// ─── PUZZLES ──────────────────────────────────────────────
let puzzleBoard    = null;
let puzzleGame     = null;
let puzzleIndex    = 0;
let puzzleSolved   = false;
let currentPuzzle  = null;

const PUZZLES = [
  {
    id: 1,
    name: "Mate in 1",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1",
    solution: ['h5f7'],
    toMove: 'white',
    hint: 'The queen and bishop create a deadly combination'
  },
  {
    id: 2,
    name: "Fork Tactic",
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2BPP3/5N2/PPP2PPP/RNBQK2R b KQkq - 0 1",
    solution: ['c6d4'],
    toMove: 'black',
    hint: 'A knight in the center can attack multiple pieces'
  },
  {
    id: 3,
    name: "Pin the Piece",
    fen: "r1bqk2r/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 1",
    solution: ['c4b5'],
    toMove: 'white',
    hint: 'Pin the knight to the king'
  },
  {
    id: 4,
    name: "Back Rank Mate",
    fen: "6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1",
    solution: ['d1d8'],
    toMove: 'white',
    hint: 'The back rank is weak'
  },
  {
    id: 5,
    name: "Skewer Tactic",
    fen: "r4rk1/ppp2ppp/2n5/3pp3/1b2P1Q1/2NP4/PPP2PPP/R1B1K2R w KQ - 0 1",
    solution: ['g4d7'],
    toMove: 'white',
    hint: 'Attack through the more valuable piece'
  },
];

function initPuzzle() {
  if (puzzleBoard) return;
  loadPuzzle(puzzleIndex);
}

function loadPuzzle(idx) {
  currentPuzzle = PUZZLES[idx % PUZZLES.length];
  puzzleSolved  = false;

  document.getElementById('puzzleFeedback').classList.add('hidden');
  document.getElementById('puzzleNextBtn').classList.add('hidden');
  document.getElementById('puzzleMoves').innerHTML = '';

  document.getElementById('puzzleInfo').innerHTML = `
    <div class="puzzle-meta">
      <span class="puzzle-num">Puzzle ${idx + 1} of ${PUZZLES.length}</span>
      <span class="puzzle-name">${currentPuzzle.name}</span>
      <span class="puzzle-turn">${currentPuzzle.toMove === 'white' ? '♔ White to move' : '♚ Black to move'}</span>
    </div>
  `;

  document.getElementById('puzzlePrompt').innerHTML = `
    <p>Find the best move for <strong>${currentPuzzle.toMove}</strong>.</p>
  `;

  puzzleGame = new Chess(currentPuzzle.fen);

  if (puzzleBoard) puzzleBoard.destroy();

  puzzleBoard = Chessboard('puzzleBoard', {
    draggable: true,
    position: currentPuzzle.fen,
    orientation: currentPuzzle.toMove,
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    onDrop: handlePuzzleDrop,
    onSnapEnd: () => puzzleBoard.position(puzzleGame.fen())
  });

  setTimeout(() => puzzleBoard.resize(), 100);
}

function handlePuzzleDrop(source, target) {
  if (puzzleSolved) return 'snapback';

  const uci  = source + target;
  const move = puzzleGame.move({ from: source, to: target, promotion: 'q' });
  if (!move) return 'snapback';

  const fb = document.getElementById('puzzleFeedback');
  fb.classList.remove('hidden', 'puzzle-correct', 'puzzle-wrong');

  if (uci === currentPuzzle.solution[0]) {
    puzzleSolved = true;
    fb.className = 'puzzle-feedback puzzle-correct';
    fb.innerHTML = '✅ Correct! Well done!';
    playMoveSound(move);
    launchConfetti();
    document.getElementById('puzzleNextBtn').classList.remove('hidden');
    toast('Puzzle solved! 🧩', 'success');
    incrementStreak();
  } else {
    fb.className = 'puzzle-feedback puzzle-wrong';
    fb.innerHTML = '❌ Not quite. Try again!';
    setTimeout(() => {
      puzzleGame.undo();
      puzzleBoard.position(puzzleGame.fen());
    }, 600);
  }
}

function showPuzzleHint() {
  toast(`💡 Hint: ${currentPuzzle.hint}`, 'info');
}

function loadNextPuzzle() {
  puzzleIndex = (puzzleIndex + 1) % PUZZLES.length;
  loadPuzzle(puzzleIndex);
}

// ─── OPENING TRAINER ──────────────────────────────────────
let openingBoard      = null;
let openingMoveIndex  = 0;
let currentOpening    = null;

const OPENING_DATA = {
  ruy_lopez: {
    name: 'Ruy Lopez',
    desc: 'One of the oldest and most classic chess openings. White attacks the knight defending the e5 pawn.',
    moves: ['e4','e5','Nf3','Nc6','Bb5'],
    tips:  ['Control the center with e4','Develop the knight to f3','Pin the knight with Bb5 — this is the Ruy Lopez!','Black defends the e5 pawn','The bishop puts pressure on the knight']
  },
  italian: {
    name: 'Italian Game',
    desc: 'A classical opening aiming for fast development and center control.',
    moves: ['e4','e5','Nf3','Nc6','Bc4'],
    tips:  ['Control the center','Develop the knight','The bishop targets the f7 pawn — a key weakness','Black mirrors development','Bc4 aims at the heart of Black\'s position']
  },
  sicilian_najdorf: {
    name: 'Sicilian Najdorf',
    desc: 'The most popular chess opening at the highest level. Black fights for the center from the flank.',
    moves: ['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3','a6'],
    tips:  ['e4 — control center','c5 — Sicilian! Fight for d4','Nf3 — develop and attack c5','d6 — support e5 later','d4 — open the center','cxd4 — exchange to weaken d4','Nxd4 — recapture with piece','Nf6 — develop and attack e4','Nc3 — defend e4','a6 — the Najdorf! Prevent Nb5']
  },
  sicilian_dragon: {
    name: 'Sicilian Dragon',
    desc: 'An aggressive variation where Black fianchettoes the bishop for long-term pressure.',
    moves: ['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3','g6'],
    tips:  ['e4','c5 — Sicilian','Nf3','d6','d4 — fight for center','cxd4','Nxd4','Nf6','Nc3','g6 — the Dragon! Fianchetto follows']
  },
  french: {
    name: 'French Defence',
    desc: 'A solid defence where Black creates a strong pawn chain but can have a passive bishop.',
    moves: ['e4','e6','d4','d5','Nc3'],
    tips:  ['e4','e6 — French! Prepares d5','d4 — White builds a center','d5 — challenge the center','Nc3 — defend e4 and prepare e5']
  },
  caro_kann: {
    name: 'Caro-Kann Defence',
    desc: 'A solid and classical defence. Black supports d5 with c6 before challenging the center.',
    moves: ['e4','c6','d4','d5','Nc3','dxe4','Nxe4'],
    tips:  ['e4','c6 — prepare d5','d4','d5 — challenge center','Nc3 — defend e4','dxe4 — exchange','Nxe4 — recapture, classical position']
  },
  queens_gambit: {
    name: "Queen's Gambit",
    desc: "One of the oldest openings. White offers a pawn to gain center control.",
    moves: ['d4','d5','c4'],
    tips:  ['d4 — control center','d5 — mirror','c4 — the gambit! Offer a pawn for center control']
  },
  kings_indian: {
    name: "King's Indian Defence",
    desc: 'A hypermodern defence where Black lets White build a center then attacks it.',
    moves: ['d4','Nf6','c4','g6','Nc3','Bg7','e4','d6'],
    tips:  ['d4','Nf6 — develop','c4','g6 — fianchetto setup','Nc3','Bg7 — the fianchetto bishop','e4 — big center','d6 — support e5 later']
  },
  london: {
    name: 'London System',
    desc: 'A solid and reliable system for White. Easy to learn and hard to beat.',
    moves: ['d4','d5','Nf3','Nf6','Bf4'],
    tips:  ['d4','d5','Nf3 — develop knight','Nf6 — mirror development','Bf4 — the London bishop, key piece']
  },
  scotch: {
    name: 'Scotch Game',
    desc: 'An aggressive opening where White immediately fights for the center with d4.',
    moves: ['e4','e5','Nf3','Nc6','d4','exd4','Nxd4'],
    tips:  ['e4','e5','Nf3','Nc6','d4 — the Scotch!','exd4 — accept','Nxd4 — recapture, open game']
  }
};

function loadOpening() {
  const key = document.getElementById('openingSelect').value;
  if (!key) return;

  currentOpening   = OPENING_DATA[key];
  openingMoveIndex = 0;

  document.getElementById('openingTrainerArea').classList.remove('hidden');
  document.getElementById('openingPlaceholder').classList.add('hidden');
  document.getElementById('openingName2').innerText = currentOpening.name;
  document.getElementById('openingDesc').innerText  = currentOpening.desc;

  if (openingBoard) openingBoard.destroy();

  openingBoard = Chessboard('openingBoard', {
    position: 'start',
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
  });

  setTimeout(() => openingBoard.resize(), 100);
  renderOpeningMoves();
  updateOpeningProgress();
  updateOpeningHint();
}

function nextOpeningMove() {
  if (!currentOpening) return;
  if (openingMoveIndex >= currentOpening.moves.length) {
    toast('Opening complete! 🎓', 'success');
    return;
  }

  const chess = new Chess();
  for (let i = 0; i <= openingMoveIndex; i++) chess.move(currentOpening.moves[i]);

  openingBoard.position(chess.fen());
  openingMoveIndex++;
  renderOpeningMoves();
  updateOpeningProgress();
  updateOpeningHint();

  if (openingMoveIndex === currentOpening.moves.length) {
    toast(`${currentOpening.name} complete! 🎓`, 'success');
    launchConfetti();
  }
}

function prevOpeningMove() {
  if (!currentOpening || openingMoveIndex === 0) return;
  openingMoveIndex--;
  const chess = new Chess();
  for (let i = 0; i < openingMoveIndex; i++) chess.move(currentOpening.moves[i]);
  openingBoard.position(openingMoveIndex === 0 ? 'start' : chess.fen());
  renderOpeningMoves();
  updateOpeningProgress();
  updateOpeningHint();
}

function resetOpening() {
  if (!currentOpening) return;
  openingMoveIndex = 0;
  openingBoard.position('start');
  renderOpeningMoves();
  updateOpeningProgress();
  updateOpeningHint();
}

function renderOpeningMoves() {
  const div = document.getElementById('openingMoveList');
  if (!div || !currentOpening) return;
  div.innerHTML = '';
  for (let i = 0; i < currentOpening.moves.length; i += 2) {
    const row = document.createElement('div');
    const num = document.createElement('span');
    num.className = 'move-number';
    num.innerText = `${Math.floor(i/2)+1}.`;
    row.appendChild(num);

    const w = document.createElement('span');
    w.className = 'move' + (i < openingMoveIndex ? ' move-done' : '') + (i === openingMoveIndex ? ' move-current' : '');
    w.innerText = currentOpening.moves[i];
    row.appendChild(w);

    if (currentOpening.moves[i+1] !== undefined) {
      const b = document.createElement('span');
      b.className = 'move' + (i+1 < openingMoveIndex ? ' move-done' : '') + (i+1 === openingMoveIndex ? ' move-current' : '');
      b.innerText = currentOpening.moves[i+1];
      row.appendChild(b);
    }
    div.appendChild(row);
  }
}

function updateOpeningProgress() {
  const total = currentOpening ? currentOpening.moves.length : 0;
  const pct   = total ? Math.round((openingMoveIndex / total) * 100) : 0;
  const text  = document.getElementById('openingProgressText');
  const fill  = document.getElementById('openingProgressFill');
  if (text) text.innerText = `Move ${openingMoveIndex} of ${total}`;
  if (fill) fill.style.width = pct + '%';
}

function updateOpeningHint() {
  const hint = document.getElementById('openingHint');
  if (!hint || !currentOpening) return;
  const tip = currentOpening.tips[openingMoveIndex];
  hint.innerText = tip ? `💡 ${tip}` : '';
}

// ─── SUPABASE AUTH ─────────────────────────────────────────
let currentUser = null;

async function initAuth() {
  const { data: { session } } = await client.auth.getSession();
  if (session) {
    currentUser = session.user;
    onAuthSuccess();
  }

  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') {
      currentUser = session.user;
      onAuthSuccess();
    }
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      onAuthSignOut();
    }
  });
}

function onAuthSuccess() {
  document.getElementById('adminNavBtn').classList.add('hidden');
  document.getElementById('logoutNavBtn').classList.remove('hidden');

  const emailEl = document.getElementById('loggedInEmail');
  if (emailEl) emailEl.innerText = currentUser.email;

  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('loggedInView').classList.remove('hidden');
}

function onAuthSignOut() {
  document.getElementById('adminNavBtn').classList.remove('hidden');
  document.getElementById('logoutNavBtn').classList.add('hidden');
  document.getElementById('loginView').classList.remove('hidden');
  document.getElementById('loggedInView').classList.add('hidden');
  showTab('home');
  toast('Signed out successfully.', 'info');
}

function openAdminModal() {
  const modal = document.getElementById('adminLoginModal');
  modal.classList.remove('hidden');

  if (currentUser) {
    document.getElementById('loginView').classList.add('hidden');
    document.getElementById('loggedInView').classList.remove('hidden');
    document.getElementById('loggedInEmail').innerText = currentUser.email;
  } else {
    document.getElementById('loginView').classList.remove('hidden');
    document.getElementById('loggedInView').classList.add('hidden');
    setTimeout(() => document.getElementById('adminEmailInput').focus(), 100);
  }
}

function closeAdminModal() {
  document.getElementById('adminLoginModal').classList.add('hidden');
  document.getElementById('adminEmailInput').value    = '';
  document.getElementById('adminPasswordInput').value = '';
  document.getElementById('loginError').style.display = 'none';
}

function goToAdmin() {
  closeAdminModal();
  showTab('admin');
}

async function supabaseLogin() {
  const email    = document.getElementById('adminEmailInput').value.trim();
  const password = document.getElementById('adminPasswordInput').value;
  const btn      = document.getElementById('loginBtn');
  const errEl    = document.getElementById('loginError');

  if (!email || !password) {
    errEl.innerText      = 'Please enter email and password.';
    errEl.style.display  = 'block';
    return;
  }

  btn.innerText    = 'Signing in...';
  btn.disabled     = true;
  errEl.style.display = 'none';

  const { error } = await client.auth.signInWithPassword({ email, password });

  btn.innerText = 'Sign In';
  btn.disabled  = false;

  if (error) {
    errEl.innerText     = error.message || 'Login failed. Check your credentials.';
    errEl.style.display = 'block';
    document.getElementById('adminPasswordInput').value = '';
    return;
  }

  closeAdminModal();
  showTab('admin');
  toast('Welcome, Admin! 🔐', 'success');
}

async function supabaseLogout() {
  await client.auth.signOut();
  closeAdminModal();
}



// ─── CONFIRM MODAL ─────────────────────────────────────────
let confirmCallback = null;

function showConfirm(title, msg, onConfirm) {
  document.getElementById('confirmTitle').innerText = title;
  document.getElementById('confirmMsg').innerText   = msg;
  confirmCallback = onConfirm;
  document.getElementById('confirmModal').classList.remove('hidden');
}

function closeConfirm() {
  document.getElementById('confirmModal').classList.add('hidden');
  confirmCallback = null;
}

document.getElementById('confirmYesBtn').addEventListener('click', () => {
  if (confirmCallback) confirmCallback();
  closeConfirm();
});

// ─── LEADERBOARD ───────────────────────────────────────────
function renderLeaderboard() {
  const container = document.getElementById('leaderboard');
  if (!container) return;

  const rated = [...players]
    .filter(p => p.rating)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 10);

  if (rated.length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim);">No rated players yet.</p>';
    return;
  }

  const medals = ['🥇','🥈','🥉'];
  container.innerHTML = `
    <div class="leaderboard">
      ${rated.map((p, i) => `
        <div class="leaderboard-row" onclick="openProfile(${players.indexOf(p)})">
          <span class="lb-rank">${medals[i] || `#${i+1}`}</span>
          <img src="${sanitize(p.image || 'https://placehold.co/80x80/1e293b/38bdf8?text=♟')}" class="lb-avatar" loading="lazy" onerror="this.src='https://placehold.co/80x80/1e293b/38bdf8?text=♟'">
          <div class="lb-info">
            <span class="lb-name">
              ${p.title ? `<span class="title-badge title-${p.title}">${p.title}</span>` : ''}
              ${sanitize(p.name)}
            </span>
            <span class="lb-games">🎮 ${p.games ? p.games.length : 0} games</span>
          </div>
          <span class="lb-rating">⭐ ${p.rating}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// ─── GAME OF THE WEEK ──────────────────────────────────────
function renderGameOfWeek() {
  const container = document.getElementById('gameOfWeek');
  if (!container) return;

  const allGames = [];
  players.forEach(p => {
    if (p.games) p.games.forEach(g => allGames.push({ ...g, playerName: p.name, playerIdx: players.indexOf(p) }));
  });

  if (allGames.length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim);">No games available yet.</p>';
    return;
  }

  const weekNum = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  const game    = allGames[weekNum % allGames.length];

  container.innerHTML = `
    <div class="gotw-card">
      <div class="gotw-badge">🎮 Game of the Week</div>
      <h3>${sanitize(game.name)}</h3>
      <p style="color:var(--text-muted);">by <strong>${sanitize(game.playerName)}</strong></p>
      ${game.white_player ? `<p style="font-size:13px; color:var(--text-dim);">♔ ${game.white_title ? game.white_title + ' ' : ''}${sanitize(game.white_player)} vs ♚ ${game.black_title ? game.black_title + ' ' : ''}${sanitize(game.black_player || '?')}</p>` : ''}
      <button class="potm-btn" onclick="openProfile(${game.playerIdx})">▶ Watch Game</button>
    </div>
  `;
}

// ─── MOST STUDIED GAMES ────────────────────────────────────
function renderMostStudied() {
  const views    = JSON.parse(localStorage.getItem('playerViews') || '{}');
  const sorted   = [...players]
    .sort((a, b) => (views[b.id] || 0) - (views[a.id] || 0))
    .slice(0, 5);
  return sorted;
}

// ─── VISITOR COUNTER ───────────────────────────────────────
function initVisitorCounter() {
  let count = parseInt(localStorage.getItem('visitorCount') || '1');
  count = Math.max(1, count + Math.floor(Math.random() * 3));
  localStorage.setItem('visitorCount', count);
  const el = document.getElementById('visitorCount');
  if (el) el.innerText = count;

  setInterval(() => {
    const delta = Math.floor(Math.random() * 5) - 2;
    count = Math.max(1, count + delta);
    if (el) el.innerText = count;
  }, 30000);
}

// ─── SHARE FEATURES ────────────────────────────────────────
function shareProfile(index) {
  const player = players[index];
  const url    = `${window.location.href.split('?')[0]}?player=${encodeURIComponent(player.name)}`;
  navigator.clipboard.writeText(url).then(() => {
    toast(`🔗 Profile link copied for ${player.name}!`, 'success');
  }).catch(() => {
    toast('Could not copy link', 'error');
  });
}

function downloadProfilePGN(index) {
  const player = players[index];
  if (!player.games || player.games.length === 0) {
    toast('No games to download', 'info'); return;
  }
  let pgn = '';
  player.games.forEach(g => {
    pgn += `[Event "${g.name}"]\n`;
    pgn += `[White "${g.white_player || 'White'}"]\n`;
    pgn += `[Black "${g.black_player || 'Black'}"]\n\n`;
    pgn += g.pgn + '\n\n';
  });
  const blob = new Blob([pgn], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${player.name.replace(/\s+/g, '_')}_games.pgn`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`⬇️ Downloaded ${player.games.length} games!`, 'success');
}

function sharePosition() {
  if (!currentBoard) { toast('No position loaded', 'info'); return; }
  const fen = currentBoard.chess.fen();
  navigator.clipboard.writeText(fen).then(() => {
    toast('📋 FEN copied to clipboard!', 'success');
  }).catch(() => {
    toast('Could not copy FEN', 'error');
  });
}

// ─── PROGRESS BAR ─────────────────────────────────────────
function showProgress() {
  const bar = document.getElementById('progressBar');
  if (!bar) return;
  bar.style.width = '0%';
  bar.style.opacity = '1';
  bar.style.transition = 'width 0.4s ease';
  setTimeout(() => bar.style.width = '70%', 10);
}

function hideProgress() {
  const bar = document.getElementById('progressBar');
  if (!bar) return;
  bar.style.width = '100%';
  setTimeout(() => { bar.style.opacity = '0'; bar.style.width = '0%'; }, 300);
}

// ─── TOAST NOTIFICATIONS ──────────────────────────────────
function toast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const t = document.createElement('div');
  t.className = `toast toast-${type}`;

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  t.innerHTML = `<span class="toast-icon">${icons[type] || '✅'}</span><span class="toast-msg">${message}</span><button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;

  container.appendChild(t);
  setTimeout(() => t.classList.add('toast-show'), 10);
  setTimeout(() => {
    t.classList.remove('toast-show');
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

// ─── DARK / LIGHT MODE ────────────────────────────────────
function toggleTheme() {
  const body   = document.body;
  const btn    = document.getElementById('themeToggle');
  const isLight = body.classList.toggle('light-mode');
  body.classList.toggle('dark-mode', !isLight);
  btn.innerText  = isLight ? '☀️' : '🌙';
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
}

function loadTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'light') {
    document.body.classList.remove('dark-mode');
    document.body.classList.add('light-mode');
    const btn = document.getElementById('themeToggle');
    if (btn) btn.innerText = '☀️';
  }
}

// ─── CONFETTI ─────────────────────────────────────────────
function launchConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.display = 'block';

  const pieces = Array.from({ length: 120 }, () => ({
    x:     Math.random() * canvas.width,
    y:     Math.random() * -canvas.height,
    w:     Math.random() * 10 + 6,
    h:     Math.random() * 6 + 4,
    color: `hsl(${Math.random() * 360}, 80%, 60%)`,
    speed: Math.random() * 4 + 2,
    angle: Math.random() * 360,
    spin:  (Math.random() - 0.5) * 6,
    drift: (Math.random() - 0.5) * 2
  }));

  let frame;
  let elapsed = 0;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
      p.y     += p.speed;
      p.x     += p.drift;
      p.angle += p.spin;
    });
    elapsed++;
    if (elapsed < 180) {
      frame = requestAnimationFrame(draw);
    } else {
      canvas.style.display = 'none';
      cancelAnimationFrame(frame);
    }
  }
  draw();
}

// ─── BOOT ─────────────────────────────────────────────────
Promise.all([fetchPlayers(), fetchArticles()]);
renderQuoteOfDay();
loadTheme();
initVisitorCounter();
initAuth();

document.addEventListener('click', (e) => {
  closeAllPlayerMenus();
  if (!e.target.closest('.global-search-container')) {
    document.getElementById('searchResults')?.classList.add('hidden');
  }
});

// ══════════════════════════════════════════════════════════════
// ─── GROUP 1: VISUAL — PARTICLE SYSTEM ───────────────────────
// ══════════════════════════════════════════════════════════════

function initParticles() {
  // create canvas
  const canvas = document.createElement('canvas');
  canvas.id = 'particleCanvas';
  document.body.insertBefore(canvas, document.body.firstChild);

  const ctx    = canvas.getContext('2d');
  const pieces = ['♟','♜','♞','♝','♛','♚'];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // create particles
  const particles = Array.from({ length: 18 }, () => createParticle(canvas, pieces));

  function createParticle(canvas, pieces) {
    return {
      x:      Math.random() * canvas.width,
      y:      Math.random() * canvas.height,
      size:   Math.random() * 18 + 10,
      speedX: (Math.random() - 0.5) * 0.4,
      speedY: (Math.random() - 0.5) * 0.4,
      piece:  pieces[Math.floor(Math.random() * pieces.length)],
      opacity: Math.random() * 0.4 + 0.1,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 0.3,
    };
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation * Math.PI / 180);
      ctx.font = `${p.size}px serif`;
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(p.piece, -p.size / 2, p.size / 2);
      ctx.restore();

      // move
      p.x        += p.speedX;
      p.y        += p.speedY;
      p.rotation += p.rotSpeed;

      // wrap around edges
      if (p.x < -40)               p.x = canvas.width  + 40;
      if (p.x > canvas.width  + 40) p.x = -40;
      if (p.y < -40)               p.y = canvas.height + 40;
      if (p.y > canvas.height + 40) p.y = -40;
    });

    requestAnimationFrame(draw);
  }

  draw();
}

// ─── BOOT PARTICLES ───────────────────────────────────────────
// only on desktop (mobile uses CSS display:none)
if (window.innerWidth > 768) {
  initParticles();
}

// ══════════════════════════════════════════════════════════════
// ─── GROUP 2: PLAYER SECTION ─────────────────────────────────
// Profile Tabs · Rating Chart · Flags · Recently Viewed
// ══════════════════════════════════════════════════════════════

// ─── COUNTRY FLAGS ────────────────────────────────────────────
const COUNTRY_FLAGS = {
  'Russia':        { flag: '🇷🇺', code: 'RUS' },
  'Norway':        { flag: '🇳🇴', code: 'NOR' },
  'USA':           { flag: '🇺🇸', code: 'USA' },
  'United States': { flag: '🇺🇸', code: 'USA' },
  'India':         { flag: '🇮🇳', code: 'IND' },
  'China':         { flag: '🇨🇳', code: 'CHN' },
  'Armenia':       { flag: '🇦🇲', code: 'ARM' },
  'Ukraine':       { flag: '🇺🇦', code: 'UKR' },
  'Azerbaijan':    { flag: '🇦🇿', code: 'AZE' },
  'France':        { flag: '🇫🇷', code: 'FRA' },
  'Germany':       { flag: '🇩🇪', code: 'GER' },
  'Poland':        { flag: '🇵🇱', code: 'POL' },
  'Netherlands':   { flag: '🇳🇱', code: 'NED' },
  'Hungary':       { flag: '🇭🇺', code: 'HUN' },
  'Cuba':          { flag: '🇨🇺', code: 'CUB' },
  'Latvia':        { flag: '🇱🇻', code: 'LAT' },
  'Georgia':       { flag: '🇬🇪', code: 'GEO' },
  'Iran':          { flag: '🇮🇷', code: 'IRI' },
  'Spain':         { flag: '🇪🇸', code: 'ESP' },
  'England':       { flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', code: 'ENG' },
  'Kenya':         { flag: '🇰🇪', code: 'KEN' },
};

function getFlagHTML(playerName, bio) {
  // try to detect country from bio or name
  for (const [country, info] of Object.entries(COUNTRY_FLAGS)) {
    if (bio && bio.includes(country)) {
      return `<span class="player-flag"><span class="flag-emoji">${info.flag}</span>${country}</span>`;
    }
  }
  return '';
}

// ─── RECENTLY VIEWED ──────────────────────────────────────────
let recentlyViewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');

function addToRecentlyViewed(player) {
  recentlyViewed = recentlyViewed.filter(p => p.id !== player.id);
  recentlyViewed.unshift({ id: player.id, name: player.name, image: player.image, title: player.title });
  if (recentlyViewed.length > 5) recentlyViewed = recentlyViewed.slice(0, 5);
  localStorage.setItem('recentlyViewed', JSON.stringify(recentlyViewed));
}

function renderRecentlyViewed() {
  const container = document.getElementById('recentlyViewedList');
  if (!container || recentlyViewed.length === 0) return;

  document.getElementById('recentlyViewedSection').style.display = 'block';
  container.innerHTML = recentlyViewed.map(p => {
    const idx = players.findIndex(pl => pl.id === p.id);
    if (idx === -1) return '';
    return `
      <div class="recently-viewed-item" onclick="openProfile(${idx})">
        <img src="${p.image || 'https://placehold.co/80x80/1e293b/38bdf8?text=♟'}" onerror="this.src='https://placehold.co/80x80/1e293b/38bdf8?text=♟'">
        <span>${p.title ? p.title + ' ' : ''}${sanitize(p.name)}</span>
      </div>
    `;
  }).join('');
}

// ─── RATING HISTORY CHART ─────────────────────────────────────
// Simulates a rating history based on current rating
function generateRatingHistory(currentRating) {
  if (!currentRating) return [];
  const history = [];
  let r = currentRating - Math.floor(Math.random() * 80 + 40);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const month = months[(now.getMonth() - i + 12) % 12];
    const change = Math.floor(Math.random() * 30) - 10;
    r = Math.min(currentRating, Math.max(currentRating - 120, r + change));
    history.push({ month, rating: r });
  }
  history.push({ month: 'Now', rating: currentRating });
  return history;
}

function drawRatingChart(canvas, history) {
  if (!canvas || history.length < 2) return;
  const ctx = canvas.getContext('2d');
  const W   = canvas.width  = canvas.offsetWidth;
  const H   = canvas.height = 120;
  const pad = { top: 10, right: 10, bottom: 24, left: 40 };

  const ratings = history.map(h => h.rating);
  const minR    = Math.min(...ratings) - 20;
  const maxR    = Math.max(...ratings) + 20;
  const rangeR  = maxR - minR || 1;

  ctx.clearRect(0, 0, W, H);

  // grid lines
  ctx.strokeStyle = 'rgba(56,189,248,0.08)';
  ctx.lineWidth   = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + ((H - pad.top - pad.bottom) / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();
  }

  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top  - pad.bottom;

  const points = history.map((h, i) => ({
    x: pad.left + (i / (history.length - 1)) * plotW,
    y: pad.top  + plotH - ((h.rating - minR) / rangeR) * plotH,
    rating: h.rating,
    month:  h.month,
  }));

  // fill gradient
  const grad = ctx.createLinearGradient(0, pad.top, 0, H - pad.bottom);
  grad.addColorStop(0, 'rgba(56,189,248,0.25)');
  grad.addColorStop(1, 'rgba(56,189,248,0.01)');

  ctx.beginPath();
  ctx.moveTo(points[0].x, H - pad.bottom);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, H - pad.bottom);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // line
  ctx.beginPath();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth   = 2.5;
  ctx.lineJoin    = 'round';
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // dots
  points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, i === points.length - 1 ? 5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = i === points.length - 1 ? '#38bdf8' : 'rgba(56,189,248,0.6)';
    ctx.fill();
    if (i === points.length - 1) {
      ctx.strokeStyle = 'rgba(56,189,248,0.4)';
      ctx.lineWidth   = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  // x-axis labels (every 3rd)
  ctx.fillStyle  = 'rgba(100,116,139,0.8)';
  ctx.font       = '9px Arial';
  ctx.textAlign  = 'center';
  points.forEach((p, i) => {
    if (i % 3 === 0 || i === points.length - 1) {
      ctx.fillText(p.month, p.x, H - 6);
    }
  });

  // y-axis labels
  ctx.textAlign = 'right';
  ctx.fillText(maxR, pad.left - 4, pad.top + 8);
  ctx.fillText(minR, pad.left - 4, H - pad.bottom - 2);
}

// ─── ANIMATED RATING COUNTER ─────────────────────────────────
function animateRating(el, target) {
  if (!el || !target) return;
  let current  = target - 80;
  const step   = Math.ceil((target - current) / 40);
  const timer  = setInterval(() => {
    current += step;
    if (current >= target) { current = target; clearInterval(timer); }
    el.innerText = current;
  }, 30);
}

// ─── PROFILE TABS ─────────────────────────────────────────────
function initProfileTabs() {
  const tabs = document.querySelectorAll('.profile-tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('tab-active'));
      btn.classList.add('tab-active');

      const target = btn.dataset.tab;
      document.querySelectorAll('.profile-tab-panel').forEach(panel => {
        panel.classList.remove('tab-panel-active');
      });
      const activePanel = document.getElementById(`tab-${target}`);
      if (activePanel) activePanel.classList.add('tab-panel-active');

      // draw chart when stats tab opens
      if (target === 'stats') {
        setTimeout(() => {
          const canvas = document.getElementById('ratingChartCanvas');
          if (canvas) {
            const rating = parseInt(canvas.dataset.rating);
            if (rating) drawRatingChart(canvas, generateRatingHistory(rating));
          }
        }, 50);
      }
    });
  });
}

// ─── ACTIVE GAME BUTTON ────────────────────────────────────────
function setActiveGameBtn(btn) {
  document.querySelectorAll('.game-btn').forEach(b => b.classList.remove('active-game'));
  btn.classList.add('active-game');
  // switch to games tab
  document.querySelectorAll('.profile-tab-btn').forEach(b => {
    if (b.dataset.tab === 'games') b.click();
  });
}



// ══════════════════════════════════════════════════════════════
// ─── GROUP 3: GAMES & ENGINE ─────────────────────────────────
// Annotations · Game Timer · Replay Speed · Best Move Highlight
// ══════════════════════════════════════════════════════════════

// ─── MOVE ANNOTATIONS ─────────────────────────────────────────
const ANNOTATIONS = {
  '!!': { label: '!!', cls: 'ann-brilliant',  btn: 'ann-brilliant-btn',  name: '!! Brilliant' },
  '!':  { label: '!',  cls: 'ann-great',      btn: 'ann-great-btn',      name: '! Great'      },
  '!?': { label: '!?', cls: 'ann-good',       btn: 'ann-good-btn',       name: '!? Interesting'},
  '?!': { label: '?!', cls: 'ann-inaccuracy', btn: 'ann-inaccuracy-btn', name: '?! Inaccuracy'},
  '?':  { label: '?',  cls: 'ann-mistake',    btn: 'ann-mistake-btn',    name: '? Mistake'    },
  '??': { label: '??', cls: 'ann-blunder',    btn: 'ann-blunder-btn',    name: '?? Blunder'   },
};

let moveAnnotations  = {};  // { moveIndex: '!!' }
let moveComments     = {};  // { moveIndex: 'text' }

function annotateMove(symbol) {
  if (!currentBoard) return;
  const idx = currentBoard.moveIndex - 1;
  if (idx < 0) { toast('Make a move first', 'info'); return; }
  if (symbol === 'clear') {
    delete moveAnnotations[idx];
    delete moveComments[idx];
  } else {
    moveAnnotations[idx] = symbol;
  }
  renderMoves();
  toast(`Move annotated: ${symbol || 'cleared'}`, 'success');
}

function addMoveComment(idx, text) {
  if (text) moveComments[idx] = text;
  else delete moveComments[idx];
  renderMoves();
}

// Override renderMoves to support annotations
const _renderMovesOriginal = renderMoves;


// ─── REPLAY AUTO-PLAY ─────────────────────────────────────────
let replayInterval = null;
let replaySpeed    = 1000; // ms per move
let isReplaying    = false;

function setReplaySpeed(ms, btn) {
  replaySpeed = ms;
  document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('speed-active'));
  if (btn) btn.classList.add('speed-active');
  // restart if already playing
  if (isReplaying) { stopReplay(); startReplay(); }
}

function startReplay() {
  if (!currentBoard) return;
  isReplaying = true;
  const playBtn = document.getElementById('replayPlayBtn');
  if (playBtn) { playBtn.innerText = '⏸ Pause'; playBtn.classList.add('playing'); }

  replayInterval = setInterval(() => {
    if (currentBoard.moveIndex >= currentBoard.moves.length) {
      stopReplay();
      return;
    }
    nextMove();
  }, replaySpeed);
}

function stopReplay() {
  isReplaying = false;
  clearInterval(replayInterval);
  replayInterval = null;
  const playBtn = document.getElementById('replayPlayBtn');
  if (playBtn) { playBtn.innerText = '▶ Auto Play'; playBtn.classList.remove('playing'); }
}

function toggleReplay() {
  if (isReplaying) stopReplay();
  else {
    if (currentBoard && currentBoard.moveIndex >= currentBoard.moves.length) {
      // restart from beginning
      const chess = new Chess();
      currentBoard.chess     = chess;
      currentBoard.moveIndex = 0;
      currentBoard.board.position('start');
      renderMoves();
    }
    startReplay();
  }
}

// ─── GAME CLOCK / TIMER ───────────────────────────────────────
let whiteTime     = 10 * 60; // seconds
let blackTime     = 10 * 60;
let clockInterval = null;
let clockRunning  = false;
let selectedClockTime = 10 * 60;

const CLOCK_OPTIONS = [
  { label: '1 min',  seconds: 60       },
  { label: '3 min',  seconds: 3 * 60   },
  { label: '5 min',  seconds: 5 * 60   },
  { label: '10 min', seconds: 10 * 60  },
  { label: '15 min', seconds: 15 * 60  },
  { label: '30 min', seconds: 30 * 60  },
];

function formatClock(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function updateClockDisplay() {
  const wEl = document.getElementById('whiteClockTime');
  const bEl = document.getElementById('blackClockTime');
  if (wEl) {
    wEl.innerText = formatClock(whiteTime);
    wEl.className = 'clock-time' + (whiteTime <= 30 ? ' clock-low-text' : '');
    wEl.closest('.game-clock')?.classList.toggle('clock-low', whiteTime <= 30);
  }
  if (bEl) {
    bEl.innerText = formatClock(blackTime);
    bEl.className = 'clock-time' + (blackTime <= 30 ? ' clock-low-text' : '');
    bEl.closest('.game-clock')?.classList.toggle('clock-low', blackTime <= 30);
  }
}

function startClock(turn) {
  clearInterval(clockInterval);
  clockRunning = true;

  // update active state
  document.getElementById('whiteClockBox')?.classList.toggle('clock-active', turn === 'w');
  document.getElementById('blackClockBox')?.classList.toggle('clock-active', turn === 'b');

  clockInterval = setInterval(() => {
    if (turn === 'w') {
      whiteTime--;
      if (whiteTime <= 0) { whiteTime = 0; clearInterval(clockInterval); toast('⏰ White ran out of time!', 'error'); }
    } else {
      blackTime--;
      if (blackTime <= 0) { blackTime = 0; clearInterval(clockInterval); toast('⏰ Black ran out of time!', 'error'); }
    }
    updateClockDisplay();
  }, 1000);
}

function stopClock() {
  clearInterval(clockInterval);
  clockRunning = false;
}

function resetClock() {
  stopClock();
  whiteTime = selectedClockTime;
  blackTime = selectedClockTime;
  updateClockDisplay();
  document.getElementById('whiteClockBox')?.classList.remove('clock-active', 'clock-low');
  document.getElementById('blackClockBox')?.classList.remove('clock-active', 'clock-low');
}

function selectClockTime(seconds, btn) {
  selectedClockTime = seconds;
  whiteTime = seconds;
  blackTime = seconds;
  document.querySelectorAll('.clock-option-btn').forEach(b => b.classList.remove('clock-selected'));
  if (btn) btn.classList.add('clock-selected');
  updateClockDisplay();
  stopClock();
}

// ─── Reset annotations on game load (handled inside loadGame) ─

function injectReplayControls() {
  if (document.getElementById('replayControlsBar')) return;
  const controls = document.querySelector('#tab-games .controls');
  if (!controls) return;

  const bar = document.createElement('div');
  bar.id = 'replayControlsBar';
  bar.className = 'replay-controls';
  bar.innerHTML = `
    <button class="replay-btn" id="replayPlayBtn" onclick="toggleReplay()">▶ Auto Play</button>
    <div class="replay-speed-btns">
      <span class="replay-controls" style="background:none;border:none;padding:0;"><label>Speed:</label></span>
      <button class="speed-btn" onclick="setReplaySpeed(2000, this)">0.5x</button>
      <button class="speed-btn speed-active" onclick="setReplaySpeed(1000, this)">1x</button>
      <button class="speed-btn" onclick="setReplaySpeed(500, this)">2x</button>
      <button class="speed-btn" onclick="setReplaySpeed(200, this)">5x</button>
    </div>
  `;
  controls.after(bar);
}

function injectAnnotationEditor() {
  if (document.getElementById('annotationEditorBar')) return;
  const movesSection = document.querySelector('#tab-games .moves-section');
  if (!movesSection) return;

  const editor = document.createElement('div');
  editor.id = 'annotationEditorBar';
  editor.className = 'annotation-editor';
  editor.innerHTML = `
    <div class="annotation-editor-title">✏️ Annotate Current Move</div>
    <div class="annotation-btns">
      <button class="ann-btn ann-brilliant-btn"  onclick="annotateMove('!!')">!! Brilliant</button>
      <button class="ann-btn ann-great-btn"      onclick="annotateMove('!')">! Great</button>
      <button class="ann-btn ann-good-btn"       onclick="annotateMove('!?')">!? Interesting</button>
      <button class="ann-btn ann-inaccuracy-btn" onclick="annotateMove('?!')">?! Inaccuracy</button>
      <button class="ann-btn ann-mistake-btn"    onclick="annotateMove('?')">? Mistake</button>
      <button class="ann-btn ann-blunder-btn"    onclick="annotateMove('??')">?? Blunder</button>
      <button class="ann-btn ann-clear-btn"      onclick="annotateMove('clear')">✕ Clear</button>
    </div>
  `;
  movesSection.after(editor);
}

// ─── INJECT CLOCK INTO PLAY VS COMPUTER ───────────────────────
const _startGameOriginal = startGame;


function injectGameClock() {
  if (document.getElementById('gameClockBar')) return;
  const statusBar = document.querySelector('.play-status-bar');
  if (!statusBar) return;

  const clockBar = document.createElement('div');
  clockBar.id = 'gameClockBar';
  clockBar.style.marginBottom = '10px';
  clockBar.innerHTML = `
    <div class="clock-selector">
      ${CLOCK_OPTIONS.map((o, i) => `
        <button class="clock-option-btn ${i === 3 ? 'clock-selected' : ''}"
                onclick="selectClockTime(${o.seconds}, this)">${o.label}</button>
      `).join('')}
    </div>
    <div class="game-clocks">
      <div class="game-clock" id="blackClockBox">
        <div class="clock-label">♚ Computer</div>
        <div class="clock-time" id="blackClockTime">${formatClock(selectedClockTime)}</div>
      </div>
      <div class="game-clock" id="whiteClockBox">
        <div class="clock-label">♔ You</div>
        <div class="clock-time" id="whiteClockTime">${formatClock(selectedClockTime)}</div>
      </div>
    </div>
  `;
  statusBar.before(clockBar);

  // reset clock values to selected
  whiteTime = selectedClockTime;
  blackTime = selectedClockTime;
  updateClockDisplay();
  // start white clock if playing as white
  if (playColor === 'white') startClock('w');
  else startClock('b');
}

// ─── HOOK CLOCK INTO PLAY MOVES ───────────────────────────────
const _handlePlayDropOriginal = handlePlayDrop;
// clock switch merged into handlePlayDrop above

// hook clock back to player after computer moves
const _computerPlayMoveOriginal = computerPlayMove;


// patch playEngine onmessage to switch clock after computer move
const _initPlayEngineOriginal = initPlayEngine;


// stop clock on game end
const _showPlayResultOriginal = showPlayResult;


// reset clock on new game
const _resetPlayGameOriginal = resetPlayGame;


// ─── BEST MOVE DISPLAY IN ENGINE ──────────────────────────────
function showBestMoveBar(from, to) {
  let bar = document.getElementById('bestMoveBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'bestMoveBar';
    bar.className = 'best-move-bar';
    const pvLine = document.getElementById('pvLine');
    if (pvLine) pvLine.after(bar);
  }
  bar.innerHTML = `
    <span class="best-move-label">⚡ Best Move</span>
    <span class="best-move-uci">${from.toUpperCase()} → ${to.toUpperCase()}</span>
    <span style="font-size:12px;color:var(--text-dim);">Suggested by Stockfish</span>
  `;
}

// patch drawArrow to also show best move bar
const _drawArrowOriginal = drawArrow;


toast('Group 3 loaded: Annotations, Timer & Replay ♟', 'info');

// ══════════════════════════════════════════════════════════════
// ─── GROUP 4: HOME & UX ──────────────────────────────────────
// Mobile Nav · Swipe · PWA · Skeleton · Pull Refresh · Scroll
// ══════════════════════════════════════════════════════════════

// ─── MOBILE NAV ACTIVE STATE ──────────────────────────────────
function setMobActive(btn) {
  document.querySelectorAll('.mob-nav-btn').forEach(b => b.classList.remove('mob-active'));
  btn.classList.add('mob-active');
}

// ─── SCROLL TO TOP ─────────────────────────────────────────────
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener('scroll', () => {
  const btn = document.getElementById('scrollTopBtn');
  if (!btn) return;
  if (window.scrollY > 300) btn.classList.add('btn-visible');
  else btn.classList.remove('btn-visible');
});

// ─── NETWORK STATUS ────────────────────────────────────────────
function showNetworkBanner(online) {
  const banner = document.getElementById('networkBanner');
  if (!banner) return;
  banner.className = `banner-show ${online ? 'online-banner' : 'offline-banner'}`;
  banner.innerText = online ? '✅ Back online!' : '⚠️ You are offline';
  setTimeout(() => banner.classList.remove('banner-show'), 3000);
}

window.addEventListener('online',  () => showNetworkBanner(true));
window.addEventListener('offline', () => showNetworkBanner(false));

// ─── PULL TO REFRESH ───────────────────────────────────────────
let pullStartY    = 0;
let pullDistance  = 0;
let isPulling     = false;
const PULL_THRESHOLD = 80;

document.addEventListener('touchstart', (e) => {
  if (window.scrollY === 0) {
    pullStartY = e.touches[0].clientY;
    isPulling  = true;
  }
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (!isPulling) return;
  pullDistance = e.touches[0].clientY - pullStartY;
  const indicator = document.getElementById('pullRefreshIndicator');
  const text      = document.getElementById('pullRefreshText');
  if (pullDistance > 10 && pullDistance < 150) {
    indicator?.classList.add('pull-visible');
    if (text) text.innerText = pullDistance > PULL_THRESHOLD ? '🔄 Release to refresh' : '↓ Pull to refresh';
  }
}, { passive: true });

document.addEventListener('touchend', () => {
  const indicator = document.getElementById('pullRefreshIndicator');
  const text      = document.getElementById('pullRefreshText');
  if (isPulling && pullDistance > PULL_THRESHOLD) {
    indicator?.classList.add('pull-loading');
    if (text) text.innerText = 'Refreshing...';
    // invalidate cache and reload
    cache.players.data  = null;
    cache.articles.data = null;
    cache.pdfs.data     = null;
    Promise.all([fetchPlayers(), fetchArticles()]).then(() => {
      indicator?.classList.remove('pull-visible', 'pull-loading');
      toast('✅ Content refreshed!', 'success');
    });
  } else {
    indicator?.classList.remove('pull-visible');
  }
  isPulling    = false;
  pullDistance = 0;
});

// ─── SWIPE GESTURES (left/right to switch tabs) ────────────────
const TAB_ORDER = ['home','articles','players','engine','play','puzzles','openings','pdf'];
let swipeStartX  = 0;
let swipeStartY  = 0;
let swipeTracking = false;

document.addEventListener('touchstart', (e) => {
  swipeStartX   = e.touches[0].clientX;
  swipeStartY   = e.touches[0].clientY;
  swipeTracking = true;
}, { passive: true });

document.addEventListener('touchend', (e) => {
  if (!swipeTracking) return;
  const dx = e.changedTouches[0].clientX - swipeStartX;
  const dy = e.changedTouches[0].clientY - swipeStartY;
  swipeTracking = false;

  // only horizontal swipes (not scrolls)
  if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;

  const current = document.querySelector('section.active');
  if (!current) return;
  const idx = TAB_ORDER.indexOf(current.id);
  if (idx === -1) return;

  if (dx < 0 && idx < TAB_ORDER.length - 1) showTab(TAB_ORDER[idx + 1]);
  if (dx > 0 && idx > 0)                     showTab(TAB_ORDER[idx - 1]);
}, { passive: true });

// ─── KEYBOARD SHORTCUTS ────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + K = focus search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const search = document.getElementById('globalSearch');
    if (search) { search.focus(); showTab('home'); }
  }
  // ArrowLeft/Right in profile = prev/next move
  if (document.getElementById('profile')?.classList.contains('active')) {
    if (e.key === 'ArrowLeft')  prevMove();
    if (e.key === 'ArrowRight') nextMove();
  }
  // Escape = go back
  if (e.key === 'Escape') {
    const profile = document.getElementById('profile');
    if (profile?.classList.contains('active')) showTab('players');
  }
});

// ─── PWA INSTALL PROMPT ────────────────────────────────────────
let pwaPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  pwaPrompt = e;
  // show banner after 3 seconds
  if (!localStorage.getItem('pwaDismissed')) {
    setTimeout(() => {
      const banner = document.getElementById('pwaInstallBanner');
      if (banner) banner.style.display = 'block';
    }, 3000);
  }
});

document.getElementById('pwaInstallBtn')?.addEventListener('click', async () => {
  if (!pwaPrompt) return;
  pwaPrompt.prompt();
  const { outcome } = await pwaPrompt.userChoice;
  if (outcome === 'accepted') toast('♟ App installed!', 'success');
  pwaPrompt = null;
  document.getElementById('pwaInstallBanner').style.display = 'none';
});

function dismissPWA() {
  document.getElementById('pwaInstallBanner').style.display = 'none';
  localStorage.setItem('pwaDismissed', '1');
}

// ─── PUZZLE STREAK ─────────────────────────────────────────────
function getPuzzleStreak() {
  return parseInt(localStorage.getItem('puzzleStreak') || '0');
}

function incrementStreak() {
  const streak = getPuzzleStreak() + 1;
  localStorage.setItem('puzzleStreak', streak);
  localStorage.setItem('lastPuzzleDate', new Date().toDateString());
  renderStreakBanner();
}

function checkStreakReset() {
  const last = localStorage.getItem('lastPuzzleDate');
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (last && last !== today && last !== yesterday) {
    localStorage.setItem('puzzleStreak', '0');
  }
}

function renderStreakBanner() {
  const streak = getPuzzleStreak();
  if (streak === 0) return;
  const existing = document.getElementById('streakBanner');
  if (existing) existing.remove();
  const puzzleSection = document.querySelector('#puzzles .card');
  if (!puzzleSection) return;
  const banner = document.createElement('div');
  banner.id = 'streakBanner';
  banner.className = 'streak-banner';
  banner.innerHTML = `
    <div class="streak-fire">🔥</div>
    <div class="streak-info">
      <strong>Puzzle Streak!</strong>
      <span>Keep solving daily puzzles</span>
    </div>
    <div class="streak-count">${streak}</div>
  `;
  puzzleSection.insertBefore(banner, puzzleSection.firstChild);
}

// streak increment is called inside the original handlePuzzleDrop below

// ─── IMPROVED SKELETONS ────────────────────────────────────────
// showSkeletons upgraded version above

// ─── INIT GROUP 4 ──────────────────────────────────────────────
checkStreakReset();
renderStreakBanner();

// ══════════════════════════════════════════════════════════════
// ─── MOST IMPACTFUL FEATURES ──────────────────────────────────
// 1. Game Review   2. Clickable Eval Graph   3. Board Themes
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// FEATURE 1: FULL GAME REVIEW
// ══════════════════════════════════════════════════════════════
let reviewResults   = [];
let isReviewing     = false;
let reviewWorker    = null;

async function startGameReview() {
  if (!engineGame || engineGame.history().length === 0) {
    toast('Load a PGN first to review', 'info');
    return;
  }
  if (isReviewing) return;

  isReviewing   = true;
  reviewResults = [];

  const btn      = document.getElementById('reviewBtn');
  const progress = document.getElementById('reviewProgress');
  const results  = document.getElementById('reviewResults');

  if (btn)      { btn.disabled = true; btn.innerHTML = '⏳ Reviewing...'; }
  if (progress) progress.style.display = 'block';
  if (results)  results.style.display  = 'none';

  const history  = engineGame.history({ verbose: true });
  const total    = history.length;
  let   prevEval = 0;

  // replay game move by move and get eval at each position
  const tempGame = new Chess();

  for (let i = 0; i < total; i++) {
    const move = history[i];
    tempGame.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });

    // get eval via a quick engine search
    const evalScore = await getPositionEval(tempGame.fen(), 10);

    const isWhite  = move.color === 'w';
    const diff     = isWhite ? prevEval - evalScore : evalScore - prevEval;
    const quality  = classifyMoveQuality(diff);

    reviewResults.push({
      moveNum:  Math.floor(i / 2) + 1,
      color:    move.color,
      san:      move.san,
      eval:     evalScore,
      prevEval: prevEval,
      diff:     diff,
      quality:  quality,
      fen:      tempGame.fen(),
      index:    i,
    });

    prevEval = evalScore;

    // update progress
    const pct = Math.round(((i + 1) / total) * 100);
    const fill  = document.getElementById('reviewProgressFill');
    const label = document.getElementById('reviewProgressLabel');
    if (fill)  fill.style.width = pct + '%';
    if (label) label.innerText  = `Analyzing move ${i + 1} of ${total}...`;
  }

  isReviewing = false;
  if (btn) { btn.disabled = false; btn.innerHTML = '🔬 Review Game'; }
  if (progress) progress.style.display = 'none';

  renderReviewResults();
  toast('✅ Game review complete!', 'success');
}

// get eval score for a position using the engine
function getPositionEval(fen, depth) {
  return new Promise((resolve) => {
    if (!engine) { resolve(0); return; }

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) { resolved = true; resolve(0); }
    }, 3000);

    const origMsg = engine.onmessage;
    engine.onmessage = function(e) {
      const line = e.data;

      if (line.startsWith('bestmove')) {
        engine.onmessage = origMsg;
        clearTimeout(timeout);
        if (!resolved) { resolved = true; resolve(lastReviewEval); }
      }

      if (line.includes('score cp')) {
        const m = line.match(/score cp (-?\d+)/);
        if (m) lastReviewEval = parseInt(m[1]) / 100;
      }
      if (line.includes('score mate')) {
        const m = line.match(/score mate (-?\d+)/);
        if (m) lastReviewEval = parseInt(m[1]) > 0 ? 10 : -10;
      }
    };

    engine.postMessage('stop');
    engine.postMessage(`position fen ${fen}`);
    engine.postMessage(`go depth ${depth}`);
  });
}

let lastReviewEval = 0;

function classifyMoveQuality(diff) {
  if (diff < -0.1) return { label: '!!', name: 'Brilliant',  cls: 'stat-brilliant',  color: '#1baca6' };
  if (diff < 0.1)  return { label: '!',  name: 'Excellent',  cls: 'stat-excellent',  color: '#96bc4b' };
  if (diff < 0.5)  return { label: '',   name: 'Good',       cls: 'stat-good',       color: '#5b8a3c' };
  if (diff < 1.5)  return { label: '?!', name: 'Inaccuracy', cls: 'stat-inaccuracy', color: '#f0c15f' };
  if (diff < 3.0)  return { label: '?',  name: 'Mistake',    cls: 'stat-mistake',    color: '#e58f2a' };
  return              { label: '??', name: 'Blunder',    cls: 'stat-blunder',    color: '#ca3431' };
}

function calcAccuracy(moves) {
  if (moves.length === 0) return 100;
  const totalDiff = moves.reduce((sum, m) => sum + Math.max(0, m.diff), 0);
  const avgDiff   = totalDiff / moves.length;
  const accuracy  = Math.max(0, Math.min(100, 100 - avgDiff * 12));
  return Math.round(accuracy);
}

function getAccuracyClass(score) {
  if (score >= 90) return 'great';
  if (score >= 75) return 'good';
  if (score >= 55) return 'average';
  return 'poor';
}

function renderReviewResults() {
  const container = document.getElementById('reviewResults');
  if (!container) return;

  container.style.display = 'block';

  const whiteMoves = reviewResults.filter(r => r.color === 'w');
  const blackMoves = reviewResults.filter(r => r.color === 'b');

  const wAcc = calcAccuracy(whiteMoves);
  const bAcc = calcAccuracy(blackMoves);

  // count move qualities
  const counts = { Brilliant:0, Excellent:0, Good:0, Inaccuracy:0, Mistake:0, Blunder:0 };
  reviewResults.forEach(r => { if (counts[r.quality.name] !== undefined) counts[r.quality.name]++; });

  container.innerHTML = `
    <div class="review-results-header">
      <span class="review-results-title">📋 Game Review</span>
      <span style="font-size:12px;color:var(--text-dim);">${reviewResults.length} moves analyzed</span>
    </div>

    <!-- Accuracy -->
    <div class="accuracy-row">
      <div class="accuracy-card white-card">
        <div class="accuracy-player">♔ White</div>
        <div class="accuracy-score ${getAccuracyClass(wAcc)}">${wAcc}%</div>
        <div class="accuracy-label">Accuracy</div>
      </div>
      <div class="accuracy-card black-card">
        <div class="accuracy-player">♚ Black</div>
        <div class="accuracy-score ${getAccuracyClass(bAcc)}">${bAcc}%</div>
        <div class="accuracy-label">Accuracy</div>
      </div>
    </div>

    <!-- Move quality counts -->
    <div class="move-stats-row">
      <div class="move-stat-box">
        <span class="move-stat-count stat-brilliant">${counts.Brilliant}</span>
        <span class="move-stat-label" style="color:#1baca6;">Brilliant</span>
      </div>
      <div class="move-stat-box">
        <span class="move-stat-count stat-excellent">${counts.Excellent}</span>
        <span class="move-stat-label" style="color:#96bc4b;">Excellent</span>
      </div>
      <div class="move-stat-box">
        <span class="move-stat-count stat-good">${counts.Good}</span>
        <span class="move-stat-label" style="color:#5b8a3c;">Good</span>
      </div>
      <div class="move-stat-box">
        <span class="move-stat-count stat-inaccuracy">${counts.Inaccuracy}</span>
        <span class="move-stat-label" style="color:#f0c15f;">Inaccuracy</span>
      </div>
      <div class="move-stat-box">
        <span class="move-stat-count stat-mistake">${counts.Mistake}</span>
        <span class="move-stat-label" style="color:#e58f2a;">Mistake</span>
      </div>
      <div class="move-stat-box">
        <span class="move-stat-count stat-blunder">${counts.Blunder}</span>
        <span class="move-stat-label" style="color:#ca3431;">Blunder</span>
      </div>
    </div>

    <!-- Move list -->
    <div class="reviewed-moves">
      ${reviewResults.map((r, i) => `
        <div class="reviewed-move-row" onclick="jumpToReviewMove(${i})">
          <span class="reviewed-move-num">${r.moveNum}${r.color === 'w' ? '.' : '…'}</span>
          <span class="reviewed-move-san">${r.san}${r.quality.label ? ' ' + r.quality.label : ''}</span>
          <span class="reviewed-move-eval">${r.eval > 0 ? '+' : ''}${r.eval.toFixed(2)}</span>
          <span class="reviewed-move-badge" style="background:${r.quality.color};">${r.quality.name}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function jumpToReviewMove(idx) {
  const result = reviewResults[idx];
  if (!result) return;

  // replay to that position
  const game = new Chess();
  for (let i = 0; i <= result.index; i++) {
    const h = engineGame.history({ verbose: true });
    if (h[i]) game.move({ from: h[i].from, to: h[i].to, promotion: h[i].promotion || 'q' });
  }

  engineGame = game;
  engineBoard.position(engineGame.fen());
  renderEngineMoves();
  updateEvalBar(result.eval);
  evalHistory = reviewResults.slice(0, idx + 1).map(r => ({ label: r.san, score: r.eval }));
  drawEvalGraph();
  toast(`Move ${result.moveNum}: ${result.san} — ${result.quality.name}`, 'info');
}

// inject review UI into engine section
function injectReviewPanel() {
  if (document.getElementById('reviewPanel')) return;
  const gameManagement = document.getElementById('gameManagement');
  if (!gameManagement) return;

  const panel = document.createElement('div');
  panel.id = 'reviewPanel';
  panel.style.marginTop = '14px';
  panel.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
      <button class="review-btn" id="reviewBtn" onclick="startGameReview()">
        🔬 Review Game
      </button>
      <span style="font-size:12px; color:var(--text-dim);">Analyzes every move & shows accuracy</span>
    </div>
    <div class="review-progress-wrapper" id="reviewProgress">
      <div class="review-progress-label">
        <span id="reviewProgressLabel">Analyzing...</span>
        <span id="reviewProgressPct">0%</span>
      </div>
      <div class="review-progress-bar">
        <div class="review-progress-fill" id="reviewProgressFill"></div>
      </div>
    </div>
    <div class="review-results" id="reviewResults"></div>
  `;
  gameManagement.after(panel);
}

// ══════════════════════════════════════════════════════════════
// FEATURE 2: CLICKABLE EVAL GRAPH
// ══════════════════════════════════════════════════════════════
let evalGraphPoints = [];

function drawEvalGraph() {
  const canvas = document.getElementById('evalGraph');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const W   = canvas.width  = canvas.offsetWidth || 600;
  const H   = canvas.height = 120;
  const pad = { top: 10, right: 10, bottom: 24, left: 36 };

  ctx.clearRect(0, 0, W, H);

  // background
  ctx.fillStyle = '#0b0f1a';
  ctx.fillRect(0, 0, W, H);

  if (evalHistory.length < 2) {
    ctx.fillStyle = 'rgba(56,189,248,0.15)';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Make moves to see evaluation graph', W / 2, H / 2);
    return;
  }

  const ratings = evalHistory.map(h => h.score);
  const minR    = Math.min(...ratings, -1) - 0.5;
  const maxR    = Math.max(...ratings,  1) + 0.5;
  const rangeR  = maxR - minR || 1;
  const plotW   = W - pad.left - pad.right;
  const plotH   = H - pad.top  - pad.bottom;

  // center line
  const zeroY = pad.top + plotH - ((-minR) / rangeR) * plotH;
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(pad.left, zeroY);
  ctx.lineTo(W - pad.right, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  evalGraphPoints = evalHistory.map((h, i) => ({
    x:     pad.left + (i / (evalHistory.length - 1)) * plotW,
    y:     pad.top  + plotH - ((h.score - minR) / rangeR) * plotH,
    score: h.score,
    label: h.label,
    index: i,
  }));

  // white advantage fill (above zero)
  const whiteGrad = ctx.createLinearGradient(0, pad.top, 0, zeroY);
  whiteGrad.addColorStop(0, 'rgba(240,240,240,0.3)');
  whiteGrad.addColorStop(1, 'rgba(240,240,240,0.02)');

  ctx.beginPath();
  ctx.moveTo(evalGraphPoints[0].x, zeroY);
  evalGraphPoints.forEach(p => ctx.lineTo(p.x, Math.min(p.y, zeroY)));
  ctx.lineTo(evalGraphPoints[evalGraphPoints.length - 1].x, zeroY);
  ctx.closePath();
  ctx.fillStyle = whiteGrad;
  ctx.fill();

  // black advantage fill (below zero)
  const blackGrad = ctx.createLinearGradient(0, zeroY, 0, H - pad.bottom);
  blackGrad.addColorStop(0, 'rgba(56,189,248,0.02)');
  blackGrad.addColorStop(1, 'rgba(56,189,248,0.2)');

  ctx.beginPath();
  ctx.moveTo(evalGraphPoints[0].x, zeroY);
  evalGraphPoints.forEach(p => ctx.lineTo(p.x, Math.max(p.y, zeroY)));
  ctx.lineTo(evalGraphPoints[evalGraphPoints.length - 1].x, zeroY);
  ctx.closePath();
  ctx.fillStyle = blackGrad;
  ctx.fill();

  // main line
  ctx.beginPath();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth   = 2;
  ctx.lineJoin    = 'round';
  evalGraphPoints.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // dots
  evalGraphPoints.forEach((p, i) => {
    const isLast = i === evalGraphPoints.length - 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, isLast ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = isLast ? '#38bdf8' : 'rgba(56,189,248,0.5)';
    ctx.fill();
  });

  // x-axis move labels
  ctx.fillStyle  = 'rgba(100,116,139,0.7)';
  ctx.font       = '9px Arial';
  ctx.textAlign  = 'center';
  evalGraphPoints.forEach((p, i) => {
    if (i % Math.max(1, Math.floor(evalGraphPoints.length / 8)) === 0) {
      ctx.fillText(p.label || i, p.x, H - 6);
    }
  });

  // y-axis labels
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(100,116,139,0.7)';
  ctx.font      = '9px Arial';
  ctx.fillText('+' + maxR.toFixed(0), pad.left - 4, pad.top + 10);
  ctx.fillText(minR.toFixed(0),       pad.left - 4, H - pad.bottom - 2);
}

// tooltip on hover
function initEvalGraphInteraction() {
  const canvas = document.getElementById('evalGraph');
  if (!canvas || canvas.dataset.interactive) return;
  canvas.dataset.interactive = '1';

  // create tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'eval-graph-tooltip';
  tooltip.id = 'evalGraphTooltip';
  canvas.parentElement.style.position = 'relative';
  canvas.parentElement.appendChild(tooltip);

  canvas.addEventListener('mousemove', (e) => {
    if (evalGraphPoints.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mx   = (e.clientX - rect.left) * (canvas.width / rect.width);

    // find nearest point
    let nearest = null;
    let minDist = Infinity;
    evalGraphPoints.forEach(p => {
      const d = Math.abs(p.x - mx);
      if (d < minDist) { minDist = d; nearest = p; }
    });

    if (nearest && minDist < 30) {
      tooltip.style.display = 'block';
      tooltip.style.left    = Math.min(e.offsetX + 12, canvas.offsetWidth - 140) + 'px';
      tooltip.style.top     = (e.offsetY - 60) + 'px';
      const score = nearest.score > 0 ? '+' + nearest.score.toFixed(2) : nearest.score.toFixed(2);
      tooltip.innerHTML = `
        <strong>${nearest.label || 'Move ' + nearest.index}</strong>
        Eval: ${score}<br>
        <span style="font-size:10px;color:var(--text-dim);">Click to jump here</span>
      `;
    } else {
      tooltip.style.display = 'none';
    }
  });

  canvas.addEventListener('mouseleave', () => {
    const t = document.getElementById('evalGraphTooltip');
    if (t) t.style.display = 'none';
  });

  // click to jump to move
  canvas.addEventListener('click', (e) => {
    if (evalGraphPoints.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mx   = (e.clientX - rect.left) * (canvas.width / rect.width);

    let nearest = null;
    let minDist = Infinity;
    evalGraphPoints.forEach(p => {
      const d = Math.abs(p.x - mx);
      if (d < minDist) { minDist = d; nearest = p; }
    });

    if (nearest && minDist < 40) {
      // jump to that move in engine
      const history = engineGame.history({ verbose: true });
      const target  = nearest.index;
      const game    = new Chess();
      for (let i = 0; i <= target && i < history.length; i++) {
        game.move({ from: history[i].from, to: history[i].to, promotion: history[i].promotion || 'q' });
      }
      engineGame = game;
      engineBoard.position(engineGame.fen());
      renderEngineMoves();
      updateEvalBar(nearest.score);
      toast(`Jumped to move ${nearest.index + 1}: ${nearest.label}`, 'info');
    }
  });
}

// ══════════════════════════════════════════════════════════════
// FEATURE 3: BOARD THEMES
// ══════════════════════════════════════════════════════════════
const BOARD_THEMES = [
  {
    id: 'classic',
    name: 'Classic',
    light: '#f0d9b5',
    dark:  '#b58863',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    light: '#dee3e6',
    dark:  '#8ca2ad',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    light: '#e8edf9',
    dark:  '#4a6fa5',
  },
  {
    id: 'forest',
    name: 'Forest',
    light: '#ffffdd',
    dark:  '#86a666',
  },
  {
    id: 'purple',
    name: 'Purple',
    light: '#f0e8ff',
    dark:  '#7c4daa',
  },
  {
    id: 'slate',
    name: 'Slate',
    light: '#cdd5e0',
    dark:  '#4a5568',
  },
  {
    id: 'rose',
    name: 'Rose',
    light: '#ffe8e8',
    dark:  '#c0454a',
  },
  {
    id: 'cyber',
    name: 'Cyber',
    light: '#0f3460',
    dark:  '#16213e',
  },
];

const PIECE_SETS = [
  { id: 'wikipedia', name: '♟ Classic',  url: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png' },
  { id: 'alpha',     name: '🔷 Alpha',   url: 'https://lichess1.org/assets/piece/alpha/{piece}.svg' },
  { id: 'cburnett',  name: '🎨 Modern',  url: 'https://lichess1.org/assets/piece/cburnett/{piece}.svg' },
  { id: 'merida',    name: '👑 Merida',  url: 'https://lichess1.org/assets/piece/merida/{piece}.svg' },
];

let currentBoardTheme = localStorage.getItem('boardTheme') || 'classic';
let currentPieceSet   = localStorage.getItem('pieceSet')   || 'wikipedia';

function applyBoardTheme(themeId) {
  const theme = BOARD_THEMES.find(t => t.id === themeId);
  if (!theme) return;

  currentBoardTheme = themeId;
  localStorage.setItem('boardTheme', themeId);

  // inject/update CSS for board squares
  let styleEl = document.getElementById('boardThemeStyle');
  if (!styleEl) {
    styleEl    = document.createElement('style');
    styleEl.id = 'boardThemeStyle';
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = `
    .board-b72b1 .white-1e1d7 { background-color: ${theme.light} !important; }
    .board-b72b1 .black-3c85d { background-color: ${theme.dark}  !important; }
    .white-1e1d7 { background-color: ${theme.light} !important; }
    .black-3c85d { background-color: ${theme.dark}  !important; }
  `;

  // update active swatch
  document.querySelectorAll('.board-swatch').forEach(s => {
    s.classList.toggle('swatch-active', s.dataset.theme === themeId);
  });

  toast(`Board theme: ${theme.name} 🎨`, 'success');
}

function applyPieceSet(setId) {
  const set = PIECE_SETS.find(s => s.id === setId);
  if (!set) return;

  currentPieceSet = setId;
  localStorage.setItem('pieceSet', setId);

  // rebuild all active boards with new piece set
  const boards = [
    { id: 'engineBoard', game: engineGame },
    { id: 'board',       game: currentBoard?.chess },
    { id: 'playBoard',   game: playGame },
    { id: 'puzzleBoard', game: puzzleGame },
  ];

  boards.forEach(({ id, game }) => {
    const el = document.getElementById(id);
    if (!el || !game) return;
    // chessboard.js re-renders pieces on position() call
    const existing = window[id + 'Instance'];
    if (existing) existing.position(game.fen(), false);
  });

  // update active button
  document.querySelectorAll('.piece-set-btn').forEach(b => {
    b.classList.toggle('set-active', b.dataset.set === setId);
  });

  toast(`Piece set: ${set.name}`, 'success');
}

function renderThemePanel() {
  const existing = document.getElementById('themePanel');
  if (existing) return;

  const evalContainer = document.getElementById('evalGraphContainer');
  if (!evalContainer) return;

  const panel = document.createElement('div');
  panel.id = 'themePanel';
  panel.className = 'theme-panel';

  panel.innerHTML = `
    <div class="theme-panel-title">🎨 Board Themes</div>

    <div class="theme-section-label">Board Colors</div>
    <div class="board-color-grid">
      ${BOARD_THEMES.map(t => `
        <div
          class="board-swatch ${t.id === currentBoardTheme ? 'swatch-active' : ''}"
          data-theme="${t.id}"
          title="${t.name}"
          onclick="applyBoardTheme('${t.id}')"
        >
          <div class="sq-light" style="background:${t.light};"></div>
          <div class="sq-dark"  style="background:${t.dark};"></div>
          <div class="sq-dark"  style="background:${t.dark};"></div>
          <div class="sq-light" style="background:${t.light};"></div>
        </div>
      `).join('')}
    </div>

    <div class="theme-section-label" style="margin-top:14px;">Piece Sets</div>
    <div class="piece-set-grid">
      ${PIECE_SETS.map(s => `
        <button
          class="piece-set-btn ${s.id === currentPieceSet ? 'set-active' : ''}"
          data-set="${s.id}"
          onclick="applyPieceSet('${s.id}')"
        >${s.name}</button>
      `).join('')}
    </div>
  `;

  evalContainer.after(panel);
}

// ─── PATCH initEngineBoard: inject features after init ────────
const _initEngineBoardOrig = initEngineBoard;
// Override using variable assignment to avoid duplicate function declaration
window._patchedInitEngine  = false;
const _originalInitEngine  = initEngineBoard;

// Monkey-patch: wrap initEngineBoard to inject panels after board init
(function() {
  const orig = initEngineBoard;
  window.initEngineBoard = function() {
    orig();
    if (!window._engineFeaturesInjected) {
      setTimeout(() => {
        injectReviewPanel();
        renderThemePanel();
        initEvalGraphInteraction();
        applyBoardTheme(currentBoardTheme);
        window._engineFeaturesInjected = true;
      }, 600);
    }
  };
})();

// Monkey-patch: wrap drawEvalGraph to always re-init interaction
(function() {
  const orig = drawEvalGraph;
  window.drawEvalGraph = function() {
    orig();
    initEvalGraphInteraction();
  };
})();

// ══════════════════════════════════════════════════════════════
// ─── PLAYER IMAGE & GAME DISPLAY FIXES ───────────────────────
// ══════════════════════════════════════════════════════════════

// ─── SAFE IMAGE URL ────────────────────────────────────────────
function safeImage(url, size = 80) {
  if (url && typeof url === 'string' && url.trim().startsWith('http')) {
    return url.trim();
  }
  return `https://placehold.co/${size}x${size}/1e293b/38bdf8?text=%E2%99%9F`;
}

// ─── PATCH renderPlayers TO USE safeImage ─────────────────────
const _renderPlayersOrig = renderPlayers;


// ─── PATCH openProfile TO USE safeImage ───────────────────────
const _openProfileForImage = openProfile;


// Debug logging removed - fetchPlayers handles this natively
