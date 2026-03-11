/* =====================================================================
   Chess AI – script.js  (ES Module)
   Human chooses White or Black at game start.
   Board flips automatically to show human's pieces at the bottom.
   chess.js 0.13.4 API.
   ===================================================================== */

import { Chess } from 'https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.13.4/chess.min.js';

const API = 'http://localhost:8000/api';

const GLYPHS = {
    wp: '♙', wr: '♖', wn: '♘', wb: '♗', wq: '♕', wk: '♔',
    bp: '♟', br: '♜', bn: '♞', bb: '♝', bq: '♛', bk: '♚',
};

// a–h for White view; h–a for Black (flipped)
const FILES_WHITE = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const FILES_BLACK = ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];

let chess = new Chess();
let gameId = null;
let humanColor = null;    // 'white' | 'black' — set when modal is resolved
let selectedSquare = null;
let legalTargets = [];
let isWaiting = false;
let gameOver = false;
let lastMove = null;
let moveCount = 0;
let currentDifficulty = 10;
let currentGameType = 'competitive';

// Auth State
let authToken = localStorage.getItem('chess_ai_token');
let currentUsername = localStorage.getItem('chess_ai_username');

// ─── Color picker modal ───────────────────────────────────────────────────────

const modal = document.getElementById('color-modal');
const difficultySlider = document.getElementById('difficulty-slider');
const difficultyDisplay = document.getElementById('difficulty-display');

// Update difficulty display live
if (difficultySlider && difficultyDisplay) {
    difficultySlider.addEventListener('input', (e) => {
        difficultyDisplay.textContent = e.target.value;
    });
}

// Update UI based on initial auth state
updateAuthUI();

// Show modal on page load
showModal();

function showModal() {
    modal.classList.remove('hidden');
}
function hideModal() {
    modal.classList.add('hidden');
}

document.getElementById('pick-white').addEventListener('click', () => startGame('white'));
document.getElementById('pick-black').addEventListener('click', () => startGame('black'));

async function startGame(color) {
    hideModal();
    humanColor = color;
    chess = new Chess();
    lastMove = null;
    gameOver = false;
    moveCount = 0;
    clearSelection();

    document.getElementById('move-list').innerHTML = '';
    document.getElementById('move-count').textContent = '0';
    document.getElementById('chat-messages').innerHTML = '';

    // Read difficulty from slider
    const diffValue = difficultySlider ? difficultySlider.value : 10;

    // Read game type
    const typeSelector = document.querySelector('input[name="game_type"]:checked');
    currentGameType = typeSelector ? typeSelector.value : 'competitive';
    currentDifficulty = diffValue;

    // Update header badge
    const badge = document.getElementById('color-badge');
    badge.textContent = color === 'white'
        ? `♔ Playing as White (Level ${diffValue} - ${currentGameType})`
        : `♚ Playing as Black (Level ${diffValue} - ${currentGameType})`;
    badge.className = `color-badge ${color}`;

    // Show/hide Undo
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
        if (currentGameType === 'practice') {
            undoBtn.classList.remove('hidden');
        } else {
            undoBtn.classList.add('hidden');
        }
    }

    document.getElementById('new-game-btn').classList.remove('btn-highlight');

    buildStaticLabels();
    renderBoard();
    setStatus('Connecting to server…', '');

    await connectToBackend(color, diffValue);
}

// ─── Backend ──────────────────────────────────────────────────────────────────

function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
        headers['Authorization'] = `Token ${authToken}`;
    }
    return headers;
}

