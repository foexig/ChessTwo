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
let rematchPending = false; // true = I requested, waiting for opponent
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
const playerWhite = document.getElementById('playerWhite');
const playerBlack = document.getElementById('playerBlack');
const clockWhite = document.getElementById('clockWhite');
const clockBlack = document.getElementById('clockBlack');
const rematchDialog = document.getElementById('rematchDialog');
const rematchDialogText = document.getElementById('rematchDialogText');
const btnRematch = document.getElementById('btnRematch');

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
    clockWhite.classList.add('hidden');
    clockBlack.classList.add('hidden');
    return;
  }

  clockWhite.classList.remove('hidden');
  clockBlack.classList.remove('hidden');

  localClocks = clocks || localClocks;
  clockWhite.textContent = formatTime(localClocks.w);
  clockBlack.textContent = formatTime(localClocks.b);

  // Highlight active clock
  clockWhite.classList.toggle('active', turn === 'w');
  clockBlack.classList.toggle('active', turn === 'b');

  // Low time warning
  clockWhite.classList.toggle('low-time', localClocks.w < 20);
  clockBlack.classList.toggle('low-time', localClocks.b < 20);
}

// --- Socket events ---
socket.on('game:created', ({ gameId: id, color }) => {
  gameId = id;
  myColor = color;
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

  // Update clocks
  if (state.clocks) {
    localClocks = state.clocks;
    updateClockDisplay(state.clocks, state.turn);
  }
});

socket.on('clock:tick', ({ clocks, turn }) => {
  localClocks = clocks;
  updateClockDisplay(clocks, turn);
});

socket.on('game:timeout', ({ winner }) => {
  const winnerName = winner === 'w' ? 'White' : 'Black';
  gameStatus.textContent = `${winnerName} wins on time!`;
  gameStatus.style.color = '#e94560';
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
  gameStatus.textContent = `${winnerName} wins by resignation!`;
  gameStatus.style.color = '#e94560';
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

  playerWhite.classList.toggle('active', state.turn === 'w');
  playerBlack.classList.toggle('active', state.turn === 'b');

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
