// main.js — Client-side game logic, Socket.io, UI

const socket = io();
let board = null;
let myColor = 'w';
let gameId = null;
let gameState = null;
let selectedSquare = null;
let pendingPromotion = null;
let clientChess = null;
let selectedTimeControl = 'unlimited';
let rematchPending = false;
let localClocks = { w: 0, b: 0 };

// --- DOM elements ---
const lobby = document.getElementById('lobby');
const gameScreen = document.getElementById('game');
const lobbyMessage = document.getElementById('lobbyMessage');
const gameCodeDisplay = document.getElementById('gameCodeDisplay');
const turnIndicator = document.getElementById('turnIndicator');
const gameStatus = document.getElementById('gameStatus');
const moveHistory = document.getElementById('moveHistory');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const promotionDialog = document.getElementById('promotionDialog');
const rematchDialog = document.getElementById('rematchDialog');
const rematchDialogText = document.getElementById('rematchDialogText');
const btnRematch = document.getElementById('btnRematch');

// Player bars — top = opponent, bottom = me (swapped based on color)
const playerTop = document.getElementById('playerTop');
const playerBottom = document.getElementById('playerBottom');
const clockTop = document.getElementById('clockTop');
const clockBottom = document.getElementById('clockBottom');

// Game over banner
const gameOverBanner = document.getElementById('gameOverBanner');
const gameOverIcon = document.getElementById('gameOverIcon');
const gameOverTitle = document.getElementById('gameOverTitle');
const gameOverReason = document.getElementById('gameOverReason');
const btnBannerRematch = document.getElementById('btnBannerRematch');
const btnBannerLeave = document.getElementById('btnBannerLeave');

// --- Code modal elements ---
const codeModal = document.getElementById('codeModal');
const codeDisplayBig = document.getElementById('codeDisplayBig');
const serverIpHint = document.getElementById('serverIpHint');

// --- Initialize board ---
board = new ChessBoard('chessboard', {
  onMove: (from, to, isPromotion) => {
    if (isPromotion) {
      pendingPromotion = { from, to };
      promotionDialog.classList.remove('hidden');
    } else {
      socket.emit('game:move', { from, to });
    }
  },
  onSquareClick: (sqName) => {
    handleSquareClick(sqName);
  }
});

// --- Time control selection ---
document.querySelectorAll('.tc-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tc-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedTimeControl = btn.dataset.tc;
  });
});

// --- Setup player bars based on color ---
function setupPlayerBars(color) {
  if (color === 'w') {
    playerBottom.textContent = 'You (White)';
    playerTop.textContent = 'Black';
  } else if (color === 'b') {
    playerBottom.textContent = 'You (Black)';
    playerTop.textContent = 'White';
  } else {
    playerBottom.textContent = 'White';
    playerTop.textContent = 'Black';
  }
}

// --- Game over banner ---
function showGameOverBanner(icon, title, reason, winnerColor) {
  gameOverIcon.textContent = icon;
  gameOverTitle.textContent = title;
  gameOverReason.textContent = reason;

  // Color: green if I won, red if I lost, yellow for draw/spectator
  gameOverTitle.classList.remove('win', 'loss', 'draw');
  if (!winnerColor) {
    gameOverTitle.classList.add('draw');
  } else if (winnerColor === myColor) {
    gameOverTitle.classList.add('win');
  } else {
    gameOverTitle.classList.add('loss');
  }

  gameOverBanner.classList.remove('hidden');
}

function hideGameOverBanner() {
  gameOverBanner.classList.add('hidden');
}

// --- Square click handler (click-to-move) ---
function handleSquareClick(sqName) {
  if (!gameState || gameState.isGameOver) return;
  if (gameState.turn !== myColor) return;

  const piece = board.getPieceAt(sqName);

  if (selectedSquare) {
    if (sqName === selectedSquare) {
      board.clearSelection();
      selectedSquare = null;
      return;
    }

    const isLegal = board.legalMoves.some(m => m.to === sqName);
    if (isLegal) {
      const fromPiece = board.getPieceAt(selectedSquare);
      if (fromPiece && fromPiece[1] === 'P') {
        const targetRank = sqName[1];
        if ((fromPiece[0] === 'w' && targetRank === '8') || (fromPiece[0] === 'b' && targetRank === '1')) {
          pendingPromotion = { from: selectedSquare, to: sqName };
          promotionDialog.classList.remove('hidden');
          board.clearSelection();
          selectedSquare = null;
          return;
        }
      }
      socket.emit('game:move', { from: selectedSquare, to: sqName });
      board.clearSelection();
      selectedSquare = null;
    } else if (piece && piece[0] === myColor) {
      selectPiece(sqName);
    } else {
      board.clearSelection();
      selectedSquare = null;
    }
  } else {
    if (piece && piece[0] === myColor) {
      selectPiece(sqName);
    }
  }
}

