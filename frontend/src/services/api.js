import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const createGame = async () => {
  const response = await api.post('/api/games/');
  return response.data;
};

export const getGame = async (gameId) => {
  const response = await api.get(`/api/games/${gameId}/`);
  return response.data;
};

export const makeMove = async (gameId, move) => {
  const response = await api.post('/api/play/', {
    game_id: gameId,
    move: move,
  });
  return response.data;
};

export const sendChatMessage = async (gameId, message) => {
  const response = await api.post('/api/chat/', {
    game_id: gameId,
    message: message,
  });
  return response.data;
};

export default api;
