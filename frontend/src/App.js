import React, { useState, useEffect } from 'react';
import ChessBoard from './components/ChessBoard';
import Chatbot from './components/Chatbot';
import { createGame } from './services/api';
import './App.css';

function App() {
  const [gameId, setGameId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializeGame();
  }, []);

  const initializeGame = async () => {
    try {
      const gameData = await createGame();
      setGameId(gameData.game_id);
      setIsLoading(false);
    } catch (error) {
      console.error('Error creating game:', error);
      setIsLoading(false);
    }
  };

  const handleGameUpdate = (gameData) => {
    // Handle game updates if needed
    console.log('Game updated:', gameData);
  };

  if (isLoading) {
    return (
      <div className="App loading">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="app-header">
        <h1>♟️ Chess AI with Coach</h1>
        <p>Play against Stockfish and get tips from your AI coach</p>
      </header>
      
      <div className="main-container">
        <div className="chess-section">
          <ChessBoard gameId={gameId} onGameUpdate={handleGameUpdate} />
        </div>
        
        <div className="chatbot-section">
          <Chatbot gameId={gameId} />
        </div>
      </div>
    </div>
  );
}

export default App;