async function connectToBackend(color, difficulty) {
    try {
        const res = await fetch(`${API}/games/`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ human_color: color, difficulty: difficulty, game_type: currentGameType }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        gameId = data.game_id;

        // If playing Black, backend already made Stockfish's first White move
        if (color === 'black' && data.engine_first_move) {
            const sfFrom = data.engine_first_move.substring(0, 2);
            const sfTo = data.engine_first_move.substring(2, 4);
            const sfProm = data.engine_first_move.length > 4 ? data.engine_first_move[4] : 'q';
            chess.move({ from: sfFrom, to: sfTo, promotion: sfProm });
            lastMove = { from: sfFrom, to: sfTo };
            addMoveToHistory(data.engine_first_move, 'Stockfish (White)');
            renderBoard();
        }

        updateStatus();
        addChatMsg('coach', color === 'white'
            ? "Hello! You play White — move a pawn to start, then ask me anything!"
            : "Hello! You play Black — Stockfish just opened for White. It's your turn!");

        document.getElementById('surrender-btn').classList.remove('hidden');
    } catch (err) {
        setStatus('Cannot reach backend. Is Django running on port 8000?', 'gameover');
        console.error('Backend error:', err);
    }
}

// ─── Static labels ────────────────────────────────────────────────────────────

function buildStaticLabels() {
    // Rank labels: White view top=8, Black view top=1
    const rankContainer = document.getElementById('rank-labels');
    rankContainer.innerHTML = '';
    const ranks = humanColor === 'black'
        ? [1, 2, 3, 4, 5, 6, 7, 8]      // 1 at top for Black
        : [8, 7, 6, 5, 4, 3, 2, 1];     // 8 at top for White
    ranks.forEach(r => {
        const el = document.createElement('div');
        el.className = 'rank-label';
        el.textContent = r;
        rankContainer.appendChild(el);
    });

    // File labels: a–h for White, h–a for Black
    const fileContainer = document.getElementById('file-labels');
    fileContainer.innerHTML = '';
    const files = humanColor === 'black' ? FILES_BLACK : FILES_WHITE;
    files.forEach(f => {
        const el = document.createElement('div');
        el.className = 'file-label';
        el.textContent = f;
        fileContainer.appendChild(el);
    });
}

// ─── Board rendering ──────────────────────────────────────────────────────────

function renderBoard() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';

    const flipped = humanColor === 'black';
    const files = flipped ? FILES_BLACK : FILES_WHITE;
    // ranks: White = 8 down to 1, Black = 1 up to 8
    const ranks = flipped
        ? [1, 2, 3, 4, 5, 6, 7, 8]
        : [8, 7, 6, 5, 4, 3, 2, 1];

    for (const rank of ranks) {
        for (const file of files) {
            const sq = `${file}${rank}`;
            // Colour formula: same regardless of flip — a1 is always dark
            const fi = FILES_WHITE.indexOf(file);
            const isLight = (fi + rank) % 2 === 0;

            const el = document.createElement('div');
            el.className = `square ${isLight ? 'light' : 'dark'}`;
            el.id = `sq-${sq}`;
            el.dataset.sq = sq;

            const piece = chess.get(sq);
            if (piece) {
                const p = document.createElement('div');
                p.className = `piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}`;
                p.textContent = GLYPHS[piece.color + piece.type] || '';
                el.appendChild(p);
            }

            el.addEventListener('click', () => handleSquareClick(sq));
            boardEl.appendChild(el);
        }
    }

    applyHighlights();
}

function applyHighlights() {
    if (lastMove) {
        document.getElementById(`sq-${lastMove.from}`)?.classList.add('last-move');
        document.getElementById(`sq-${lastMove.to}`)?.classList.add('last-move');
    }
    if (selectedSquare) {
        document.getElementById(`sq-${selectedSquare}`)?.classList.add('selected');
    }
    legalTargets.forEach(sq => {
        const el = document.getElementById(`sq-${sq}`);
        if (!el) return;
        el.classList.add(chess.get(sq) ? 'can-capture' : 'can-move');
    });
}

// ─── Click interaction ────────────────────────────────────────────────────────

