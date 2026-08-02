const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Chess } = require('chess.js');
const { PERKS, PERK_MAP, getResurrectSquares } = require('./public/js/perks.js');
const { CHARACTERS, CHARACTER_MAP, RARITIES, applyCharacterBonuses } = require('./public/js/draft.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// --- Game state management ---
const games = new Map();

function generateGameId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

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
    rematchRequest: game.rematchRequest || null,
    perks: game.perks || null,
    perkLog: game.perkLog || [],
    profiles: game.profiles || null,
    characters: game.characters || null
  };
}

// --- Perk execution helpers ---
function switchTurn(chess) {
  const fen = chess.fen();
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  if (parts[1] === 'w') {
    parts[5] = (parseInt(parts[5]) + 1).toString();
  }
  chess.load(parts.join(' '));
}

function isPathClear(chess, from, to) {
  const FILES = ['a','b','c','d','e','f','g','h'];
  const RANKS = ['1','2','3','4','5','6','7','8'];
  const f1 = FILES.indexOf(from[0]), r1 = RANKS.indexOf(from[1]);
  const f2 = FILES.indexOf(to[0]), r2 = RANKS.indexOf(to[1]);
  const dr = Math.sign(r2 - r1), df = Math.sign(f2 - f1);
  let r = r1 + dr, f = f1 + df;
  while (r !== r2 || f !== f2) {
    const sq = FILES[f] + RANKS[r];
    if (chess.get(sq)) return false;
    r += dr; f += df;
  }
  return true;
}

function isKnightMove(from, to) {
  const df = Math.abs(from.charCodeAt(0) - to.charCodeAt(0));
  const dr = Math.abs(from.charCodeAt(1) - to.charCodeAt(1));
  return (df === 2 && dr === 1) || (df === 1 && dr === 2);
}

function isLongKnightMove(from, to) {
  const df = Math.abs(from.charCodeAt(0) - to.charCodeAt(0));
  const dr = Math.abs(from.charCodeAt(1) - to.charCodeAt(1));
  return (df === 3 && dr === 1) || (df === 1 && dr === 3);
}

function sameColorSquare(from, to) {
  const fromLight = (from.charCodeAt(0) + from.charCodeAt(1)) % 2 === 0;
  const toLight = (to.charCodeAt(0) + to.charCodeAt(1)) % 2 === 0;
  return fromLight === toLight;
}

