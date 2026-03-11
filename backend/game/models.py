from django.db import models
from django.contrib.auth.models import User


class Game(models.Model):
    """Represents a chess game between a user and Stockfish."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    fen = models.CharField(max_length=100,
                           default='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    is_finished = models.BooleanField(default=False)
    winner = models.CharField(max_length=10, null=True, blank=True)  # 'user','stockfish','draw'
    human_color = models.CharField(max_length=5, default='white')    # 'white' or 'black'
    difficulty = models.IntegerField(default=10)                     # Stockfish skill level 1-20
    game_type = models.CharField(max_length=20, default='competitive') # 'practice' or 'competitive'

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Game {self.id} ({self.human_color}) - {'Anonymous' if not self.user else self.user.username}"


class Move(models.Model):
    """A single move in a chess game."""
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name='moves')
    move_number = models.IntegerField()
    move_notation = models.CharField(max_length=10)   # UCI, e.g. "e2e4"
    player = models.CharField(max_length=10)          # 'user' or 'stockfish'
    fen_after = models.CharField(max_length=100)

    class Meta:
        ordering = ['game', 'move_number']

    def __str__(self):
        return f"{self.game.id} - Move {self.move_number}: {self.move_notation} ({self.player})"