function handleSquareClick(sq) {
    if (isWaiting || gameOver || !gameId || !humanColor) return;

    // Only allow moves when it's the human's turn
    const myColor = humanColor === 'white' ? 'w' : 'b';
    if (chess.turn() !== myColor) return;

    const piece = chess.get(sq);

    if (selectedSquare) {
        if (legalTargets.includes(sq)) {
            executePlayerMove(selectedSquare, sq);
            clearSelection();
            return;
        }
        if (selectedSquare === sq) { clearSelection(); renderBoard(); return; }
        if (piece && piece.color === myColor) { clearSelection(); selectSquare(sq); renderBoard(); return; }
        clearSelection(); renderBoard(); return;
    }

    if (piece && piece.color === myColor) {
        selectSquare(sq);
        renderBoard();
    }
}

function selectSquare(sq) {
    selectedSquare = sq;
    legalTargets = chess.moves({ square: sq, verbose: true }).map(m => m.to);
}
function clearSelection() {
    selectedSquare = null;
    legalTargets = [];
}

// ─── Move execution ───────────────────────────────────────────────────────────

async function executePlayerMove(from, to) {
    let uci = `${from}${to}`;
    const piece = chess.get(from);
    const myColor = humanColor === 'white' ? 'w' : 'b';
    if (piece?.type === 'p' &&
        ((myColor === 'w' && to[1] === '8') || (myColor === 'b' && to[1] === '1'))) {
        uci += 'q';
    }

    const result = chess.move({ from, to, promotion: 'q' });
    if (!result) return;

    lastMove = { from, to };
    renderBoard();

    const colorLabel = humanColor === 'white' ? 'You (White)' : 'You (Black)';
    addMoveToHistory(uci, colorLabel);
    setStatus('Stockfish is thinking…', 'thinking');
    isWaiting = true;

    try {
        const res = await fetch(`${API}/play/`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ game_id: gameId, move: uci }),
        });
        const data = await res.json();

        if (data.error) { setStatus(`Error: ${data.error}`, 'gameover'); isWaiting = false; return; }

        if (data.engine_move) {
            const sfFrom = data.engine_move.substring(0, 2);
            const sfTo = data.engine_move.substring(2, 4);
            const sfProm = data.engine_move.length > 4 ? data.engine_move[4] : 'q';
            chess.move({ from: sfFrom, to: sfTo, promotion: sfProm });
            lastMove = { from: sfFrom, to: sfTo };
            const sfLabel = humanColor === 'white' ? 'Stockfish (Black)' : 'Stockfish (White)';
            addMoveToHistory(data.engine_move, sfLabel);
        }

        renderBoard();

        if (data.game_over) {
            gameOver = true;
            const resultMsg = data.result || `Game over — ${data.winner} wins!`;
            setStatus(resultMsg, 'gameover');
            addChatMsg('coach', `Game over! ${resultMsg}`);
            document.getElementById('surrender-btn').classList.add('hidden');
            document.getElementById('new-game-btn').classList.add('btn-highlight');
        } else {
            const inCheck = data.in_check || chess.in_check();
            const yourTurn = humanColor === 'white' ? 'Your turn (White)' : 'Your turn (Black)';
            setStatus(inCheck ? `${yourTurn} — Check! ⚠` : yourTurn, inCheck ? 'check' : '');
        }
    } catch (err) {
        setStatus('Connection error — is the backend running?', 'gameover');
        console.error(err);
    }

    isWaiting = false;
}

// ─── Status ───────────────────────────────────────────────────────────────────

function updateStatus() {
    if (gameOver || chess.game_over()) {
        setStatus('Game over!', 'gameover'); return;
    }
    const myColor = humanColor === 'white' ? 'w' : 'b';
    const yourTurn = humanColor === 'white' ? 'Your turn (White)' : 'Your turn (Black)';
    const sfTurn = humanColor === 'white' ? 'Stockfish (Black) thinking…' : 'Stockfish (White) thinking…';

    if (chess.turn() !== myColor) {
        setStatus(sfTurn, 'thinking');
    } else if (chess.in_check()) {
        setStatus(`${yourTurn} — Check! ⚠`, 'check');
    } else {
        setStatus(yourTurn, '');
    }
}

function setStatus(msg, cls) {
    const el = document.getElementById('status-bar');
    el.textContent = msg;
    el.className = 'status-bar' + (cls ? ` ${cls}` : '');
}

