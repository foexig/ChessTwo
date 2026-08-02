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
const games = new Map(); // gameId -> game object

function generateGameId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Time control presets (in seconds), 0 = unlimited
const TIME_PRESETS = {
  '1+0': { initial: 60, increment: 0 },
  '2+1': { initial: 120, increment: 1 },
  '3+0': { initial: 180, increment: 0 },
  '3+2': { initial: 180, increment: 2 },
  '5+0': { initial: 300, increment: 0 },
  '5+3': { initial: 300, increment: 3 },
  '10+0': { initial: 600, increment: 0 },
  '15+10': { initial: 900, increment: 10 },
  '30+0': { initial: 1800, increment: 0 },
  'unlimited': { initial: 0, increment: 0 }
};

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
    },
    timeControl: game.timeControl,
    clocks: game.clocks,
    rematchRequest: game.rematchRequest || null
  };
}

function updateClocks(game, socket) {
  if (game.timeControl.initial === 0) return; // unlimited

  const now = Date.now();
  const turn = game.chess.turn();

  if (turn === 'w') {
    // White's clock is ticking
    if (game.lastClockUpdate) {
      const elapsed = (now - game.lastClockUpdate) / 1000;
      game.clocks.w = Math.max(0, game.clocks.w - elapsed);
    }
    game.lastClockUpdate = now;
  } else {
    if (game.lastClockUpdate) {
      const elapsed = (now - game.lastClockUpdate) / 1000;
      game.clocks.b = Math.max(0, game.clocks.b - elapsed);
    }
    game.lastClockUpdate = now;
  }

  // Check for timeout
  if (game.clocks.w <= 0 || game.clocks.b <= 0) {
    const winner = game.clocks.w <= 0 ? 'b' : 'w';
    game.chessGameEnded = true;
    return { timeout: true, winner };
  }
  return null;
}

io.on('connection', (socket) => {
  console.log(`[CONNECT] ${socket.id}`);

  socket.on('game:create', ({ timeControl } = {}) => {
    const gameId = generateGameId();
    const chess = new Chess();
    const tc = TIME_PRESETS[timeControl] || TIME_PRESETS['unlimited'];

    games.set(gameId, {
      chess,
      players: { w: socket.id, b: null },
      spectators: [],
      timeControl: { name: timeControl || 'unlimited', ...tc },
      clocks: { w: tc.initial, b: tc.initial },
      lastClockUpdate: null,
      rematchRequest: null
    });
    socket.join(gameId);
    socket.gameId = gameId;
    socket.color = 'w';
    socket.emit('game:created', { gameId, color: 'w' });
    socket.emit('game:state', getGameState(gameId));
    console.log(`[CREATE] Game ${gameId} by ${socket.id} time=${timeControl || 'unlimited'}`);
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

    if (game.chessGameEnded) {
      socket.emit('game:error', { message: 'Game is over' });
      return;
    }

    if (socket.color !== game.chess.turn()) {
      socket.emit('game:error', { message: 'Not your turn' });
      return;
    }

    try {
      // Update clock before move
      const clockResult = updateClocks(game, socket);

      const move = game.chess.move({ from, to, promotion: promotion || 'q' });
      if (move) {
        // Add increment to the player who just moved
        if (game.timeControl.initial > 0 && game.timeControl.increment > 0) {
          if (socket.color === 'w') {
            game.clocks.w += game.timeControl.increment;
          } else {
            game.clocks.b += game.timeControl.increment;
          }
        }

        // Start the opponent's clock
        if (game.timeControl.initial > 0) {
          game.lastClockUpdate = Date.now();
        }

        io.to(socket.gameId).emit('game:move', move);
        io.to(socket.gameId).emit('game:state', getGameState(socket.gameId));
        console.log(`[MOVE] ${socket.gameId}: ${move.from}-${move.to}`);

        // Check for timeout
        if (clockResult && clockResult.timeout) {
          io.to(socket.gameId).emit('game:timeout', { winner: clockResult.winner });
        }
      } else {
        socket.emit('game:error', { message: 'Invalid move' });
      }
    } catch (e) {
      socket.emit('game:error', { message: 'Invalid move' });
    }
  });

  // Sync clocks every second for active games
  setInterval(() => {
    for (const [gameId, game] of games) {
      if (game.timeControl.initial === 0) continue;
      if (game.chess.isGameOver() || game.chessGameEnded) continue;
      if (!game.players.w || !game.players.b) continue;
      if (!game.lastClockUpdate) continue;

      const now = Date.now();
      const elapsed = (now - game.lastClockUpdate) / 1000;
      const turn = game.chess.turn();

      if (turn === 'w') {
        game.clocks.w = Math.max(0, game.clocks.w - elapsed);
        game.lastClockUpdate = now;
        if (game.clocks.w <= 0) {
          game.chessGameEnded = true;
          io.to(gameId).emit('game:timeout', { winner: 'b' });
        }
      } else {
        game.clocks.b = Math.max(0, game.clocks.b - elapsed);
        game.lastClockUpdate = now;
        if (game.clocks.b <= 0) {
          game.chessGameEnded = true;
          io.to(gameId).emit('game:timeout', { winner: 'w' });
        }
      }

      io.to(gameId).emit('clock:tick', {
        clocks: game.clocks,
        turn: game.chess.turn()
      });
    }
  }, 1000);

  socket.on('game:resign', () => {
    const game = games.get(socket.gameId);
    if (!game) return;
    const winner = socket.color === 'w' ? 'b' : 'w';
    game.chessGameEnded = true;
    io.to(socket.gameId).emit('game:resigned', { winner });
    console.log(`[RESIGN] ${socket.gameId}: ${socket.color} resigned`);
  });

  // Rematch request/accept system
  socket.on('game:rematch_request', () => {
    const game = games.get(socket.gameId);
    if (!game) return;
    if (!game.players.w || !game.players.b) {
      socket.emit('game:error', { message: 'Need both players for rematch' });
      return;
    }

    game.rematchRequest = {
      requestedBy: socket.color,
      timestamp: Date.now()
    };

    io.to(socket.gameId).emit('game:rematch_request', { requestedBy: socket.color });
    console.log(`[REMATCH REQUEST] ${socket.gameId} by ${socket.color}`);
  });

  socket.on('game:rematch_accept', () => {
    const game = games.get(socket.gameId);
    if (!game) return;
    if (!game.rematchRequest) {
      socket.emit('game:error', { message: 'No rematch request pending' });
      return;
    }
    if (game.rematchRequest.requestedBy === socket.color) {
      socket.emit('game:error', { message: 'You requested the rematch, wait for opponent' });
      return;
    }

    // Both agreed — reset the game
    game.chess = new Chess();
    game.chessGameEnded = false;
    game.clocks = { w: game.timeControl.initial, b: game.timeControl.initial };
    game.lastClockUpdate = null;
    game.rematchRequest = null;

    io.to(socket.gameId).emit('game:state', getGameState(socket.gameId));
    io.to(socket.gameId).emit('game:rematch');
    console.log(`[REMATCH] ${socket.gameId} reset`);
  });

  socket.on('game:rematch_decline', () => {
    const game = games.get(socket.gameId);
    if (!game) return;
    game.rematchRequest = null;
    io.to(socket.gameId).emit('game:rematch_declined');
    console.log(`[REMATCH DECLINED] ${socket.gameId}`);
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