function selectPiece(sqName) {
  selectedSquare = sqName;
  board.selectSquare(sqName);

  if (clientChess) {
    try {
      const moves = clientChess.moves({ square: sqName, verbose: true });
      board.setLegalMoves(moves);
    } catch (e) {
      board.setLegalMoves([]);
    }
  }
}

// --- Promotion dialog ---
document.querySelectorAll('.promotion-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (pendingPromotion) {
      socket.emit('game:move', {
        from: pendingPromotion.from,
        to: pendingPromotion.to,
        promotion: btn.dataset.piece
      });
      pendingPromotion = null;
    }
    promotionDialog.classList.add('hidden');
    board.clearSelection();
    selectedSquare = null;
  });
});

// --- Lobby ---
document.getElementById('btnCreate').addEventListener('click', () => {
  socket.emit('game:create', { timeControl: selectedTimeControl });
});

document.getElementById('btnJoin').addEventListener('click', () => {
  const code = document.getElementById('gameIdInput').value.trim().toUpperCase();
  if (code) {
    socket.emit('game:join', { gameId: code });
  }
});

document.getElementById('gameIdInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('btnJoin').click();
  }
});

// --- Game actions ---
document.getElementById('btnResign').addEventListener('click', () => {
  if (confirm('Are you sure you want to resign?')) {
    socket.emit('game:resign');
  }
});

document.getElementById('btnRematch').addEventListener('click', () => {
  if (!rematchPending) {
    socket.emit('game:rematch_request');
    btnRematch.textContent = 'Rematch Requested...';
    btnRematch.disabled = true;
    rematchPending = true;
  }
});

document.getElementById('btnLeave').addEventListener('click', () => {
  if (confirm('Leave the game?')) {
    window.location.reload();
  }
});

// Banner buttons
btnBannerRematch.addEventListener('click', () => {
  hideGameOverBanner();
  if (!rematchPending) {
    socket.emit('game:rematch_request');
    btnRematch.textContent = 'Rematch Requested...';
    btnRematch.disabled = true;
    rematchPending = true;
  }
});

btnBannerLeave.addEventListener('click', () => {
  window.location.reload();
});

// --- Rematch request handling ---
document.getElementById('btnAcceptRematch').addEventListener('click', () => {
  socket.emit('game:rematch_accept');
  rematchDialog.classList.add('hidden');
});

document.getElementById('btnDeclineRematch').addEventListener('click', () => {
  socket.emit('game:rematch_decline');
  rematchDialog.classList.add('hidden');
});

// --- Code modal ---
document.getElementById('btnCopyCode').addEventListener('click', () => {
  const code = codeDisplayBig.textContent;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById('btnCopyCode');
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = original; }, 1500);
    });
  } else {
    const textarea = document.createElement('textarea');
    textarea.value = code;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    const btn = document.getElementById('btnCopyCode');
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  }
});

document.getElementById('btnCloseModal').addEventListener('click', () => {
  codeModal.classList.add('hidden');
});

// --- Chat ---
document.getElementById('btnChatSend').addEventListener('click', sendChat);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendChat();
});

function sendChat() {
  const text = chatInput.value.trim();
  if (text) {
    socket.emit('chat:message', { text });
    chatInput.value = '';
  }
}

