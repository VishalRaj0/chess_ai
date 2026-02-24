/* =====================================================================
   Chess AI – script.js  (ES Module)
   Human = White | Stockfish = Black
   chess.js 0.13.4 API.
   ===================================================================== */

import { Chess } from 'https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.13.4/chess.min.js';

const API = 'http://localhost:8000/api';

const GLYPHS = {
    wp: '♙', wr: '♖', wn: '♘', wb: '♗', wq: '♕', wk: '♔',
    bp: '♟', br: '♜', bn: '♞', bb: '♝', bq: '♛', bk: '♚',
};
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

let chess = new Chess();
let gameId = null;
let selectedSquare = null;
let legalTargets = [];
let isWaiting = false;   // true while Stockfish is computing
let gameOver = false;
let lastMove = null;    // {from, to}
let moveCount = 0;

// ─── Boot ─────────────────────────────────────────────────────────────────────

buildStaticLabels();
renderBoard();
setStatus('Connecting to server…', '');
connectToBackend();

// ─── Backend ──────────────────────────────────────────────────────────────────

async function connectToBackend() {
    try {
        const res = await fetch(`${API}/games/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        gameId = data.game_id;
        gameOver = false;
        updateStatus();
        addChatMsg('coach', "Hello! I'm your chess coach. You play White — make a move, then ask me anything!");
    } catch (err) {
        setStatus('Cannot reach backend. Is Django running on port 8000?', 'gameover');
        console.error('Backend error:', err);
    }
}

// ─── Static labels ────────────────────────────────────────────────────────────

function buildStaticLabels() {
    const rankContainer = document.getElementById('rank-labels');
    rankContainer.innerHTML = '';
    for (let rank = 8; rank >= 1; rank--) {
        const el = document.createElement('div');
        el.className = 'rank-label';
        el.textContent = rank;
        rankContainer.appendChild(el);
    }
    const fileContainer = document.getElementById('file-labels');
    fileContainer.innerHTML = '';
    FILES.forEach(f => {
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

    for (let rank = 8; rank >= 1; rank--) {
        for (let fi = 0; fi < 8; fi++) {
            const file = FILES[fi];
            const sq = `${file}${rank}`;
            const isLight = (fi + rank) % 2 === 0;  // h1 light ✓, a1 dark ✓

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

// ─── Click: only allow White moves ────────────────────────────────────────────

function handleSquareClick(squareName) {
    // Block all interaction while Stockfish is thinking, game is over, or it's Black's turn
    if (isWaiting || gameOver || !gameId) return;
    if (chess.turn() !== 'w') return;   // only human (White) can move

    const piece = chess.get(squareName);

    if (selectedSquare) {
        if (legalTargets.includes(squareName)) {
            executePlayerMove(selectedSquare, squareName);
            clearSelection();
            return;
        }
        if (selectedSquare === squareName) { clearSelection(); renderBoard(); return; }
        if (piece && piece.color === 'w') { clearSelection(); selectSquare(squareName); renderBoard(); return; }
        clearSelection(); renderBoard(); return;
    }

    // Only allow selecting White's pieces
    if (piece && piece.color === 'w') {
        selectSquare(squareName);
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
    // Build UCI notation
    let uci = `${from}${to}`;
    const piece = chess.get(from);
    if (piece?.type === 'p' &&
        ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'))) {
        uci += 'q'; // auto-promote to queen
    }

    // Apply locally for immediate feedback
    const result = chess.move({ from, to, promotion: 'q' });
    if (!result) return;

    lastMove = { from, to };
    renderBoard();
    addMoveToHistory(uci, 'You (White)');
    setStatus('Stockfish (Black) is thinking…', 'thinking');
    isWaiting = true;

    try {
        const res = await fetch(`${API}/play/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_id: gameId, move: uci }),
        });
        const data = await res.json();

        if (data.error) {
            setStatus(`Error: ${data.error}`, 'gameover');
            isWaiting = false;
            return;
        }

        // Apply Stockfish's (Black) response move
        if (data.engine_move) {
            const sfFrom = data.engine_move.substring(0, 2);
            const sfTo = data.engine_move.substring(2, 4);
            const sfProm = data.engine_move.length > 4 ? data.engine_move[4] : 'q';
            chess.move({ from: sfFrom, to: sfTo, promotion: sfProm });
            lastMove = { from: sfFrom, to: sfTo };
            addMoveToHistory(data.engine_move, 'Stockfish (Black)');
        }

        renderBoard();

        if (data.game_over) {
            gameOver = true;
            const resultMsg = data.result || `Game over — ${data.winner} wins!`;
            setStatus(resultMsg, 'gameover');
            addChatMsg('coach', `Game over! ${resultMsg} Ask me to analyse the game if you'd like.`);
        } else {
            // Back to human's turn — update status
            const inCheck = data.in_check || chess.in_check();
            setStatus(inCheck ? 'Your turn (White) — Check! ⚠' : 'Your turn (White)', inCheck ? 'check' : '');
        }
    } catch (err) {
        setStatus('Connection error — is the backend running?', 'gameover');
        console.error(err);
    }

    isWaiting = false;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function updateStatus() {
    if (gameOver || chess.game_over()) {
        if (chess.in_checkmate()) {
            setStatus(chess.turn() === 'w' ? 'Checkmate — Stockfish wins!' : 'Checkmate — You win! 🎉', 'gameover');
        } else {
            setStatus('Game drawn!', 'gameover');
        }
        return;
    }
    setStatus(chess.in_check() ? 'Your turn (White) — Check! ⚠' : 'Your turn (White)',
        chess.in_check() ? 'check' : '');
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
    const isHuman = player.includes('White') || player.includes('You');
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
    if (!gameId) { addChatMsg('coach', 'No game active yet — wait a moment.'); return; }
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

// ─── New Game ─────────────────────────────────────────────────────────────────

document.getElementById('new-game-btn').addEventListener('click', async () => {
    if (isWaiting) return;
    chess = new Chess();
    lastMove = null;
    gameOver = false;
    moveCount = 0;
    clearSelection();
    document.getElementById('move-list').innerHTML = '';
    document.getElementById('move-count').textContent = '0';
    document.getElementById('chat-messages').innerHTML = '';
    renderBoard();
    setStatus('Creating new game…', '');
    await connectToBackend();
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
