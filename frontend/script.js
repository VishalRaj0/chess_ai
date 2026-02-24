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

// ─── Color picker modal ───────────────────────────────────────────────────────

const modal = document.getElementById('color-modal');

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

    // Update header badge
    const badge = document.getElementById('color-badge');
    badge.textContent = color === 'white' ? '♔ Playing as White' : '♚ Playing as Black';
    badge.className = `color-badge ${color}`;

    document.getElementById('new-game-btn').classList.remove('btn-highlight');

    buildStaticLabels();
    renderBoard();
    setStatus('Connecting to server…', '');

    await connectToBackend(color);
}

// ─── Backend ──────────────────────────────────────────────────────────────────

async function connectToBackend(color) {
    try {
        const res = await fetch(`${API}/games/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ human_color: color }),
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
            headers: { 'Content-Type': 'application/json' },
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
            headers: { 'Content-Type': 'application/json' },
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

// ─── Topbar Buttons ─────────────────────────────────────────────────────────

document.getElementById('new-game-btn').addEventListener('click', () => {
    if (isWaiting) return;
    showModal(); // Let user pick color again
});

document.getElementById('surrender-btn').addEventListener('click', surrenderGame);

async function surrenderGame() {
    if (!gameId || gameOver || isWaiting) return;
    if (!confirm("Are you sure you want to surrender?")) return;

    isWaiting = true;
    try {
        const res = await fetch(`${API}/surrender/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
}

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
