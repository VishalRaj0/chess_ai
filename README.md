# Chess AI with Coach

A full-stack chess application where you can play against Stockfish engine and get tips from an AI coach chatbot.

## Features

- 🎮 Play chess against Stockfish engine
- 💬 Chat with AI coach that analyzes your game and provides tips
- 📊 Game history tracking
- 🎨 Modern, responsive UI

## Tech Stack

### Backend
- Django 5.2.4
- Django REST Framework
- Stockfish chess engine
- python-chess library

### Frontend
- React
- chess.js for chess logic
- react-chessboard for UI
- Axios for API calls

## Setup Instructions

### Backend Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Make sure Stockfish is installed:**
   - Download Stockfish from https://stockfishchess.org/download/
   - Update the `STOCKFISH_PATH` in `backend/game/views.py` to point to your Stockfish executable

4. **Run migrations:**
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

5. **Create a superuser (optional):**
   ```bash
   python manage.py createsuperuser
   ```

6. **Start the Django server:**
   ```bash
   python manage.py runserver
   ```
   The backend will run on `http://localhost:8000`

### Frontend Setup

1. **Navigate to frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies (if not already installed):**
   ```bash
   npm install
   ```

3. **Start the React development server:**
   ```bash
   npm start
   ```
   The frontend will run on `http://localhost:3000`

## API Endpoints

- `POST /api/games/` - Create a new game
- `GET /api/games/<game_id>/` - Get game details
- `GET /api/games/list/` - List all games
- `POST /api/play/` - Make a move
  ```json
  {
    "game_id": 1,
    "move": "e2e4"
  }
  ```
- `POST /api/chat/` - Chat with AI coach
  ```json
  {
    "game_id": 1,
    "message": "Give me a tip"
  }
  ```

## Usage

1. Start both backend and frontend servers
2. Open `http://localhost:3000` in your browser
3. A new game will be automatically created
4. Make moves by dragging pieces on the board
5. Stockfish will respond automatically
6. Use the chatbot on the right to ask questions about your game

## Project Structure

```
chess_ai/
├── backend/           # Django backend
│   ├── chessbot/      # Django project settings
│   ├── game/          # Django app
│   │   ├── models.py  # Game and Move models
│   │   ├── views.py   # API views
│   │   └── urls.py    # URL routing
│   ├── manage.py      # Django management script
│   ├── db.sqlite3     # SQLite database
│   └── requirements.txt
├── frontend/          # React app
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChessBoard.js
│   │   │   └── Chatbot.js
│   │   ├── services/
│   │   │   └── api.js
│   │   └── App.js
│   └── package.json
└── README.md
```

## Notes

- The chatbot currently uses rule-based responses. To integrate with an actual LLM (OpenAI, Anthropic, etc.), update the `_generate_chess_advice` method in `backend/game/views.py`
- Make sure CORS is properly configured in Django settings for frontend-backend communication
- The Stockfish path needs to be updated to match your system

## Future Enhancements

- User authentication
- Game replay functionality
- Move analysis with evaluation scores
- Integration with actual LLM APIs (OpenAI, Anthropic)
- Game statistics and analytics
- Multiple difficulty levels
