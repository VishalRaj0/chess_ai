from django.urls import path
from . import views

urlpatterns = [
    path('api/play/', views.PlayChess.as_view(), name='play_chess'),
]
