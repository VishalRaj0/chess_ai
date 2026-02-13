from django.db import models
from django.contrib.auth.models import User


class Game(models.Model):
    """Represents a chess game between a user and Stockfish"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    fen = models.CharField(max_length=100, default='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    is_finished = models.BooleanField(default=False)
    winner = models.CharField(max_length=10, null=True, blank=True)  # 'user', 'stockfish', 'draw'
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Game {self.id} - {self.user.username if self.user else 'Anonymous'}"


class Move(models.Model):
    """Represents a single move in a chess game"""
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name='moves')
    move_number = models.IntegerField()
    move_notation = models.CharField(max_length=10)  # e.g., "e2e4"
    player = models.CharField(max_length=10)  # 'user' or 'stockfish'
    fen_after = models.CharField(max_length=100)  # FEN notation after this move
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['game', 'move_number']
    
    def __str__(self):
        return f"{self.game.id} - Move {self.move_number}: {self.move_notation} ({self.player})"
