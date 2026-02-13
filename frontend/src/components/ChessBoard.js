import React, { useState, useEffect, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { makeMove, getGame, createGame } from '../services/api';
import './ChessBoard.css';

const ChessBoard = ({ gameId, onGameUpdate }) => {
  const [game, setGame] = useState(new Chess());
  const [gamePosition, setGamePosition] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const [isLoading, setIsLoading] = useState(false);
  const [gameStatus, setGameStatus] = useState('');
  const [moveHistory, setMoveHistory] = useState([]);

  const loadGame = useCallback(async () => {
    try {
      const gameData = await getGame(gameId);
      const chessGame = new Chess();
      
      gameData.moves.forEach((moveData) => {
        chessGame.move(moveData.move);
      });
      
      const newFen = chessGame.fen();
      setGame(chessGame);
      setGamePosition(newFen);
      setMoveHistory(gameData.moves);
      
      if (gameData.is_finished) {
        setGameStatus(`Game Over! Winner: ${gameData.winner}`);
      }
    } catch (error) {
      console.error('Error loading game:', error);
    }
  }, [gameId]);

  useEffect(() => {
    if (gameId) {
      loadGame();
    }
  }, [gameId, loadGame]);

  const onDrop = ({ sourceSquare, targetSquare }) => {
    if (isLoading) {
      return false;
    }

    const currentGame = new Chess(gamePosition);
    
    if (currentGame.isGameOver()) {
      return false;
    }
    
    const pieceAtSquare = currentGame.get(sourceSquare);
    let moveNotation = `${sourceSquare}${targetSquare}`;
    
    if (pieceAtSquare && pieceAtSquare.type === 'p') {
      if ((pieceAtSquare.color === 'w' && targetSquare[1] === '8') || 
          (pieceAtSquare.color === 'b' && targetSquare[1] === '1')) {
        moveNotation = `${sourceSquare}${targetSquare}q`;
      }
    }
    
    const move = currentGame.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q',
    });
    
    if (!move) {
      return false;
    }
    
    const newFen = currentGame.fen();
    setGame(currentGame);
    setGamePosition(newFen);
    setIsLoading(true);
    
    makeMove(gameId, moveNotation).then((response) => {
      // Apply Stockfish's move if it exists
      if (response.engine_move) {
        setGame(prevGame => {
          const stockfishGame = new Chess(prevGame.fen());
          const stockfishMove = stockfishGame.move({
            from: response.engine_move.substring(0, 2),
            to: response.engine_move.substring(2, 4),
            promotion: response.engine_move.length > 4 ? response.engine_move[4] : undefined,
          });
          
          if (stockfishMove) {
            setGamePosition(stockfishGame.fen());
            // Update move history
            setMoveHistory(prev => [
              ...prev,
              { move_number: prev.length + 1, move: moveNotation, player: 'user' },
              { move_number: prev.length + 2, move: response.engine_move, player: 'stockfish' }
            ]);
            return stockfishGame;
          }
          return prevGame;
        });
      } else {
        // Just update move history for user's move
        setMoveHistory(prev => [
          ...prev,
          { move_number: prev.length + 1, move: moveNotation, player: 'user' }
        ]);
      }

      if (response.game_over) {
        setGameStatus(`Game Over! Winner: ${response.winner}`);
      }
      
      if (onGameUpdate) {
        onGameUpdate(response);
      }

      setIsLoading(false);
    }).catch((error) => {
      console.error('Error making move:', error);
      setIsLoading(false);
      loadGame();
      alert(error.response?.data?.error || 'Error making move');
    });
    
    return true;
  };

  const resetGame = async () => {
    try {
      const response = await createGame();
      window.location.reload(); // Simple reload to reset state
    } catch (error) {
      console.error('Error resetting game:', error);
    }
  };

  return (
    <div className="chess-board-container">
      <div className="chess-board-header">
        <h2>Chess Game vs Stockfish</h2>
        <button onClick={resetGame} className="reset-button">
          New Game
        </button>
      </div>
      
      <div className="board-wrapper">
        <Chessboard
          options={{
            position: gamePosition,
            onPieceDrop: onDrop,
            allowDragging: !isLoading,
            boardStyle: { width: 600, height: 600 },
          }}
        />
      </div>
      
      {gameStatus && (
        <div className={`game-status ${gameStatus.includes('Winner') ? 'game-over' : ''}`}>
          {gameStatus}
        </div>
      )}
      
      {isLoading && (
        <div className="loading-indicator">
          Stockfish is thinking...
        </div>
      )}
      
      <div className="move-history">
        <h3>Move History</h3>
        <div className="moves-list">
          {moveHistory.map((move, idx) => (
            <span key={idx} className={`move-tag ${move.player}`}>
              {move.move_number}. {move.move} ({move.player})
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChessBoard;