// ─── Move history ─────────────────────────────────────────────────────────────

function addMoveToHistory(uci, player) {
    moveCount++;
    const list = document.getElementById('move-list');
    const item = document.createElement('div');
    const isHuman = player.startsWith('You');
    item.className = `move-item ${isHuman ? 'user-move' : 'stockfish-move'}`;
    item.innerHTML = `
    <span class="move-num">${moveCount}</span>
    <span class="move-uci">${uci}</span>
    <span class="move-who">${isHuman ? 'You' : 'CPU'}</span>
  `;
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
    document.getElementById('move-count').textContent = moveCount;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

function addChatMsg(role, text) {
    const container = document.getElementById('chat-messages');
    const msg = document.createElement('div');
    msg.className = `chat-msg ${role}`;
    msg.textContent = text;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    return msg;
}

async function sendChat(message) {
    if (!gameId) { addChatMsg('coach', 'No game active yet.'); return; }
    addChatMsg('user', message);
    const thinking = addChatMsg('thinking', '…thinking…');
    try {
        const res = await fetch(`${API}/chat/`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ game_id: gameId, message }),
        });
        const data = await res.json();
        thinking.remove();
        addChatMsg('coach', data.response || 'Sorry, could not generate a response.');
    } catch {
        thinking.remove();
        addChatMsg('coach', 'Connection error. Make sure the backend is running.');
    }
}

// ─── Topbar Buttons & Surrender Modal ─────────────────────────────────────────

document.getElementById('new-game-btn').addEventListener('click', () => {
    if (isWaiting) return;
    showModal(); // Let user pick color again
});

const surrenderModal = document.getElementById('surrender-modal');

document.getElementById('surrender-btn').addEventListener('click', () => {
    if (!gameId || gameOver || isWaiting) return;
    surrenderModal.classList.remove('hidden');
});

document.getElementById('btn-cancel-surrender').addEventListener('click', () => {
    surrenderModal.classList.add('hidden');
});

document.getElementById('btn-confirm-surrender').addEventListener('click', async () => {
    surrenderModal.classList.add('hidden');

    isWaiting = true;
    try {
        const res = await fetch(`${API}/surrender/`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ game_id: gameId }),
        });
        const data = await res.json();

        if (data.error) {
            setStatus(`Error: ${data.error}`, 'gameover');
        } else {
            gameOver = true;
            setStatus(data.message, 'gameover');
            addChatMsg('coach', `You surrendered. Stockfish wins!`);
            document.getElementById('surrender-btn').classList.add('hidden');
            document.getElementById('new-game-btn').classList.add('btn-highlight');
        }
    } catch (err) {
        setStatus('Connection error — is the backend running?', 'gameover');
        console.error(err);
    }
    isWaiting = false;
});

document.getElementById('undo-btn').addEventListener('click', async () => {
    if (!gameId || gameOver || isWaiting) return;

    setStatus('Undoing move...', 'thinking');
    isWaiting = true;

    try {
        const res = await fetch(`${API}/undo/`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ game_id: gameId })
        });
        const data = await res.json();

        if (data.error) {
            setStatus(data.error, 'gameover');
            isWaiting = false;
            return;
        }

        // Successfully undid, restore state via resumeGame
        await resumeGame(gameId, currentDifficulty, currentGameType);
        addChatMsg('coach', 'Move undid. Try again!');
    } catch (err) {
        setStatus('Failed to undo', 'gameover');
        console.error(err);
    }
    isWaiting = false;
});

// ─── Chat form ────────────────────────────────────────────────────────────────

document.getElementById('chat-form').addEventListener('submit', e => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    sendChat(msg);
});

document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => sendChat(btn.dataset.msg));
});

// ─── Authentication & Profile ─────────────────────────────────────────────────

const authModal = document.getElementById('auth-modal');
const btnShowLogin = document.getElementById('btn-show-login');
const btnCloseAuth = document.getElementById('btn-close-auth');
const authForm = document.getElementById('auth-form');
const authSwitchLink = document.getElementById('auth-switch-link');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authSwitchText = document.getElementById('auth-switch-text');
const authError = document.getElementById('auth-error');

