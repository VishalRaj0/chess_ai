import React, { useState, useEffect, useRef } from 'react';
import { sendChatMessage } from '../services/api';
import './Chatbot.css';

const Chatbot = ({ gameId }) => {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello! I\'m your chess coach. I can analyze your game and provide tips. Ask me anything about your current position, opening strategies, or chess tactics!',
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading || !gameId) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    
    // Add user message to chat
    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await sendChatMessage(gameId, userMessage);
      
      // Add assistant response
      setMessages([
        ...newMessages,
        { role: 'assistant', content: response.response },
      ]);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickQuestions = [
    'Give me a tip',
    'What\'s the best move?',
    'Did I make a mistake?',
    'Explain this position',
  ];

  return (
    <div className="chatbot-container">
      <div className="chatbot-header">
        <h2>Chess Coach</h2>
        <div className="coach-icon">♟️</div>
      </div>
      
      <div className="messages-container">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <div className="message-content">
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message assistant">
            <div className="message-content">
              <span className="typing-indicator">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="quick-questions">
        {quickQuestions.map((question, idx) => (
          <button
            key={idx}
            className="quick-question-btn"
            onClick={() => setInputMessage(question)}
            disabled={isLoading}
          >
            {question}
          </button>
        ))}
      </div>
      
      <form onSubmit={handleSend} className="chat-input-form">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Ask me about your game..."
          className="chat-input"
          disabled={isLoading || !gameId}
        />
        <button
          type="submit"
          className="send-button"
          disabled={isLoading || !inputMessage.trim() || !gameId}
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default Chatbot;
