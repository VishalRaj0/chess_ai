from django.contrib import admin
from .models import Game, Move


@admin.register(Game)
class GameAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'created_at', 'is_finished', 'winner']
    list_filter = ['is_finished', 'winner', 'created_at']
    search_fields = ['id']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(Move)
class MoveAdmin(admin.ModelAdmin):
    list_display = ['id', 'game', 'move_number', 'move_notation', 'player', 'created_at']
    list_filter = ['player', 'created_at']
    search_fields = ['game__id', 'move_notation']
    readonly_fields = ['created_at']