let isLoginMode = true;

btnShowLogin.addEventListener('click', () => {
    authModal.classList.remove('hidden');
    resetAuthForm();
});

btnCloseAuth.addEventListener('click', () => {
    authModal.classList.add('hidden');
});

authSwitchLink.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    if (isLoginMode) {
        authTitle.textContent = 'Login';
        authSubtitle.textContent = 'Sign in to track your stats';
        authSubmitBtn.textContent = 'Login';
        authSwitchText.textContent = "Don't have an account?";
        authSwitchLink.textContent = 'Register';
    } else {
        authTitle.textContent = 'Register';
        authSubtitle.textContent = 'Create an account to track your stats';
        authSubmitBtn.textContent = 'Register';
        authSwitchText.textContent = 'Already have an account?';
        authSwitchLink.textContent = 'Login';
    }
    resetAuthForm();
});

function resetAuthForm() {
    authForm.reset();
    authError.classList.add('hidden');
    authError.textContent = '';
}

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value.trim();

    authError.classList.add('hidden');
    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = 'Please wait...';

    const endpoint = isLoginMode ? '/auth/login/' : '/auth/register/';

    try {
        const res = await fetch(`${API}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Authentication failed');
        }

        authToken = data.token;
        currentUsername = data.username;
        localStorage.setItem('chess_ai_token', authToken);
        localStorage.setItem('chess_ai_username', currentUsername);

        updateAuthUI();
        authModal.classList.add('hidden');

    } catch (err) {
        authError.textContent = err.message;
        authError.classList.remove('hidden');
    } finally {
        authSubmitBtn.disabled = false;
        authSubmitBtn.textContent = isLoginMode ? 'Login' : 'Register';
    }
});

function updateAuthUI() {
    const authButtons = document.getElementById('auth-buttons');
    const userMenu = document.getElementById('user-menu');
    const userGreeting = document.getElementById('user-greeting');

    if (authToken && currentUsername) {
        authButtons.classList.add('hidden');
        userMenu.classList.remove('hidden');
        userGreeting.textContent = `Hi, ${currentUsername}`;
    } else {
        authButtons.classList.remove('hidden');
        userMenu.classList.add('hidden');
    }
}

// ─── Profile Modal ────────────────────────────────────────────────────────────

const profileModal = document.getElementById('profile-modal');
const btnShowProfile = document.getElementById('btn-show-profile');
const btnCloseProfile = document.getElementById('btn-close-profile');
const btnLogout = document.getElementById('btn-logout');

btnShowProfile.addEventListener('click', async () => {
    profileModal.classList.remove('hidden');
    await loadProfileData();
});

btnCloseProfile.addEventListener('click', () => {
    profileModal.classList.add('hidden');
});

btnLogout.addEventListener('click', async () => {
    try {
        await fetch(`${API}/auth/logout/`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
    } catch (e) {
        console.error('Logout error:', e);
    }

    authToken = null;
    currentUsername = null;
    localStorage.removeItem('chess_ai_token');
    localStorage.removeItem('chess_ai_username');

    updateAuthUI();
    profileModal.classList.add('hidden');
});

async function loadProfileData() {
    try {
        const res = await fetch(`${API}/profile/`, {
            headers: getAuthHeaders()
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error);

        document.getElementById('profile-username').textContent = `${data.username}'s Profile`;
        document.getElementById('stat-total').textContent = data.stats.total_games;
        document.getElementById('stat-wins').textContent = data.stats.wins;
        document.getElementById('stat-losses').textContent = data.stats.losses;
        document.getElementById('stat-draws').textContent = data.stats.draws;

        const historyList = document.getElementById('history-list');
        historyList.innerHTML = '';

        if (data.history.length === 0) {
            historyList.innerHTML = '<p style="color:#8b949e;text-align:center;padding:1rem;">No games played yet.</p>';
            return;
        }

        data.history.forEach(game => {
            const date = new Date(game.created_at).toLocaleDateString();
            let resultClass = '';
            let resultText = '';

            if (!game.is_finished) {
                resultClass = 'result-draw';
                resultText = 'In Progress';
            } else if (game.winner === 'draw') {
                resultClass = 'result-draw';
                resultText = 'Draw';
            } else if (game.winner === 'user') {
                resultClass = 'result-win';
                resultText = 'Victory';
            } else {
                resultClass = 'result-loss';
                resultText = 'Defeat';
            }

            const colorText = game.human_color === 'white' ? 'White' : 'Black';
            const modeText = game.game_type === 'practice' ? 'Practice' : 'Competitive';

            const item = document.createElement('div');
            item.className = 'history-item';

            const btnHtml = !game.is_finished ? `<button class="btn-resume">Resume</button>` : '';

            item.innerHTML = `
                <div class="history-info">
                    <span class="history-date">${date}</span>
                    <span class="history-details">Played as ${colorText} • ${modeText} • Lvl ${game.difficulty} • ${game.move_count} moves</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="history-result ${resultClass}">${resultText}</div>
                    ${btnHtml}
                </div>
            `;

            if (!game.is_finished) {
                const btn = item.querySelector('.btn-resume');
                if (btn) btn.addEventListener('click', () => {
                    resumeGame(game.game_id, game.difficulty, game.game_type);
                });
            }

            historyList.appendChild(item);
        });
    } catch (e) {
        console.error('Failed to load profile:', e);
    }
}