// --- Clock helpers ---
function formatTime(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function updateClockDisplay(clocks, turn) {
  if (!gameState || !gameState.timeControl || gameState.timeControl.initial === 0) {
    clockTop.classList.add('hidden');
    clockBottom.classList.add('hidden');
    return;
  }

  clockTop.classList.remove('hidden');
  clockBottom.classList.remove('hidden');

  localClocks = clocks || localClocks;

  let topClockVal, bottomClockVal, topColor, bottomColor;

  if (myColor === 'w') {
    topColor = 'b'; bottomColor = 'w';
    topClockVal = localClocks.b; bottomClockVal = localClocks.w;
  } else if (myColor === 'b') {
    topColor = 'w'; bottomColor = 'b';
    topClockVal = localClocks.w; bottomClockVal = localClocks.b;
  } else {
    topColor = 'b'; bottomColor = 'w';
    topClockVal = localClocks.b; bottomClockVal = localClocks.w;
  }

  clockTop.textContent = formatTime(topClockVal);
  clockBottom.textContent = formatTime(bottomClockVal);

  clockTop.classList.toggle('active', turn === topColor);
  clockBottom.classList.toggle('active', turn === bottomColor);

  clockTop.classList.toggle('low-time', topClockVal < 20);
  clockBottom.classList.toggle('low-time', bottomClockVal < 20);
}

// --- Socket events ---
socket.on('game:created', ({ gameId: id, color }) => {
  gameId = id;
  myColor = color;
  setupPlayerBars(color);
  showGameScreen(id, color);
  board.setMyColor(color);
  board.setFlipped(color === 'b');

  codeDisplayBig.textContent = id;
  serverIpHint.textContent = window.location.host;
  codeModal.classList.remove('hidden');
});

socket.on('game:joined', ({ gameId: id, color }) => {
  gameId = id;
  myColor = color;
  setupPlayerBars(color);
  showGameScreen(id, color);
  board.setMyColor(color);
  board.setFlipped(color === 'b');
});

socket.on('game:opponent_joined', () => {
  gameStatus.textContent = 'Opponent joined! Game on.';
  gameStatus.style.color = '#4ecca3';
  codeModal.classList.add('hidden');
});

socket.on('game:state', (state) => {
  gameState = state;

  if (window.ChessJS && ChessJS.Chess) {
    try {
      clientChess = new ChessJS.Chess(state.fen);
    } catch (e) {
      clientChess = null;
    }
  }

  updateUI(state);
  board.update(state.fen, {
    lastMove: state.history && state.history.length > 0 ? state.history[state.history.length - 1] : null,
    checkSquare: state.isCheck ? getKingSquare(state.fen, state.turn) : null
  });

  if (state.clocks) {
    localClocks = state.clocks;
    updateClockDisplay(state.clocks, state.turn);
  }

  // Check for game over via board state (checkmate, stalemate, draw)
  if (state.isCheckmate) {
    const winnerColor = state.turn === 'w' ? 'b' : 'w';
    const winnerName = winnerColor === 'w' ? 'White' : 'Black';
    showGameOverBanner('🏆', `${winnerName} Wins!`, 'by checkmate', winnerColor);
  } else if (state.isStalemate) {
    showGameOverBanner('🤝', 'Draw', 'by stalemate — no legal moves', null);
  } else if (state.isDraw) {
    showGameOverBanner('🤝', 'Draw', 'by repetition or insufficient material', null);
  }
});

socket.on('clock:tick', ({ clocks, turn }) => {
  localClocks = clocks;
  updateClockDisplay(clocks, turn);
});

socket.on('game:timeout', ({ winner }) => {
  const winnerName = winner === 'w' ? 'White' : 'Black';
  const loserName = winner === 'w' ? 'Black' : 'White';
  gameStatus.textContent = `${winnerName} wins on time!`;
  gameStatus.style.color = '#e94560';
  showGameOverBanner('⏱️', `${winnerName} Wins!`, `${loserName} ran out of time`, winner);
});

socket.on('game:rematch_request', ({ requestedBy }) => {
  if (requestedBy === myColor) {
    // My request — already handled by button state
  } else {
    const requesterName = requestedBy === 'w' ? 'White' : 'Black';
    rematchDialogText.textContent = `${requesterName} wants a rematch`;
    rematchDialog.classList.remove('hidden');
  }
});

socket.on('game:rematch', () => {
  gameStatus.textContent = 'Rematch! New game started.';
  gameStatus.style.color = '#4ecca3';
  rematchPending = false;
  btnRematch.textContent = 'Request Rematch';
  btnRematch.disabled = false;
  rematchDialog.classList.add('hidden');
  hideGameOverBanner();
});

socket.on('game:rematch_declined', () => {
  gameStatus.textContent = 'Rematch declined.';
  gameStatus.style.color = '#e94560';
  rematchPending = false;
  btnRematch.textContent = 'Request Rematch';
  btnRematch.disabled = false;
  setTimeout(() => updateUI(gameState), 2000);
});

socket.on('game:error', ({ message }) => {
  if (lobby.classList.contains('hidden')) {
    gameStatus.textContent = message;
    gameStatus.style.color = '#e94560';
    setTimeout(() => updateUI(gameState), 2000);
  } else {
    lobbyMessage.textContent = message;
  }
});

socket.on('game:resigned', ({ winner }) => {
  const winnerName = winner === 'w' ? 'White' : 'Black';
  const loserName = winner === 'w' ? 'Black' : 'White';
  gameStatus.textContent = `${winnerName} wins by resignation!`;
  gameStatus.style.color = '#e94560';
  showGameOverBanner('🏳️', `${winnerName} Wins!`, `${loserName} resigned`, winner);
});

socket.on('game:opponent_left', ({ color }) => {
  const side = color === 'w' ? 'White' : 'Black';
  gameStatus.textContent = `${side} player disconnected.`;
  gameStatus.style.color = '#e94560';
});

socket.on('chat:message', ({ sender, text, color, timestamp }) => {
  const msgEl = document.createElement('div');
  msgEl.className = `chat-msg ${color}`;
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  msgEl.innerHTML = `<span class="chat-sender">${sender}</span>${text} <span style="color:var(--text-muted);font-size:0.75rem">${time}</span>`;
  chatMessages.appendChild(msgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

// --- UI helpers ---
function showGameScreen(id, color) {
  lobby.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  gameCodeDisplay.textContent = `Game: ${id}`;
  const colorName = color === 'w' ? 'White' : color === 'b' ? 'Black' : 'Spectator';
  gameStatus.textContent = `You are ${colorName}. ${color === 'w' ? 'Waiting for opponent...' : ''}`;
}

function updateUI(state) {
  if (!state) return;

  const turnName = state.turn === 'w' ? 'White' : 'Black';
  if (state.turn === myColor) {
    turnIndicator.textContent = `Your turn (${turnName})`;
    turnIndicator.className = 'turn-indicator your-turn';
  } else {
    turnIndicator.textContent = `${turnName}'s turn`;
    turnIndicator.className = 'turn-indicator';
  }

  const topColor = myColor === 'w' ? 'b' : myColor === 'b' ? 'w' : 'b';
  const bottomColor = myColor === 'w' ? 'w' : myColor === 'b' ? 'b' : 'w';

  playerTop.classList.toggle('active', state.turn === topColor);
  playerBottom.classList.toggle('active', state.turn === bottomColor);

  if (state.isCheckmate) {
    const winner = state.turn === 'w' ? 'Black' : 'White';
    gameStatus.textContent = `Checkmate! ${winner} wins!`;
    gameStatus.style.color = '#e94560';
  } else if (state.isStalemate) {
    gameStatus.textContent = 'Stalemate! Draw.';
    gameStatus.style.color = '#fdcb6e';
  } else if (state.isDraw) {
    gameStatus.textContent = 'Draw!';
    gameStatus.style.color = '#fdcb6e';
  } else if (state.isCheck) {
    gameStatus.textContent = `Check! ${turnName} must respond.`;
    gameStatus.style.color = '#e94560';
  } else if (state.players.white && state.players.black) {
    gameStatus.textContent = `Game in progress — ${turnName} to move`;
    gameStatus.style.color = '#eaeaea';
  } else {
    gameStatus.textContent = 'Waiting for opponent...';
    gameStatus.style.color = '#8892b0';
  }

  renderMoveHistory(state.history);
}

function renderMoveHistory(history) {
  moveHistory.innerHTML = '';
  if (!history) return;
  for (let i = 0; i < history.length; i += 2) {
    const row = document.createElement('div');
    row.className = 'move-row';
    const num = document.createElement('span');
    num.className = 'move-num';
    num.textContent = `${i / 2 + 1}.`;
    const w = document.createElement('span');
    w.className = 'move-white';
    w.textContent = history[i] ? history[i].san : '';
    const b = document.createElement('span');
    b.className = 'move-black';
    b.textContent = history[i + 1] ? history[i + 1].san : '';
    row.appendChild(num);
    row.appendChild(w);
    row.appendChild(b);
    moveHistory.appendChild(row);
  }
  moveHistory.scrollTop = moveHistory.scrollHeight;
}

function getKingSquare(fen, color) {
  const board = fen.split(' ')[0].split('/');
  const kingChar = color === 'w' ? 'K' : 'k';
  for (let row = 0; row < 8; row++) {
    let col = 0;
    for (const ch of board[row]) {
      if (ch === kingChar) {
        return FILES[col] + RANKS[row];
      }
      if (isNaN(ch)) {
        col++;
      } else {
        col += parseInt(ch);
      }
    }
  }
  return null;
}

// Initialize board with starting position
board.update('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
