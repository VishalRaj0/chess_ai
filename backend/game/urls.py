from django.urls import path
from . import views

urlpatterns = [
    path('api/games/', views.CreateGame.as_view(), name='create_game'),
    path('api/games/list/', views.ListGames.as_view(), name='list_games'),
    path('api/games/<int:game_id>/', views.GetGame.as_view(), name='get_game'),
    path('api/play/', views.PlayChess.as_view(), name='play_chess'),
    path('api/surrender/', views.SurrenderGame.as_view(), name='surrender_game'),
    path('api/undo/', views.UndoMove.as_view(), name='undo_move'),
    path('api/chat/', views.ChatbotView.as_view(), name='chatbot'),
    
    # Auth & Profile
    path('api/auth/register/', views.RegisterView.as_view(), name='register'),
    path('api/auth/login/', views.LoginView.as_view(), name='login'),
    path('api/auth/logout/', views.LogoutView.as_view(), name='logout'),
    path('api/profile/', views.ProfileView.as_view(), name='profile'),
]