async function resumeGame(id, difficulty, gameType) {
    profileModal.classList.add('hidden');
    setStatus('Loading game...', '');

    try {
        const res = await fetch(`${API}/games/${id}/`, {
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        gameId = data.game_id;
        humanColor = data.human_color;
        gameOver = data.is_finished;
        currentDifficulty = difficulty;
        currentGameType = gameType;

        chess.load(data.fen);

        // reconstruct move history
        document.getElementById('move-list').innerHTML = '';
        moveCount = 0;
        lastMove = null;

        data.moves.forEach(m => {
            const isHuman = m.player === 'user';
            moveCount++;
            const list = document.getElementById('move-list');
            const item = document.createElement('div');
            item.className = `move-item ${isHuman ? 'user-move' : 'stockfish-move'}`;
            item.innerHTML = `
            <span class="move-num">${moveCount}</span>
            <span class="move-uci">${m.move}</span>
            <span class="move-who">${isHuman ? 'You' : 'CPU'}</span>
            `;
            list.appendChild(item);

            lastMove = { from: m.move.substring(0, 2), to: m.move.substring(2, 4) };
        });
        const mlist = document.getElementById('move-list');
        mlist.scrollTop = mlist.scrollHeight;

        document.getElementById('move-count').textContent = moveCount;
        document.getElementById('chat-messages').innerHTML = ''; // clear chat for resumed session

        const badge = document.getElementById('color-badge');
        badge.textContent = humanColor === 'white'
            ? `♔ Playing as White (Level ${difficulty} - ${gameType})`
            : `♚ Playing as Black (Level ${difficulty} - ${gameType})`;
        badge.className = `color-badge ${humanColor}`;

        const undoBtn = document.getElementById('undo-btn');
        if (undoBtn) {
            if (gameType === 'practice' && !gameOver) {
                undoBtn.classList.remove('hidden');
            } else {
                undoBtn.classList.add('hidden');
            }
        }

        document.getElementById('new-game-btn').classList.remove('btn-highlight');
        if (!gameOver) {
            document.getElementById('surrender-btn').classList.remove('hidden');
        } else {
            document.getElementById('surrender-btn').classList.add('hidden');
        }

        clearSelection();
        buildStaticLabels();
        renderBoard();
        updateStatus();
        hideModal(); // in case new game modal was open

    } catch (e) {
        console.error("Resume failed:", e);
        setStatus('Failed to resume game', 'gameover');
    }
}
