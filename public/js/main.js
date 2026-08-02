// main.js — Client-side game logic, Socket.io, UI, Perks, Sound, Profile

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
let myPerks = [];
let oppPerks = [];
let activePerk = null;
let perkFromSquare = null;
let perkTargets = [];
let playerProfile = { name: '', avatar: '' };

// --- DOM ---
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
const playerTop = document.getElementById('playerTop');
const playerBottom = document.getElementById('playerBottom');
const clockTop = document.getElementById('clockTop');
const clockBottom = document.getElementById('clockBottom');
const avatarTop = document.getElementById('avatarTop');
const avatarBottom = document.getElementById('avatarBottom');
const gameOverBanner = document.getElementById('gameOverBanner');
const gameOverIcon = document.getElementById('gameOverIcon');
const gameOverTitle = document.getElementById('gameOverTitle');
const gameOverReason = document.getElementById('gameOverReason');
const btnBannerRematch = document.getElementById('btnBannerRematch');
const btnBannerLeave = document.getElementById('btnBannerLeave');
const codeModal = document.getElementById('codeModal');
const codeDisplayBig = document.getElementById('codeDisplayBig');
const serverIpHint = document.getElementById('serverIpHint');
const myPerksEl = document.getElementById('myPerks');
const oppPerksEl = document.getElementById('oppPerks');
const perkModeBanner = document.getElementById('perkModeBanner');
const perkModeText = document.getElementById('perkModeText');
const resurrectDialog = document.getElementById('resurrectDialog');
const resurrectOptions = document.getElementById('resurrectOptions');
const btnSound = document.getElementById('btnSound');
const playerNameInput = document.getElementById('playerNameInput');
const avatarInput = document.getElementById('avatarInput');
const avatarPreview = document.getElementById('avatarPreview');

// --- Sound toggle ---
btnSound.addEventListener('click', () => {
  const enabled = !SoundFX.isEnabled();
  SoundFX.setEnabled(enabled);
  btnSound.textContent = enabled ? '🔊' : '🔇';
  if (enabled) SoundFX.play('notify');
});

// Preload sounds on first interaction
document.addEventListener('click', () => { SoundFX.preload(); }, { once: true });

// --- Avatar upload ---
avatarInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 500 * 1024) {
    lobbyMessage.textContent = 'Image too large (max 500KB)';
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    playerProfile.avatar = ev.target.result;
    avatarPreview.innerHTML = `<img src="${ev.target.result}" alt="">`;
  };
  reader.readAsDataURL(file);
});

// --- Get profile from inputs ---
function getProfile() {
  const name = playerNameInput.value.trim() || 'Anonymous';
  playerProfile.name = name;
  return playerProfile;
}

// --- Board init ---
board = new ChessBoard('chessboard', {
  onMove: (from, to, isPromotion) => {
    if (isPromotion) {
      pendingPromotion = { from, to };
      promotionDialog.classList.remove('hidden');
    } else {
      socket.emit('game:move', { from, to });
    }
  },
  onSquareClick: (sqName) => { handleSquareClick(sqName); }
});

// --- Time control ---
document.querySelectorAll('.tc-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tc-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedTimeControl = btn.dataset.tc;
  });
});

// --- Setup player bars with name + avatar ---
function setupPlayerBars(color, profiles) {
  const myProfile = profiles && profiles[color] ? profiles[color] : { name: color === 'w' ? 'White' : 'Black', avatar: '' };
  const oppColor = color === 'w' ? 'b' : 'w';
  const oppProfile = profiles && profiles[oppColor] ? profiles[oppColor] : { name: oppColor === 'w' ? 'White' : 'Black', avatar: '' };

  // Bottom = me, Top = opponent
  if (color === 'w' || color === 'b') {
    playerBottom.textContent = `${myProfile.name} (${color === 'w' ? 'White' : 'Black'})`;
    playerTop.textContent = `${oppProfile.name}`;
    setAvatar(avatarBottom, myProfile.avatar);
    setAvatar(avatarTop, oppProfile.avatar);
  } else {
    playerBottom.textContent = 'White';
    playerTop.textContent = 'Black';
  }
}

function setAvatar(imgEl, avatarData) {
  if (avatarData) {
    imgEl.src = avatarData;
    imgEl.style.display = '';
  } else {
    imgEl.src = '/img/pieces/wK.svg';
  }
}