function executePerk(game, socket, { perkId, from, to, pieceType }) {
  const chess = game.chess;
  const color = socket.color;
  const playerPerks = game.perks[color];
  const perkData = playerPerks.find(p => p.id === perkId && (p.uses || 0) > 0);
  if (!perkData) return { error: 'Perk not available' };

  const perk = PERK_MAP[perkId];
  if (!perk) return { error: 'Unknown perk' };

  const log = { perkId, player: color, usedAt: Date.now() };

  switch (perkId) {
    case 'sniper-rook': {
      const piece = chess.get(from);
      if (!piece || piece.type !== 'r' || piece.color !== color) return { error: 'Select your rook' };
      const target = chess.get(to);
      if (!target || target.color === color) return { error: 'Target must be an enemy piece' };
      if (from[0] !== to[0] && from[1] !== to[1]) return { error: 'Target must be on same rank or file' };
      if (!isPathClear(chess, from, to)) return { error: 'Path is blocked' };
      chess.remove(to);
      log.from = from; log.to = to; log.san = `R${from}x${to} (sniper)`;
      break;
    }
    case 'kings-knight': {
      const piece = chess.get(from);
      if (!piece || piece.type !== 'k' || piece.color !== color) return { error: 'Select your king' };
      if (!isKnightMove(from, to)) return { error: 'Must be a knight move' };
      const target = chess.get(to);
      if (target && target.color === color) return { error: 'Cannot capture your own piece' };
      chess.remove(from);
      if (target) chess.remove(to);
      chess.put({ type: 'k', color }, to);
      log.from = from; log.to = to; log.san = `K${from}~${to}`;
      break;
    }
    case 'queens-leap': {
      const piece = chess.get(from);
      if (!piece || piece.type !== 'q' || piece.color !== color) return { error: 'Select your queen' };
      if (!isKnightMove(from, to)) return { error: 'Must be a knight move' };
      const target = chess.get(to);
      if (target && target.color === color) return { error: 'Cannot capture your own piece' };
      chess.remove(from);
      if (target) chess.remove(to);
      chess.put({ type: 'q', color }, to);
      log.from = from; log.to = to; log.san = `Q${from}~${to}`;
      break;
    }
    case 'pawn-blitz': {
      const piece = chess.get(from);
      if (!piece || piece.type !== 'p' || piece.color !== color) return { error: 'Select your pawn' };
      const dir = color === 'w' ? 1 : -1;
      // Must be 1 square straight forward
      if (from[0] !== to[0]) return { error: 'Must be same file (straight forward)' };
      if (parseInt(to[1]) - parseInt(from[1]) !== dir) return { error: 'Must be exactly 1 square forward' };
      const target = chess.get(to);
      if (!target || target.color === color) return { error: 'No enemy piece to capture there' };
      chess.remove(from);
      chess.remove(to);
      chess.put({ type: 'p', color }, to);
      log.from = from; log.to = to; log.san = `${from}x${to}`;
      break;
    }
    case 'bishop-warp': {
      const piece = chess.get(from);
      if (!piece || piece.type !== 'b' || piece.color !== color) return { error: 'Select your bishop' };
      if (chess.get(to)) return { error: 'Target must be empty' };
      if (!sameColorSquare(from, to)) return { error: 'Must be same color square' };
      chess.remove(from);
      chess.put({ type: 'b', color }, to);
      log.from = from; log.to = to; log.san = `B${from}~${to}`;
      break;
    }
    case 'long-knight': {
      const piece = chess.get(from);
      if (!piece || piece.type !== 'n' || piece.color !== color) return { error: 'Select your knight' };
      if (!isLongKnightMove(from, to)) return { error: 'Must be a 3+1 jump' };
      const target = chess.get(to);
      if (target && target.color === color) return { error: 'Cannot capture your own piece' };
      chess.remove(from);
      if (target) chess.remove(to);
      chess.put({ type: 'n', color }, to);
      log.from = from; log.to = to; log.san = `N${from}~${to}`;
      break;
    }
    case 'double-move': {
      game.doubleMoveActive = color;
      perkData.uses = (perkData.uses || 1) - 1;
      log.san = 'Double Move activated';
      game.perkLog = game.perkLog || [];
      game.perkLog.push(log);
      return { success: true, skipTurnSwitch: true };
    }
    case 'resurrect': {
      if (!pieceType) return { error: 'No piece type selected' };
      const squares = getResurrectSquares(pieceType, color);
      const targetSq = squares.find(sq => !chess.get(sq));
      if (!targetSq) return { error: 'No empty starting square' };
      const board = chess.board();
      const counts = { p: 0, n: 0, b: 0, r: 0, q: 0 };
      for (const row of board) {
        for (const sq of row) {
          if (sq && sq.color === color && counts[sq.type] !== undefined) counts[sq.type]++;
        }
      }
      const starting = { p: 8, n: 2, b: 2, r: 2, q: 1 };
      if (counts[pieceType] >= starting[pieceType]) return { error: 'No captured piece of that type' };
      chess.put({ type: pieceType, color }, targetSq);
      log.to = targetSq; log.san = `+${pieceType.toUpperCase()}@${targetSq}`;
      break;
    }
    default:
      return { error: 'Unknown perk' };
  }

  perkData.uses = (perkData.uses || 1) - 1;
  switchTurn(chess);
  game.perkLog = game.perkLog || [];
  game.perkLog.push(log);
  return { success: true };
}

// --- Start game after both drafts complete ---
function startGame(gameId) {
  const game = games.get(gameId);
  if (!game) return;

  // Apply Speedster time bonus
  for (const color of ['w', 'b']) {
    const char = game.characters[color];
    if (char && CHARACTER_MAP[char] && CHARACTER_MAP[char].ability === 'time_bonus') {
      const bonus = CHARACTER_MAP[char].value;
      game.clocks[color] = Math.floor(game.clocks[color] * (1 + bonus));
    }
  }

  // Reset clock state
  game.lastClockUpdate = null;

  // Send game state to both players
  io.to(gameId).emit('draft:complete', {});
  io.to(gameId).emit('game:state', getGameState(gameId));

  console.log(`[GAME_START] ${gameId} — characters: w=${game.characters.w}, b=${game.characters.b}`);
}

