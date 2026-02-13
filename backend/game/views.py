from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from stockfish import Stockfish
from .models import Game, Move
from django.contrib.auth.models import User
import chess
import chess.engine
import json

# views defines all your apis
# Create your views here.

STOCKFISH_PATH = "C:\\Users\\SUBHAM\\Downloads\\stockfish-windows-x86-64-avx2\\stockfish\\stockfish-windows-x86-64-avx2.exe"


class CreateGame(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        """Create a new chess game"""
        game = Game.objects.create()
        return Response({
            "game_id": game.id,
            "fen": game.fen,
            "created_at": game.created_at
        }, status=status.HTTP_201_CREATED)


class PlayChess(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        """Make a move and get Stockfish's response"""
        game_id = request.data.get("game_id")
        move_notation = request.data.get("move")  # e.g., "e2e4"
        
        if not game_id or not move_notation:
            return Response(
                {"error": "game_id and move are required"}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            game = Game.objects.get(id=game_id)
            
            # Get all previous moves
            previous_moves = list(game.moves.all().order_by('move_number'))
            moves_list = [m.move_notation for m in previous_moves]
            
            # Create chess board and load previous moves
            board = chess.Board()
            for move_str in moves_list:
                try:
                    move = chess.Move.from_uci(move_str)
                    if move in board.legal_moves:
                        board.push(move)
                    else:
                        return Response(
                            {"error": f"Invalid game state"}, 
                            status=status.HTTP_400_BAD_REQUEST
                        )
                except ValueError:
                    return Response(
                        {"error": f"Invalid move notation in game history"}, 
                        status=status.HTTP_400_BAD_REQUEST
                    )
            
            # Validate user's move
            try:
                user_move = chess.Move.from_uci(move_notation)
                if user_move not in board.legal_moves:
                    return Response(
                        {"error": f"Invalid move: {move_notation}"}, 
                        status=status.HTTP_400_BAD_REQUEST
                    )
                board.push(user_move)
            except ValueError:
                return Response(
                    {"error": f"Invalid move notation: {move_notation}"}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Save user's move
            move_number = len(previous_moves) + 1
            Move.objects.create(
                game=game,
                move_number=move_number,
                move_notation=move_notation,
                player='user',
                fen_after=board.fen()
            )
            
            # Check if game is over
            if board.is_checkmate():
                game.is_finished = True
                game.winner = 'user'
                game.save()
                return Response({
                    "engine_move": None,
                    "game_over": True,
                    "winner": "user",
                    "fen": board.fen()
                }, status=status.HTTP_200_OK)
            
            if board.is_stalemate() or board.is_insufficient_material():
                game.is_finished = True
                game.winner = 'draw'
                game.save()
                return Response({
                    "engine_move": None,
                    "game_over": True,
                    "winner": "draw",
                    "fen": board.fen()
                }, status=status.HTTP_200_OK)
            
            # Get Stockfish's move
            stockfish = Stockfish(path=STOCKFISH_PATH)
            stockfish.set_position(moves_list)
            best_move = stockfish.get_best_move()
            
            if best_move:
                # Apply Stockfish's move
                stockfish_move = chess.Move.from_uci(best_move)
                board.push(stockfish_move)
                
                # Save Stockfish's move
                Move.objects.create(
                    game=game,
                    move_number=move_number + 1,
                    move_notation=best_move,
                    player='stockfish',
                    fen_after=board.fen()
                )
                
                # Check if Stockfish won
                if board.is_checkmate():
                    game.is_finished = True
                    game.winner = 'stockfish'
                    game.save()
                    return Response({
                        "engine_move": best_move,
                        "game_over": True,
                        "winner": "stockfish",
                        "fen": board.fen()
                    }, status=status.HTTP_200_OK)
                
                # Update game FEN
                game.fen = board.fen()
                game.save()
            
            return Response({
                "engine_move": best_move,
                "fen": board.fen(),
                "game_over": False
            }, status=status.HTTP_200_OK)
            
        except Game.DoesNotExist:
            return Response(
                {"error": "Game not found"}, 
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"error": str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class GetGame(APIView):
    permission_classes = [AllowAny]
    
    def get(self, request, game_id):
        """Get game details and all moves"""
        try:
            game = Game.objects.get(id=game_id)
            moves = game.moves.all().order_by('move_number')
            
            moves_data = [{
                "move_number": m.move_number,
                "move": m.move_notation,
                "player": m.player,
                "fen": m.fen_after
            } for m in moves]
            
            return Response({
                "game_id": game.id,
                "fen": game.fen,
                "is_finished": game.is_finished,
                "winner": game.winner,
                "moves": moves_data,
                "created_at": game.created_at
            }, status=status.HTTP_200_OK)
        except Game.DoesNotExist:
            return Response(
                {"error": "Game not found"}, 
                status=status.HTTP_404_NOT_FOUND
            )


class ListGames(APIView):
    permission_classes = [AllowAny]
    
    def get(self, request):
        """List all games"""
        games = Game.objects.all()[:50]  # Limit to 50 most recent
        games_data = [{
            "game_id": g.id,
            "fen": g.fen,
            "is_finished": g.is_finished,
            "winner": g.winner,
            "created_at": g.created_at,
            "move_count": g.moves.count()
        } for g in games]
        
        return Response({"games": games_data}, status=status.HTTP_200_OK)


class ChatbotView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        """Chat with LLM about chess game"""
        game_id = request.data.get("game_id")
        message = request.data.get("message", "")
        
        if not game_id:
            return Response(
                {"error": "game_id is required"}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            game = Game.objects.get(id=game_id)
            moves = game.moves.all().order_by('move_number')
            
            # Build game context
            moves_list = []
            for move in moves:
                moves_list.append(f"{move.move_number}. {move.player}: {move.move_notation}")
            
            game_context = "\n".join(moves_list) if moves_list else "No moves yet."
            
            # Create prompt for LLM
            system_prompt = """You are a helpful chess coach AI assistant. You analyze chess games and provide tips, 
            suggestions, and explanations to help players improve. Be concise, friendly, and educational. 
            Focus on tactical patterns, positional concepts, and common mistakes."""
            
            user_prompt = f"""Current game state (FEN): {game.fen}
            
Move history:
{game_context}

User question: {message}

Please provide helpful chess advice based on the game state and move history."""
            
            # For now, we'll use a simple rule-based response
            # In production, you'd integrate with OpenAI API or similar
            # This is a placeholder that can be replaced with actual LLM API calls
            
            response_text = self._generate_chess_advice(game, moves_list, message)
            
            return Response({
                "response": response_text,
                "game_id": game_id
            }, status=status.HTTP_200_OK)
            
        except Game.DoesNotExist:
            return Response(
                {"error": "Game not found"}, 
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"error": str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def _generate_chess_advice(self, game, moves_list, user_message):
        """Generate chess advice - placeholder for LLM integration"""
        # This is a simple rule-based response
        # Replace this with actual OpenAI/Anthropic API calls
        
        lower_message = user_message.lower()
        
        if "tip" in lower_message or "advice" in lower_message or "help" in lower_message:
            if len(moves_list) == 0:
                return "Start by controlling the center! Consider moves like e4, d4, Nf3, or c4. These moves help you control key squares and develop your pieces."
            elif len(moves_list) < 10:
                return "Focus on piece development and controlling the center. Try to castle early to protect your king. Avoid moving the same piece multiple times in the opening."
            else:
                return "In the middlegame, look for tactical opportunities like forks, pins, and skewers. Also consider your pawn structure - weak pawns can become targets."
        
        elif "mistake" in lower_message or "wrong" in lower_message:
            return "Review your recent moves. Common mistakes include: moving pieces multiple times in the opening, leaving pieces undefended, ignoring opponent threats, and weakening your king's position."
        
        elif "best move" in lower_message or "what should" in lower_message:
            return "Consider the current position carefully. Look for moves that: 1) Develop pieces, 2) Control central squares, 3) Create threats, 4) Improve your piece coordination. Use Stockfish's suggestions as a learning tool!"
        
        elif "opening" in lower_message:
            return "Good openings focus on controlling the center, developing pieces quickly, and castling for king safety. Popular choices include the Italian Game, Spanish Game (Ruy Lopez), or Queen's Gambit."
        
        elif "endgame" in lower_message:
            return "In the endgame, king activity becomes crucial. Try to activate your king, create passed pawns, and use your king to support pawn promotion."
        
        else:
            return f"I can help you analyze your game! You've made {len(moves_list)} moves so far. Ask me about: tips, mistakes, best moves, openings, or endgames. I can provide strategic advice based on your current position."