// --- Game over banner ---
function showGameOverBanner(icon, title, reason, winnerColor) {
  gameOverIcon.textContent = icon;
  gameOverTitle.textContent = title;
  gameOverReason.textContent = reason;
  gameOverTitle.classList.remove('win', 'loss', 'draw');
  if (!winnerColor) {
    gameOverTitle.classList.add('draw');
    SoundFX.play('game-draw');
  } else if (winnerColor === myColor) {
    gameOverTitle.classList.add('win');
    SoundFX.play('game-win-long');
  } else {
    gameOverTitle.classList.add('loss');
    SoundFX.play('game-lose-long');
  }
  gameOverBanner.classList.remove('hidden');
}
function hideGameOverBanner() { gameOverBanner.classList.add('hidden'); }

// --- Sound for moves ---
function playMoveSound(move, state) {
  const isMyMove = move.color !== myColor; // move.color is the color that moved; if not mine, opponent moved
  // Actually chess.js move.color is the color of the player who moved
  // If it's not my turn now, the opponent just moved (or I just moved)
  // Let's use a simpler approach: if the move was made by my color, play move-self, else move-opponent
  const moverColor = move.color;
  const isSelf = moverColor === myColor;

  if (state.isCheckmate) {
    SoundFX.play('game-end');
  } else if (state.isCheck) {
    SoundFX.play(isSelf ? 'move-self-check' : 'move-opponent-check');
  } else if (move.flags && move.flags.includes('c')) {
    SoundFX.play('capture');
  } else if (move.flags && (move.flags.includes('k') || move.flags.includes('q'))) {
    SoundFX.play('castle');
  } else if (move.promotion) {
    SoundFX.play('promote');
  } else {
    SoundFX.play(isSelf ? 'move-self' : 'move-opponent');
  }
}

// --- Perks ---
function renderPerks() {
  myPerksEl.innerHTML = '';
  for (const perk of myPerks) {
    const def = PERK_MAP[perk.id];
    if (!def) continue;
    const card = document.createElement('div');
    card.className = `perk-card ${perk.used ? 'used' : ''}`;
    card.innerHTML = `
      <div class="perk-icon" style="color: ${def.color}">${def.icon}</div>
      <div class="perk-info">
        <div class="perk-name">${def.name}</div>
        <div class="perk-desc">${def.shortDesc}</div>
      </div>
      ${!perk.used && myColor !== 's' ? `<button class="btn btn-small perk-activate-btn" data-perk-id="${perk.id}">Activate</button>` : ''}
      ${perk.used ? '<span class="perk-used-tag">Used</span>' : ''}
    `;
    const btn = card.querySelector('.perk-activate-btn');
    if (btn) {
      btn.addEventListener('click', (e) => { e.stopPropagation(); activatePerk(perk.id); });
    }
    myPerksEl.appendChild(card);
  }

  oppPerksEl.innerHTML = '';
  for (const perk of oppPerks) {
    const def = PERK_MAP[perk.id];
    if (!def) continue;
    const card = document.createElement('div');
    card.className = `perk-card-mini ${perk.used ? 'used' : ''}`;
    card.innerHTML = `
      <span class="perk-mini-icon" style="color: ${def.color}">${def.icon}</span>
      <span class="perk-mini-name">${def.name}</span>
      ${perk.used ? '<span class="perk-mini-used">✓</span>' : ''}
    `;
    oppPerksEl.appendChild(card);
  }
}

function activatePerk(perkId) {
  const perk = myPerks.find(p => p.id === perkId);
  if (!perk || perk.used) return;
  if (!gameState || gameState.isGameOver) return;
  if (gameState.turn !== myColor) return;

  SoundFX.play('notify');
  const def = PERK_MAP[perkId];

  if (perkId === 'double-move') {
    socket.emit('perk:activate', { perkId });
    return;
  }

  if (perkId === 'resurrect') {
    const captured = getResurrectOptions(clientChess, myColor);
    if (captured.length === 0) {
      gameStatus.textContent = 'No captured pieces to resurrect!';
      gameStatus.style.color = '#e94560';
      setTimeout(() => updateUI(gameState), 2000);
      return;
    }
    const unique = [...new Set(captured)];
    resurrectOptions.innerHTML = '';
    for (const type of unique) {
      const colorPrefix = myColor === 'w' ? 'w' : 'b';
      const btn = document.createElement('button');
      btn.className = 'promotion-btn';
      btn.innerHTML = `<img src="/img/pieces/${colorPrefix}${type.toUpperCase()}.svg" alt="${type}">`;
      btn.addEventListener('click', () => {
        resurrectDialog.classList.add('hidden');
        socket.emit('perk:activate', { perkId, pieceType: type });
      });
      resurrectOptions.appendChild(btn);
    }
    resurrectDialog.classList.remove('hidden');
    return;
  }

  activePerk = perkId;
  perkFromSquare = null;
  perkTargets = [];
  perkModeText.textContent = `${def.icon} ${def.name} — Click your ${def.targetPiece === 'r' ? 'Rook' : def.targetPiece === 'k' ? 'King' : def.targetPiece === 'q' ? 'Queen' : def.targetPiece === 'p' ? 'Pawn' : def.targetPiece === 'b' ? 'Bishop' : def.targetPiece === 'n' ? 'Knight' : 'piece'}`;
  perkModeBanner.classList.remove('hidden');
  board.clearSelection();
  selectedSquare = null;
}

