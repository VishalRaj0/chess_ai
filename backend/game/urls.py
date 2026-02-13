from django.urls import path
from . import views

urlpatterns = [
    path('api/games/', views.CreateGame.as_view(), name='create_game'),
    path('api/games/list/', views.ListGames.as_view(), name='list_games'),
    path('api/games/<int:game_id>/', views.GetGame.as_view(), name='get_game'),
    path('api/play/', views.PlayChess.as_view(), name='play_chess'),
    path('api/chat/', views.ChatbotView.as_view(), name='chatbot'),
]
