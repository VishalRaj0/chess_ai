from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from stockfish import Stockfish

# views defines all your apis
# Create your views here.

STOCKFISH_PATH = "C:\\Users\\SUBHAM\\Downloads\\stockfish-windows-x86-64-avx2\\stockfish\\stockfish-windows-x86-64-avx2.exe"


class PlayChess(APIView):
    def post(self, request):
        moves = request.data.get("moves", [])  # list of moves like ["e2e4", "e7e5"]
        if not isinstance(moves, list):
            return Response({"error": "Expected a list of moves."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            stockfish = Stockfish(path=STOCKFISH_PATH)
            stockfish.set_position(moves)
            best_move = stockfish.get_best_move()
            return Response({"engine_move": best_move}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)