function cancelPerkMode() {
  activePerk = null;
  perkFromSquare = null;
  perkTargets = [];
  perkModeBanner.classList.add('hidden');
  board.clearSelection();
}
document.getElementById('btnCancelPerk').addEventListener('click', cancelPerkMode);

// --- Click handler ---
function handleSquareClick(sqName) {
  if (activePerk) { handlePerkClick(sqName); return; }
  if (!gameState || gameState.isGameOver) return;
  if (gameState.turn !== myColor) return;
  const piece = board.getPieceAt(sqName);
  if (selectedSquare) {
    if (sqName === selectedSquare) { board.clearSelection(); selectedSquare = null; return; }
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
    } else if (piece && piece[0] === myColor) { selectPiece(sqName); }
    else { board.clearSelection(); selectedSquare = null; }
  } else {
    if (piece && piece[0] === myColor) { selectPiece(sqName); }
  }
}

function handlePerkClick(sqName) {
  const def = PERK_MAP[activePerk];
  if (!def) return;
  if (!perkFromSquare) {
    const piece = board.getPieceAt(sqName);
    if (!piece || piece[0] !== myColor) return;
    if (def.targetPiece && piece[1].toLowerCase() !== def.targetPiece) {
      gameStatus.textContent = `Select your ${def.targetPiece === 'r' ? 'Rook' : def.targetPiece === 'k' ? 'King' : def.targetPiece === 'q' ? 'Queen' : def.targetPiece === 'p' ? 'Pawn' : def.targetPiece === 'b' ? 'Bishop' : def.targetPiece === 'n' ? 'Knight' : 'piece'}!`;
      gameStatus.style.color = '#e94560';
      SoundFX.play('illegal');
      setTimeout(() => updateUI(gameState), 1500);
      return;
    }
    perkFromSquare = sqName;
    board.selectSquare(sqName);
    SoundFX.play('notify');
    if (clientChess) {
      perkTargets = getPerkTargets(activePerk, sqName, clientChess, myColor);
      board.setLegalMoves(perkTargets.map(t => ({ to: t })));
    }
    if (perkTargets.length === 0) {
      gameStatus.textContent = 'No valid targets for this piece. Try another or cancel.';
      gameStatus.style.color = '#e94560';
    }
    return;
  }
  if (sqName === perkFromSquare) { perkFromSquare = null; perkTargets = []; board.clearSelection(); return; }
  if (perkTargets.includes(sqName)) {
    socket.emit('perk:activate', { perkId: activePerk, from: perkFromSquare, to: sqName });
    cancelPerkMode();
  } else {
    const piece = board.getPieceAt(sqName);
    if (piece && piece[0] === myColor) {
      if (!def.targetPiece || piece[1].toLowerCase() === def.targetPiece) {
        perkFromSquare = sqName;
        board.selectSquare(sqName);
        SoundFX.play('notify');
        if (clientChess) {
          perkTargets = getPerkTargets(activePerk, sqName, clientChess, myColor);
          board.setLegalMoves(perkTargets.map(t => ({ to: t })));
        }
      }
    }
  }
}

function selectPiece(sqName) {
  selectedSquare = sqName;
  board.selectSquare(sqName);
  SoundFX.play('notify');
  if (clientChess) {
    try {
      const moves = clientChess.moves({ square: sqName, verbose: true });
      board.setLegalMoves(moves);
    } catch (e) { board.setLegalMoves([]); }
  }
}

