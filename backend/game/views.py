from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authtoken.models import Token
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from stockfish import Stockfish
from .models import Game, Move
import chess


STOCKFISH_PATH = "C:\\Users\\SUBHAM\\Downloads\\stockfish-windows-x86-64-avx2\\stockfish\\stockfish-windows-x86-64-avx2.exe"
STOCKFISH_SKILL = 10


def get_stockfish(skill_level=STOCKFISH_SKILL):
    sf = Stockfish(path=STOCKFISH_PATH)
    sf.set_skill_level(skill_level)
    return sf


def reconstruct_board(game):
    board = chess.Board()
    for m in game.moves.order_by('move_number'):
        board.push(chess.Move.from_uci(m.move_notation))
    return board


# ─── Create Game ──────────────────────────────────────────────────────────────

class CreateGame(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        human_color = request.data.get('human_color', 'white')
        if human_color not in ('white', 'black'):
            human_color = 'white'
            
        difficulty = int(request.data.get('difficulty', 10))
        game_type = request.data.get('game_type', 'competitive')
        if game_type not in ('practice', 'competitive'):
            game_type = 'competitive'

        game = Game.objects.create(
            human_color=human_color,
            difficulty=difficulty,
            game_type=game_type,
            user=request.user if request.user.is_authenticated else None
        )

        engine_first_move = None

        # If human plays Black → Stockfish (White) goes first immediately
        if human_color == 'black':
            sf = get_stockfish(game.difficulty)
            sf.set_position([])
            engine_first_move = sf.get_best_move()

            if engine_first_move:
                board = chess.Board()
                board.push(chess.Move.from_uci(engine_first_move))
                game.fen = board.fen()
                game.save()

                Move.objects.create(
                    game=game,
                    move_number=1,
                    move_notation=engine_first_move,
                    player='stockfish',
                    fen_after=board.fen()
                )

        return Response({
            "game_id": game.id,
            "fen": game.fen,
            "human_color": human_color,
            "difficulty": game.difficulty,
            "game_type": game.game_type,
            "engine_first_move": engine_first_move,
            "message": f"New {game.game_type} game created. You play as {'White' if human_color == 'white' else 'Black'} at difficulty {game.difficulty}."
        }, status=status.HTTP_201_CREATED)


# ─── Play Chess ───────────────────────────────────────────────────────────────

class PlayChess(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        game_id  = request.data.get("game_id")
        move_uci = request.data.get("move", "").strip()

        if not game_id or not move_uci:
            return Response({"error": "game_id and move are required"},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            game = Game.objects.get(id=game_id)
        except Game.DoesNotExist:
            return Response({"error": "Game not found"}, status=status.HTTP_404_NOT_FOUND)

        if game.is_finished:
            return Response({"error": "Game is already finished"}, status=status.HTTP_400_BAD_REQUEST)

        board = reconstruct_board(game)

        # Determine which color the human plays
        human_chess_color = chess.WHITE if game.human_color == 'white' else chess.BLACK

        # Enforce: it must be the human's turn
        if board.turn != human_chess_color:
            return Response({"error": "It is not your turn"}, status=status.HTTP_400_BAD_REQUEST)

        # Validate and apply human's move
        try:
            human_move = chess.Move.from_uci(move_uci)
        except ValueError:
            return Response({"error": f"Invalid UCI notation: {move_uci}"}, status=status.HTTP_400_BAD_REQUEST)

        if human_move not in board.legal_moves:
            return Response({"error": f"Illegal move: {move_uci}"}, status=status.HTTP_400_BAD_REQUEST)

        board.push(human_move)
        move_number = game.moves.count() + 1

        Move.objects.create(
            game=game,
            move_number=move_number,
            move_notation=move_uci,
            player='user',
            fen_after=board.fen()
        )

        # Check if human won
        if board.is_checkmate():
            game.is_finished = True; game.winner = 'user'; game.fen = board.fen(); game.save()
            return Response({"human_move": move_uci, "engine_move": None, "fen": board.fen(),
                             "game_over": True, "winner": "human",
                             "result": "Checkmate — you win! 🎉"})

        if board.is_stalemate() or board.is_insufficient_material() or board.is_seventyfive_moves():
            game.is_finished = True; game.winner = 'draw'; game.fen = board.fen(); game.save()
            return Response({"human_move": move_uci, "engine_move": None, "fen": board.fen(),
                             "game_over": True, "winner": "draw", "result": "Draw!"})

        # Ask Stockfish for its response
        all_moves = [m.move_notation for m in game.moves.order_by('move_number')]
        sf = get_stockfish(game.difficulty)
        sf.set_position(all_moves)
        engine_move_uci = sf.get_best_move()

        if not engine_move_uci:
            game.is_finished = True; game.winner = 'draw'; game.fen = board.fen(); game.save()
            return Response({"human_move": move_uci, "engine_move": None, "fen": board.fen(),
                             "game_over": True, "winner": "draw", "result": "Draw — engine has no moves"})

        sf_move = chess.Move.from_uci(engine_move_uci)
        board.push(sf_move)

        Move.objects.create(
            game=game,
            move_number=move_number + 1,
            move_notation=engine_move_uci,
            player='stockfish',
            fen_after=board.fen()
        )

        if board.is_checkmate():
            game.is_finished = True; game.winner = 'stockfish'; game.fen = board.fen(); game.save()
            return Response({"human_move": move_uci, "engine_move": engine_move_uci, "fen": board.fen(),
                             "game_over": True, "winner": "stockfish", "result": "Checkmate — Stockfish wins!"})

        if board.is_stalemate() or board.is_insufficient_material() or board.is_seventyfive_moves():
            game.is_finished = True; game.winner = 'draw'; game.fen = board.fen(); game.save()
            return Response({"human_move": move_uci, "engine_move": engine_move_uci, "fen": board.fen(),
                             "game_over": True, "winner": "draw", "result": "Draw!"})

        game.fen = board.fen(); game.save()
        return Response({
            "human_move": move_uci,
            "engine_move": engine_move_uci,
            "fen": board.fen(),
            "game_over": False,
            "winner": None,
            "in_check": board.is_check()
        })


# ─── Surrender Game ───────────────────────────────────────────────────────────

class SurrenderGame(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        game_id = request.data.get("game_id")
        if not game_id:
            return Response({"error": "game_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            game = Game.objects.get(id=game_id)
        except Game.DoesNotExist:
            return Response({"error": "Game not found"}, status=status.HTTP_404_NOT_FOUND)

        if game.is_finished:
            return Response({"error": "Game is already finished"}, status=status.HTTP_400_BAD_REQUEST)

        game.is_finished = True
        game.winner = 'stockfish'
        game.save()

        return Response({
            "message": "You surrendered. Stockfish wins!",
            "game_over": True,
            "winner": "stockfish"
        })


# ─── Undo Move ───────────────────────────────────────────────────────────────

class UndoMove(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        game_id = request.data.get("game_id")
        if not game_id:
            return Response({"error": "game_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            game = Game.objects.get(id=game_id)
        except Game.DoesNotExist:
            return Response({"error": "Game not found"}, status=status.HTTP_404_NOT_FOUND)

        if game.game_type != 'practice':
            return Response({"error": "Undo is only available in Practice mode"}, status=status.HTTP_400_BAD_REQUEST)

        if game.is_finished:
            return Response({"error": "Cannot undo a finished game"}, status=status.HTTP_400_BAD_REQUEST)

        moves = list(game.moves.order_by('move_number'))
        
        if not moves:
            return Response({"error": "No moves to undo"}, status=status.HTTP_400_BAD_REQUEST)
            
        num_moves_to_delete = 2
        if len(moves) == 1 and game.human_color == 'black':
            return Response({"error": "Cannot undo the engine's first move"}, status=status.HTTP_400_BAD_REQUEST)
        if len(moves) == 1 and game.human_color == 'white':
            num_moves_to_delete = 1
            
        moves_to_keep = moves[:-num_moves_to_delete]
        moves_to_delete = moves[-num_moves_to_delete:]
        
        board = chess.Board()
        for m in moves_to_keep:
            board.push(chess.Move.from_uci(m.move_notation))
            
        game.fen = board.fen()
        game.save()
        
        for m in moves_to_delete:
            m.delete()
            
        return Response({
            "message": "Move undone successfully",
            "fen": game.fen,
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
            "human_color": game.human_color,
            "moves": [{"move_number": m.move_number, "move": m.move_notation,
                        "player": m.player, "fen": m.fen_after} for m in moves]
        })


# ─── List Games ───────────────────────────────────────────────────────────────

class ListGames(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        if request.user.is_authenticated:
            games = Game.objects.filter(user=request.user).order_by('-created_at')[:50]
        else:
            games = Game.objects.filter(user__isnull=True).order_by('-created_at')[:50]
            
        return Response({"games": [{"game_id": g.id, "is_finished": g.is_finished,
                                     "winner": g.winner, "human_color": g.human_color,
                                     "difficulty": g.difficulty, "game_type": g.game_type,
                                     "move_count": g.moves.count(), "created_at": g.created_at}
                                    for g in games]})


# ─── Auth & Profile ───────────────────────────────────────────────────────────

class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        
        if not username or not password:
            return Response({"error": "Username and password required"}, status=status.HTTP_400_BAD_REQUEST)
            
        if User.objects.filter(username=username).exists():
            return Response({"error": "Username already taken"}, status=status.HTTP_400_BAD_REQUEST)
            
        user = User.objects.create_user(username=username, password=password)
        token, _ = Token.objects.get_or_create(user=user)
        
        return Response({"token": token.key, "username": user.username}, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        
        user = authenticate(username=username, password=password)
        if user:
            token, _ = Token.objects.get_or_create(user=user)
            return Response({"token": token.key, "username": user.username})
        else:
            return Response({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.user.auth_token.delete()
        return Response({"message": "Logged out successfully"})


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        games = Game.objects.filter(user=user)
        total_games = games.count()
        wins = games.filter(winner='user').count()
        losses = games.filter(winner='stockfish').count()
        draws = games.filter(winner='draw').count()
        
        history = []
        for g in games.order_by('-created_at')[:20]:
            history.append({
                "game_id": g.id,
                "created_at": g.created_at,
                "human_color": g.human_color,
                "is_finished": g.is_finished,
                "winner": g.winner,
                "move_count": g.moves.count(),
                "difficulty": g.difficulty,
                "game_type": g.game_type,
                "fen": g.fen
            })
            
        return Response({
            "username": user.username,
            "date_joined": user.date_joined,
            "stats": {
                "total_games": total_games,
                "wins": wins,
                "losses": losses,
                "draws": draws,
            },
            "history": history
        })


# ─── Chatbot ──────────────────────────────────────────────────────────────────

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
        board = reconstruct_board(game)
        response_text = self._advice(message.lower(), len(moves), board, game.human_color)
        return Response({"response": response_text, "game_id": game_id})

    def _advice(self, msg, move_count, board, human_color):
        color_name = 'White' if human_color == 'white' else 'Black'

        if any(w in msg for w in ['tip', 'advice', 'help', 'suggest']):
            if move_count < 4:
                return ("Control the center! As " + color_name + ", consider moves like "
                        + ("e4/d4 to claim space." if human_color == 'white' else "e5/d5 to contest White's center."))
            elif move_count < 12:
                return ("Focus on: 1) Develop knights before bishops. 2) Castle early. "
                        "3) Don't move the same piece twice in the opening without reason.")
            else:
                return ("Look for tactical patterns: forks, pins, skewers. "
                        "Ask: which of my pieces is doing the least? Activate it!")

        if any(w in msg for w in ['mistake', 'wrong', 'blunder']):
            return ("Common mistakes: leaving pieces undefended, ignoring opponent threats, "
                    "weakening your king's pawn cover. After each Stockfish move, ask: what is it threatening?")

        if any(w in msg for w in ['best move', 'what should', 'what to play']):
            if board.is_check():
                return "You're in check! You must block, capture the attacker, or move your king."
            return ("Ask: 1) Am I safe? 2) Can I win material? 3) Can I improve my worst piece? "
                    "Safety first, then look for wins.")

        if 'opening' in msg:
            if human_color == 'white':
                return ("You're White (initiative side). Popular starts: Italian Game (1.e4 e5 2.Nf3 Nc6 3.Bc4), "
                        "London System (1.d4 + Nf3 + Bf4), or Queen's Gambit (1.d4 d5 2.c4).")
            else:
                return ("You're Black (responding side). Solid replies: Sicilian Defense (1.e4 c5), "
                        "French Defense (1.e4 e6), or King's Indian (1.d4 Nf6 2.c4 g6).")

        if 'endgame' in msg:
            return "Activate your king — it's a powerful piece in the endgame! Push passed pawns and use king opposition."

        phase = "opening" if move_count < 10 else ("middlegame" if move_count < 30 else "endgame")
        check_note = " You're in check!" if board.is_check() else ""
        return (f"You play as {color_name}, move {move_count // 2 + 1} of the {phase}.{check_note} "
                "Ask me: tips, best move, opening or endgame advice!")