io.on('connection', (socket) => {
  console.log(`[CONNECT] ${socket.id}`);

  socket.on('game:create', ({ timeControl, name, avatar } = {}) => {
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
      rematchRequest: null,
      perks: null,  // Set after draft
      perkLog: [],
      doubleMoveActive: null,
      draftComplete: { w: false, b: false },
      characters: { w: null, b: null },
      profiles: {
        w: { name: name || 'White', avatar: avatar || '' },
        b: { name: 'Black', avatar: '' }
      }
    });
    socket.join(gameId);
    socket.gameId = gameId;
    socket.color = 'w';
    socket.emit('game:created', { gameId, color: 'w' });
    socket.emit('game:state', getGameState(gameId));
    console.log(`[CREATE] Game ${gameId} by ${socket.id} name=${name || 'unnamed'}`);
  });

  socket.on('game:join', ({ gameId, name, avatar } = {}) => {
    const game = games.get(gameId);
    if (!game) {
      socket.emit('game:error', { message: 'Game not found' });
      return;
    }

    if (!game.players.b) {
      game.players.b = socket.id;
      game.profiles.b = { name: name || 'Black', avatar: avatar || '' };
      socket.join(gameId);
      socket.gameId = gameId;
      socket.color = 'b';
      socket.emit('game:joined', { gameId, color: 'b' });
      io.to(game.players.w).emit('game:opponent_joined', { color: 'b' });

      // Start draft phase for both players
      io.to(gameId).emit('draft:start', {});
      console.log(`[DRAFT_START] ${gameId} — both players drafting`);
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

  // --- Draft: player completes their draft ---
  socket.on('draft:complete', ({ characterId, perks, avatar }) => {
    const game = games.get(socket.gameId);
    if (!game) { socket.emit('game:error', { message: 'No active game' }); return; }
    if (game.draftComplete[socket.color]) return; // Already completed

    game.characters[socket.color] = characterId;
    game.perks = game.perks || { w: [], b: [] };
    game.perks[socket.color] = perks;
    game.draftComplete[socket.color] = true;
    // Update profile avatar with character icon
    if (avatar) game.profiles[socket.color].avatar = avatar;

    console.log(`[DRAFT_COMPLETE] ${socket.gameId} — ${socket.color} drafted ${perks.length} perks with ${characterId}`);

    // If both players have drafted, start the game
    if (game.draftComplete.w && game.draftComplete.b) {
      startGame(socket.gameId);
    }
  });

  socket.on('game:move', ({ from, to, promotion }) => {
    const game = games.get(socket.gameId);
    if (!game) { socket.emit('game:error', { message: 'No active game' }); return; }
    if (game.chessGameEnded) { socket.emit('game:error', { message: 'Game is over' }); return; }
    if (socket.color !== game.chess.turn()) { socket.emit('game:error', { message: 'Not your turn' }); return; }

    try {
      const move = game.chess.move({ from, to, promotion: promotion || 'q' });
      if (move) {
        if (game.timeControl.initial > 0 && game.timeControl.increment > 0) {
          if (socket.color === 'w') game.clocks.w += game.timeControl.increment;
          else game.clocks.b += game.timeControl.increment;
        }
        if (game.timeControl.initial > 0) game.lastClockUpdate = Date.now();

        if (game.doubleMoveActive === socket.color) {
          game.doubleMoveActive = null;
          const fen = game.chess.fen();
          const parts = fen.split(' ');
          parts[1] = socket.color;
          parts[3] = '-';
          game.chess.load(parts.join(' '));
          io.to(socket.gameId).emit('game:state', getGameState(socket.gameId));
          io.to(socket.gameId).emit('game:move', move);
          return;
        }

        io.to(socket.gameId).emit('game:move', move);
        io.to(socket.gameId).emit('game:state', getGameState(socket.gameId));

        if (game.timeControl.initial > 0) {
          const turn = game.chess.turn();
          if ((turn === 'w' && game.clocks.w <= 0) || (turn === 'b' && game.clocks.b <= 0)) {
            game.chessGameEnded = true;
            const winner = turn === 'w' ? 'b' : 'w';
            io.to(socket.gameId).emit('game:timeout', { winner });
          }
        }
      } else {
        socket.emit('game:error', { message: 'Invalid move' });
      }
    } catch (e) {
      socket.emit('game:error', { message: 'Invalid move' });
    }
  });

  socket.on('perk:activate', (data) => {
    const game = games.get(socket.gameId);
    if (!game) { socket.emit('game:error', { message: 'No active game' }); return; }
    if (game.chessGameEnded) { socket.emit('game:error', { message: 'Game is over' }); return; }
    if (socket.color !== game.chess.turn()) { socket.emit('game:error', { message: 'Not your turn' }); return; }

    const result = executePerk(game, socket, data);
    if (result.error) { socket.emit('game:error', { message: result.error }); return; }

    if (game.timeControl.initial > 0 && game.timeControl.increment > 0) {
      if (socket.color === 'w') game.clocks.w += game.timeControl.increment;
      else game.clocks.b += game.timeControl.increment;
    }
    if (game.timeControl.initial > 0) game.lastClockUpdate = Date.now();

    io.to(socket.gameId).emit('perk:activated', {
      perkId: data.perkId,
      player: socket.color,
      perks: game.perks,
      fen: game.chess.fen(),
      perkLog: game.perkLog
    });

    if (!result.skipTurnSwitch) {
      io.to(socket.gameId).emit('game:state', getGameState(socket.gameId));
      if (game.timeControl.initial > 0) {
        const turn = game.chess.turn();
        if ((turn === 'w' && game.clocks.w <= 0) || (turn === 'b' && game.clocks.b <= 0)) {
          game.chessGameEnded = true;
          const winner = turn === 'w' ? 'b' : 'w';
          io.to(socket.gameId).emit('game:timeout', { winner });
        }
      }
    } else {
      io.to(socket.gameId).emit('game:state', getGameState(socket.gameId));
    }
  });

  // Clock sync
  setInterval(() => {
    for (const [gameId, game] of games) {
      if (game.timeControl.initial === 0) continue;
      if (game.chess.isGameOver() || game.chessGameEnded) continue;
      if (!game.players.w || !game.players.b) continue;
      if (!game.lastClockUpdate) continue;
      if (!game.draftComplete.w || !game.draftComplete.b) continue;

      const now = Date.now();
      const elapsed = (now - game.lastClockUpdate) / 1000;
      const turn = game.chess.turn();

      if (turn === 'w') {
        game.clocks.w = Math.max(0, game.clocks.w - elapsed);
        game.lastClockUpdate = now;
        if (game.clocks.w <= 0) { game.chessGameEnded = true; io.to(gameId).emit('game:timeout', { winner: 'b' }); }
      } else {
        game.clocks.b = Math.max(0, game.clocks.b - elapsed);
        game.lastClockUpdate = now;
        if (game.clocks.b <= 0) { game.chessGameEnded = true; io.to(gameId).emit('game:timeout', { winner: 'w' }); }
      }

      io.to(gameId).emit('clock:tick', { clocks: game.clocks, turn: game.chess.turn() });
    }
  }, 1000);

  socket.on('game:resign', () => {
    const game = games.get(socket.gameId);
    if (!game) return;
    const winner = socket.color === 'w' ? 'b' : 'w';
    game.chessGameEnded = true;
    io.to(socket.gameId).emit('game:resigned', { winner });
  });

  socket.on('game:rematch_request', () => {
    const game = games.get(socket.gameId);
    if (!game) return;
    if (!game.players.w || !game.players.b) {
      socket.emit('game:error', { message: 'Need both players for rematch' });
      return;
    }
    game.rematchRequest = { requestedBy: socket.color, timestamp: Date.now() };
    io.to(socket.gameId).emit('game:rematch_requested', { requestedBy: socket.color });
  });

  socket.on('game:rematch_accept', () => {
    const game = games.get(socket.gameId);
    if (!game) return;
    if (!game.rematchRequest) { socket.emit('game:error', { message: 'No rematch request pending' }); return; }
    if (game.rematchRequest.requestedBy === socket.color) {
      socket.emit('game:error', { message: 'You requested the rematch' });
      return;
    }

    // Reset game for rematch — trigger draft again
    game.chess = new Chess();
    game.chessGameEnded = false;
    game.clocks = { w: game.timeControl.initial, b: game.timeControl.initial };
    game.lastClockUpdate = null;
    game.rematchRequest = null;
    game.perks = null;
    game.perkLog = [];
    game.doubleMoveActive = null;
    game.draftComplete = { w: false, b: false };
    game.characters = { w: null, b: null };

    io.to(socket.gameId).emit('game:rematch_accepted', {});
    io.to(socket.gameId).emit('draft:start', {});
    console.log(`[REMATCH_DRAFT] ${socket.gameId} — new draft starting`);
  });

  socket.on('game:rematch_decline', () => {
    const game = games.get(socket.gameId);
    if (!game) return;
    game.rematchRequest = null;
    io.to(socket.gameId).emit('game:rematch_declined');
  });

  socket.on('chat:message', ({ text }) => {
    if (!socket.gameId) return;
    const color = socket.color;
    const game = games.get(socket.gameId);
    const profileName = (game && game.profiles && game.profiles[color]) ? game.profiles[color].name : null;
    const name = profileName || (color === 'w' ? 'White' : color === 'b' ? 'Black' : 'Spectator');
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
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Chess server running!`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://<your-ip>:${PORT}\n`);
});