// --- Promotion ---
document.querySelectorAll('.promotion-btn').forEach(btn => {
  if (btn.dataset.piece) {
    btn.addEventListener('click', () => {
      if (pendingPromotion) {
        socket.emit('game:move', { from: pendingPromotion.from, to: pendingPromotion.to, promotion: btn.dataset.piece });
        pendingPromotion = null;
      }
      promotionDialog.classList.add('hidden');
      board.clearSelection();
      selectedSquare = null;
    });
  }
});

// --- Lobby ---
document.getElementById('btnCreate').addEventListener('click', () => {
  const profile = getProfile();
  socket.emit('game:create', { timeControl: selectedTimeControl, name: profile.name, avatar: profile.avatar });
});
document.getElementById('btnJoin').addEventListener('click', () => {
  const profile = getProfile();
  const code = document.getElementById('gameIdInput').value.trim().toUpperCase();
  if (code) socket.emit('game:join', { gameId: code, name: profile.name, avatar: profile.avatar });
});
document.getElementById('gameIdInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('btnJoin').click();
});

// --- Game actions ---
document.getElementById('btnResign').addEventListener('click', () => { if (confirm('Resign?')) socket.emit('game:resign'); });
document.getElementById('btnRematch').addEventListener('click', () => {
  if (!rematchPending) {
    socket.emit('game:rematch_request');
    btnRematch.textContent = 'Rematch Requested...';
    btnRematch.disabled = true;
    rematchPending = true;
  }
});
document.getElementById('btnLeave').addEventListener('click', () => { if (confirm('Leave?')) window.location.reload(); });
btnBannerRematch.addEventListener('click', () => {
  hideGameOverBanner();
  if (!rematchPending) {
    socket.emit('game:rematch_request');
    btnRematch.textContent = 'Rematch Requested...';
    btnRematch.disabled = true;
    rematchPending = true;
  }
});
btnBannerLeave.addEventListener('click', () => window.location.reload());
document.getElementById('btnAcceptRematch').addEventListener('click', () => { socket.emit('game:rematch_accept'); rematchDialog.classList.add('hidden'); });
document.getElementById('btnDeclineRematch').addEventListener('click', () => { socket.emit('game:rematch_decline'); rematchDialog.classList.add('hidden'); });

// --- Code modal ---
document.getElementById('btnCopyCode').addEventListener('click', () => {
  const code = codeDisplayBig.textContent;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById('btnCopyCode');
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    });
  }
});
document.getElementById('btnCloseModal').addEventListener('click', () => { codeModal.classList.add('hidden'); });

// --- Chat ---
document.getElementById('btnChatSend').addEventListener('click', sendChat);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat(); });
function sendChat() {
  const text = chatInput.value.trim();
  if (text) { socket.emit('chat:message', { text }); chatInput.value = ''; }
}

