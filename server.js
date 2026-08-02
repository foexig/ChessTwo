const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Chess } = require('chess.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// --- Game state management ---
const games = new Map(); // gameId -> { chess, players: { w, b }, spectators: [] }

function generateGameId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getGameState(gameId) {
  const game = games.get(gameId);
  if (!game) return null;
  return {
    fen: game.chess.fen(),
    turn: game.chess.turn(),
    isCheck: game.chess.isCheck(),
    isCheckmate: game.chess.isCheckmate(),
    isStalemate: game.chess.isStalemate(),
    isDraw: game.chess.isDraw(),
    isGameOver: game.chess.isGameOver(),
    history: game.chess.history({ verbose: true }),
    players: {
      white: game.players.w || null,
      black: game.players.b || null
    }
  };
}

io.on('connection', (socket) => {
  console.log(`[CONNECT] ${socket.id}`);

  socket.on('game:create', () => {
    const gameId = generateGameId();
    const chess = new Chess();
    games.set(gameId, {
      chess,
      players: { w: socket.id, b: null },
      spectators: []
    });
    socket.join(gameId);
    socket.gameId = gameId;
    socket.color = 'w';
    socket.emit('game:created', { gameId, color: 'w' });
    socket.emit('game:state', getGameState(gameId));
    console.log(`[CREATE] Game ${gameId} by ${socket.id}`);
  });

  socket.on('game:join', ({ gameId }) => {
    const game = games.get(gameId);
    if (!game) {
      socket.emit('game:error', { message: 'Game not found' });
      return;
    }

    if (!game.players.b) {
      game.players.b = socket.id;
      socket.join(gameId);
      socket.gameId = gameId;
      socket.color = 'b';
      socket.emit('game:joined', { gameId, color: 'b' });
      socket.emit('game:state', getGameState(gameId));
      io.to(game.players.w).emit('game:opponent_joined', { color: 'b' });
      io.to(gameId).emit('game:state', getGameState(gameId));
      console.log(`[JOIN] ${socket.id} joined ${gameId} as black`);
    } else {
      game.spectators.push(socket.id);
      socket.join(gameId);
      socket.gameId = gameId;
      socket.color = 's';
      socket.emit('game:joined', { gameId, color: 's' });
      socket.emit('game:state', getGameState(gameId));
      console.log(`[JOIN] ${socket.id} joined ${gameId} as spectator`);
    }
  });

  socket.on('game:move', ({ from, to, promotion }) => {
    const game = games.get(socket.gameId);
    if (!game) {
      socket.emit('game:error', { message: 'No active game' });
      return;
    }

    if (socket.color !== game.chess.turn()) {
      socket.emit('game:error', { message: 'Not your turn' });
      return;
    }

    try {
      const move = game.chess.move({ from, to, promotion: promotion || 'q' });
      if (move) {
        io.to(socket.gameId).emit('game:move', move);
        io.to(socket.gameId).emit('game:state', getGameState(socket.gameId));
        console.log(`[MOVE] ${socket.gameId}: ${move.from}-${move.to}`);
      } else {
        socket.emit('game:error', { message: 'Invalid move' });
      }
    } catch (e) {
      socket.emit('game:error', { message: 'Invalid move' });
    }
  });

  socket.on('game:resign', () => {
    const game = games.get(socket.gameId);
    if (!game) return;
    const winner = socket.color === 'w' ? 'b' : 'w';
    io.to(socket.gameId).emit('game:resigned', { winner });
    console.log(`[RESIGN] ${socket.gameId}: ${socket.color} resigned`);
  });

  socket.on('game:rematch', () => {
    const game = games.get(socket.gameId);
    if (!game) return;
    game.chess = new Chess();
    io.to(socket.gameId).emit('game:state', getGameState(socket.gameId));
    io.to(socket.gameId).emit('game:rematch');
    console.log(`[REMATCH] ${socket.gameId} reset`);
  });

  socket.on('chat:message', ({ text }) => {
    if (!socket.gameId) return;
    const color = socket.color;
    const name = color === 'w' ? 'White' : color === 'b' ? 'Black' : 'Spectator';
    io.to(socket.gameId).emit('chat:message', { sender: name, text, color, timestamp: Date.now() });
  });

  socket.on('disconnect', () => {
    console.log(`[DISCONNECT] ${socket.id}`);
    if (!socket.gameId) return;
    const game = games.get(socket.gameId);
    if (!game) return;

    if (socket.color === 'w' && game.players.w === socket.id) {
      game.players.w = null;
      io.to(socket.gameId).emit('game:opponent_left', { color: 'w' });
    } else if (socket.color === 'b' && game.players.b === socket.id) {
      game.players.b = null;
      io.to(socket.gameId).emit('game:opponent_left', { color: 'b' });
    } else {
      game.spectators = game.spectators.filter(id => id !== socket.id);
    }

    if (!game.players.w && !game.players.b && game.spectators.length === 0) {
      games.delete(socket.gameId);
      console.log(`[CLEANUP] ${socket.gameId} deleted`);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Chess server running!`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://<your-ip>:${PORT}\n`);
});
