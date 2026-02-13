# Quick Setup Guide

## Prerequisites
- Python 3.8+
- Node.js 14+
- Stockfish executable (download from https://stockfishchess.org/download/)

## Step-by-Step Setup

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install Python dependencies
pip install -r requirements.txt

# Update Stockfish path in backend/game/views.py
# Change STOCKFISH_PATH to your Stockfish executable location

# Run migrations
python manage.py makemigrations
python manage.py migrate

# (Optional) Create admin user
python manage.py createsuperuser

# Start Django server
python manage.py runserver
```

Backend will run on: `http://localhost:8000`

### 2. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies (if not already done)
npm install

# Start React development server
npm start
```

Frontend will run on: `http://localhost:3000`

### 3. Verify Installation

1. Open `http://localhost:3000` in your browser
2. You should see the chess board and chatbot side-by-side
3. Try making a move - Stockfish should respond automatically
4. Ask the chatbot a question about your game

## Troubleshooting

### Backend Issues

**Stockfish not found:**
- Make sure you've updated `STOCKFISH_PATH` in `backend/game/views.py`
- Verify the path is correct for your operating system
- On Windows, use double backslashes: `C:\\path\\to\\stockfish.exe`

**CORS errors:**
- Make sure `corsheaders` is in `INSTALLED_APPS` in `backend/chessbot/settings.py`
- Verify `CORS_ORIGIN_WHITELIST` includes `http://localhost:3000`

**Database errors:**
- Make sure you're in the `backend` directory
- Run `python manage.py makemigrations` and `python manage.py migrate`

### Frontend Issues

**API connection errors:**
- Verify backend is running on port 8000
- Check browser console for CORS errors
- Verify `API_BASE_URL` in `frontend/src/services/api.js`

**Chess board not loading:**
- Check that `react-chessboard` and `chess.js` are installed
- Verify all imports in `ChessBoard.js` are correct

## Project Structure

```
chess_ai/
├── backend/               # Django backend
│   ├── chessbot/          # Django project
│   │   ├── settings.py   # Django settings (CORS, apps, etc.)
│   │   └── urls.py       # Main URL routing
│   ├── game/              # Django app
│   │   ├── models.py     # Game and Move models
│   │   ├── views.py      # API endpoints
│   │   ├── urls.py       # App URL routing
│   │   └── admin.py      # Admin interface
│   ├── manage.py         # Django management script
│   ├── db.sqlite3        # SQLite database
│   └── requirements.txt  # Python dependencies
├── frontend/              # React app
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── services/     # API service
│   │   └── App.js        # Main app component
│   └── package.json      # Node dependencies
├── README.md             # Full documentation
└── SETUP.md              # This file
```

## Next Steps

1. **Integrate Real LLM**: Replace the rule-based chatbot with OpenAI/Anthropic API
2. **Add Authentication**: Implement user accounts
3. **Game History**: Add ability to view and replay past games
4. **Move Analysis**: Show evaluation scores and best moves
5. **Difficulty Levels**: Adjust Stockfish strength

## API Documentation

See `README.md` for complete API documentation.
