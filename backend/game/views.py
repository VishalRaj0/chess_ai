from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from stockfish import Stockfish
from .models import Game, Move
import chess


STOCKFISH_PATH = "C:\\Users\\SUBHAM\\Downloads\\stockfish-windows-x86-64-avx2\\stockfish\\stockfish-windows-x86-64-avx2.exe"

# Stockfish skill level 0-20 (20 = strongest)
STOCKFISH_SKILL = 10


def get_stockfish():
    """Create a fresh Stockfish instance."""
    sf = Stockfish(path=STOCKFISH_PATH)
    sf.set_skill_level(STOCKFISH_SKILL)
    return sf


def reconstruct_board(game):
    """Replay all saved moves to get the current board state."""
    board = chess.Board()
    for m in game.moves.order_by('move_number'):
        board.push(chess.Move.from_uci(m.move_notation))
    return board


# ─── Create Game ──────────────────────────────────────────────────────────────

class CreateGame(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        """Start a new game. Human is always White."""
        game = Game.objects.create()
        return Response({
            "game_id": game.id,
            "fen": game.fen,
            "human_color": "white",
            "message": "New game created. You play as White."
        }, status=status.HTTP_201_CREATED)


# ─── Play Chess ───────────────────────────────────────────────────────────────

class PlayChess(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        """
        Accept a move from the human (White), validate it, save it,
        then ask Stockfish (Black) for its response move.
        """
        game_id      = request.data.get("game_id")
        move_uci     = request.data.get("move", "").strip()  # e.g. "e2e4"

        if not game_id or not move_uci:
            return Response({"error": "game_id and move are required"},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            game = Game.objects.get(id=game_id)
        except Game.DoesNotExist:
            return Response({"error": "Game not found"},
                            status=status.HTTP_404_NOT_FOUND)

        if game.is_finished:
            return Response({"error": "Game is already finished"},
                            status=status.HTTP_400_BAD_REQUEST)

        # ── Rebuild board from saved history ──────────────────────────────
        board = reconstruct_board(game)

        # ── Enforce: human must play White ────────────────────────────────
        if board.turn != chess.WHITE:
            return Response({"error": "It is not White's turn"},
                            status=status.HTTP_400_BAD_REQUEST)

        # ── Validate and apply human move ─────────────────────────────────
        try:
            human_move = chess.Move.from_uci(move_uci)
        except ValueError:
            return Response({"error": f"Invalid UCI notation: {move_uci}"},
                            status=status.HTTP_400_BAD_REQUEST)

        if human_move not in board.legal_moves:
            return Response({"error": f"Illegal move: {move_uci}"},
                            status=status.HTTP_400_BAD_REQUEST)

        board.push(human_move)
        move_number = game.moves.count() + 1

        Move.objects.create(
            game=game,
            move_number=move_number,
            move_notation=move_uci,
            player='user',
            fen_after=board.fen()
        )

        # ── Check if human won ────────────────────────────────────────────
        if board.is_checkmate():
            game.is_finished = True
            game.winner = 'user'
            game.fen = board.fen()
            game.save()
            return Response({
                "human_move": move_uci,
                "engine_move": None,
                "fen": board.fen(),
                "game_over": True,
                "winner": "human",
                "result": "Checkmate — you win!"
            })

        if board.is_stalemate() or board.is_insufficient_material() or board.is_seventyfive_moves():
            game.is_finished = True
            game.winner = 'draw'
            game.fen = board.fen()
            game.save()
            return Response({
                "human_move": move_uci,
                "engine_move": None,
                "fen": board.fen(),
                "game_over": True,
                "winner": "draw",
                "result": "Draw!"
            })

        # ── Ask Stockfish for Black's response ────────────────────────────
        # Build the full move list (ALL moves including human's just-played one)
        all_moves_so_far = [m.move_notation for m in game.moves.order_by('move_number')]

        sf = get_stockfish()
        sf.set_position(all_moves_so_far)
        engine_move_uci = sf.get_best_move()

        if not engine_move_uci:
            # Stockfish couldn't find a move → likely draw
            game.is_finished = True
            game.winner = 'draw'
            game.fen = board.fen()
            game.save()
            return Response({
                "human_move": move_uci,
                "engine_move": None,
                "fen": board.fen(),
                "game_over": True,
                "winner": "draw",
                "result": "Draw — Stockfish has no moves"
            })

        # Apply Stockfish's move
        sf_move = chess.Move.from_uci(engine_move_uci)
        board.push(sf_move)

        Move.objects.create(
            game=game,
            move_number=move_number + 1,
            move_notation=engine_move_uci,
            player='stockfish',
            fen_after=board.fen()
        )

        # ── Check if Stockfish won ────────────────────────────────────────
        if board.is_checkmate():
            game.is_finished = True
            game.winner = 'stockfish'
            game.fen = board.fen()
            game.save()
            return Response({
                "human_move": move_uci,
                "engine_move": engine_move_uci,
                "fen": board.fen(),
                "game_over": True,
                "winner": "stockfish",
                "result": "Checkmate — Stockfish wins!"
            })

        if board.is_stalemate() or board.is_insufficient_material() or board.is_seventyfive_moves():
            game.is_finished = True
            game.winner = 'draw'
            game.fen = board.fen()
            game.save()
            return Response({
                "human_move": move_uci,
                "engine_move": engine_move_uci,
                "fen": board.fen(),
                "game_over": True,
                "winner": "draw",
                "result": "Draw!"
            })

        # ── Normal response ───────────────────────────────────────────────
        game.fen = board.fen()
        game.save()

        return Response({
            "human_move": move_uci,
            "engine_move": engine_move_uci,
            "fen": board.fen(),
            "game_over": False,
            "winner": None,
            "in_check": board.is_check()
        })


# ─── Get Game ─────────────────────────────────────────────────────────────────

class GetGame(APIView):
    permission_classes = [AllowAny]

    def get(self, request, game_id):
        try:
            game = Game.objects.get(id=game_id)
        except Game.DoesNotExist:
            return Response({"error": "Game not found"}, status=status.HTTP_404_NOT_FOUND)

        moves = game.moves.order_by('move_number')
        return Response({
            "game_id": game.id,
            "fen": game.fen,
            "is_finished": game.is_finished,
            "winner": game.winner,
            "human_color": "white",
            "moves": [
                {
                    "move_number": m.move_number,
                    "move": m.move_notation,
                    "player": m.player,
                    "fen": m.fen_after
                }
                for m in moves
            ]
        })


# ─── List Games ───────────────────────────────────────────────────────────────

class ListGames(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        games = Game.objects.all()[:50]
        return Response({
            "games": [
                {
                    "game_id": g.id,
                    "is_finished": g.is_finished,
                    "winner": g.winner,
                    "move_count": g.moves.count(),
                    "created_at": g.created_at,
                }
                for g in games
            ]
        })


# ─── Chat / Coach ─────────────────────────────────────────────────────────────

class ChatbotView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        game_id = request.data.get("game_id")
        message = request.data.get("message", "").strip()

        if not game_id:
            return Response({"error": "game_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            game = Game.objects.get(id=game_id)
        except Game.DoesNotExist:
            return Response({"error": "Game not found"}, status=status.HTTP_404_NOT_FOUND)

        moves = list(game.moves.order_by('move_number'))
        move_count = len(moves)
        board = reconstruct_board(game)

        response_text = self._generate_advice(message.lower(), move_count, board, game)

        return Response({"response": response_text, "game_id": game_id})

    def _generate_advice(self, msg, move_count, board, game):
        if any(w in msg for w in ['tip', 'advice', 'help', 'suggest']):
            if move_count == 0:
                return ("Control the center! Consider 1.e4 or 1.d4. "
                        "These moves immediately fight for the central squares.")
            elif move_count < 10:
                return ("Focus on: 1) Develop knights before bishops. "
                        "2) Control e4/d4/e5/d5. 3) Castle early for king safety. "
                        "Avoid moving the same piece twice in the opening.")
            else:
                return ("Look for tactical patterns: forks, pins, and skewers. "
                        "Also ask yourself: which of my pieces is doing nothing? Activate it!")

        if any(w in msg for w in ['mistake', 'wrong', 'blunder', 'bad']):
            return ("Common mistakes to avoid: hanging pieces (leaving them undefended), "
                    "ignoring your opponent's threats, and weakening your king's pawn shield. "
                    "After each of Stockfish's moves, ask: what is it threatening?")

        if any(w in msg for w in ['best move', 'what should', 'what to play']):
            if board.is_check():
                return "You're in check! You must either block, capture the attacker, or move your king."
            return ("Ask yourself: 1) Am I in danger? 2) Can I win material? "
                    "3) Can I improve my worst-placed piece? Start from safety, then look for wins.")

        if 'opening' in msg:
            return ("You're playing White, which means you have the initiative. "
                    "Popular choices: Italian Game (1.e4 e5 2.Nf3 Nc6 3.Bc4), "
                    "London System (1.d4 + 2.Nf3 + 3.Bf4), or Queen's Gambit (1.d4 d5 2.c4).")

        if 'endgame' in msg:
            return ("In the endgame, activate your king — it becomes a powerful piece! "
                    "Push passed pawns and use the opposition with your king.")

        if 'stockfish' in msg or 'engine' in msg or 'difficulty' in msg:
            return (f"Stockfish is playing at skill level {STOCKFISH_SKILL}/20. "
                    "Higher = harder. Ask the developer to adjust STOCKFISH_SKILL in views.py!")

        # Default
        phase = "opening" if move_count < 10 else ("middlegame" if move_count < 30 else "endgame")
        check_note = " You are currently in check!" if board.is_check() else ""
        return (f"You're in move {move_count // 2 + 1} of the {phase}.{check_note} "
                f"Ask me for: tips, best move, opening advice, or endgame strategy!")