// --- Clock ---
function formatTime(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
function updateClockDisplay(clocks, turn) {
  if (!gameState || !gameState.timeControl || gameState.timeControl.initial === 0) {
    clockTop.classList.add('hidden'); clockBottom.classList.add('hidden'); return;
  }
  clockTop.classList.remove('hidden'); clockBottom.classList.remove('hidden');
  localClocks = clocks || localClocks;
  let topClockVal, bottomClockVal, topColor, bottomColor;
  if (myColor === 'w') { topColor = 'b'; bottomColor = 'w'; topClockVal = localClocks.b; bottomClockVal = localClocks.w; }
  else if (myColor === 'b') { topColor = 'w'; bottomColor = 'b'; topClockVal = localClocks.w; bottomClockVal = localClocks.b; }
  else { topColor = 'b'; bottomColor = 'w'; topClockVal = localClocks.b; bottomClockVal = localClocks.w; }
  clockTop.textContent = formatTime(topClockVal);
  clockBottom.textContent = formatTime(bottomClockVal);
  clockTop.classList.toggle('active', turn === topColor);
  clockBottom.classList.toggle('active', turn === bottomColor);
  const wasLow = clockTop.classList.contains('low-time');
  clockTop.classList.toggle('low-time', topClockVal < 20);
  clockBottom.classList.toggle('low-time', bottomClockVal < 20);
  // Play tenseconds sound when crossing below 10
  if (topClockVal < 10 && topClockVal > 0 && turn === topColor && !wasLow) SoundFX.play('tenseconds');
  if (bottomClockVal < 10 && bottomClockVal > 0 && turn === bottomColor && !clockBottom.classList.contains('low-time-was')) {
    clockBottom.classList.add('low-time-was');
    SoundFX.play('tenseconds');
  }
  if (bottomClockVal >= 10) clockBottom.classList.remove('low-time-was');
}

// --- Socket events ---
socket.on('game:created', ({ gameId: id, color }) => {
  gameId = id; myColor = color;
  showGameScreen(id, color);
  board.setMyColor(color);
  board.setFlipped(color === 'b');
  codeDisplayBig.textContent = id;
  serverIpHint.textContent = window.location.host;
  codeModal.classList.remove('hidden');
});

socket.on('game:joined', ({ gameId: id, color }) => {
  gameId = id; myColor = color;
  showGameScreen(id, color);
  board.setMyColor(color);
  board.setFlipped(color === 'b');
});

socket.on('game:opponent_joined', () => {
  gameStatus.textContent = 'Opponent joined! Game on.';
  gameStatus.style.color = '#4ecca3';
  codeModal.classList.add('hidden');
  SoundFX.play('game-start');
});

socket.on('game:move', (move) => {
  if (gameState) playMoveSound(move, gameState);
});

socket.on('game:state', (state) => {
  gameState = state;
  if (window.ChessJS && ChessJS.Chess) {
    try { clientChess = new ChessJS.Chess(state.fen); } catch (e) { clientChess = null; }
  }
  if (state.perks) {
    myPerks = state.perks[myColor] || [];
    const oppColor = myColor === 'w' ? 'b' : myColor === 'b' ? 'w' : 'w';
    oppPerks = state.perks[oppColor] || [];
    renderPerks();
  }
  // Update player bars with profiles
  if (state.profiles) {
    setupPlayerBars(myColor, state.profiles);
  }
  updateUI(state);
  board.update(state.fen, {
    lastMove: state.history && state.history.length > 0 ? state.history[state.history.length - 1] : null,
    checkSquare: state.isCheck ? getKingSquare(state.fen, state.turn) : null
  });
  if (state.clocks) { localClocks = state.clocks; updateClockDisplay(state.clocks, state.turn); }
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

socket.on('clock:tick', ({ clocks, turn }) => { localClocks = clocks; updateClockDisplay(clocks, turn); });

socket.on('game:timeout', ({ winner }) => {
  const winnerName = winner === 'w' ? 'White' : 'Black';
  const loserName = winner === 'w' ? 'Black' : 'White';
  gameStatus.textContent = `${winnerName} wins on time!`;
  gameStatus.style.color = '#e94560';
  showGameOverBanner('⏱️', `${winnerName} Wins!`, `${loserName} ran out of time`, winner);
});

socket.on('perk:used', ({ perkId, player }) => {
  const def = PERK_MAP[perkId];
  if (!def) return;
  SoundFX.play('capture');
  const playerName = player === 'w' ? 'White' : 'Black';
  if (player === myColor) {
    gameStatus.textContent = `You used ${def.icon} ${def.name}!`;
    gameStatus.style.color = '#4ecca3';
  } else {
    gameStatus.textContent = `${playerName} used ${def.icon} ${def.name}!`;
    gameStatus.style.color = '#e94560';
  }
});

socket.on('perk:double_move_first', ({ color }) => {
  if (color === myColor) {
    gameStatus.textContent = 'Double Move! Make another move.';
    gameStatus.style.color = '#00cec9';
    SoundFX.play('notify');
  }
});

socket.on('game:rematch_request', ({ requestedBy }) => {
  if (requestedBy !== myColor) {
    const requesterName = requestedBy === 'w' ? 'White' : 'Black';
    rematchDialogText.textContent = `${requesterName} wants a rematch`;
    rematchDialog.classList.remove('hidden');
    SoundFX.play('notify');
  }
});

socket.on('game:rematch', () => {
  gameStatus.textContent = 'Rematch! New perks rolled!';
  gameStatus.style.color = '#4ecca3';
  rematchPending = false;
  btnRematch.textContent = 'Request Rematch';
  btnRematch.disabled = false;
  rematchDialog.classList.add('hidden');
  hideGameOverBanner();
  cancelPerkMode();
  SoundFX.play('game-start');
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
    SoundFX.play('illegal');
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
  } else if (state.players && state.players.white && state.players.black) {
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
      if (ch === kingChar) return FILES[col] + RANKS[row];
      if (isNaN(ch)) col++; else col += parseInt(ch);
    }
  }
  return null;
}

board.update('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
