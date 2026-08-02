// main.js — Client-side game logic, Socket.io, UI, Draft, Perks, Sound, Profile

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
let lowTimeWarned = false;  // play low-time sound only once at 10s
let activePerk = null;
let perkFromSquare = null;
let perkTargets = [];
let playerProfile = { name: '', avatar: '' };

// --- Draft state ---
let draftPhase = 'none'; // 'none', 'character', 'cards', 'waiting'
let selectedCharacter = null;
let draftCards = [];
let draftedPerks = [];
let draftPicksMax = 3;
let rerollsLeft = 0;
let characterChosen = false;

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

// --- Draft DOM ---
const draftOverlay = document.getElementById('draftOverlay');
const charSelectPhase = document.getElementById('charSelectPhase');
const cardDraftPhase = document.getElementById('cardDraftPhase');
const draftWaitingPhase = document.getElementById('draftWaitingPhase');
const charGrid = document.getElementById('charGrid');
const charDescription = document.getElementById('charDescription');
const btnConfirmChar = document.getElementById('btnConfirmChar');
const cardGrid = document.getElementById('cardGrid');
const draftedCardsEl = document.getElementById('draftedCards');
const picksRemainingEl = document.getElementById('picksRemaining');
const btnReroll = document.getElementById('btnReroll');
const btnConfirmDraft = document.getElementById('btnConfirmDraft');

// --- Sound toggle ---
btnSound.addEventListener('click', () => {
  const enabled = !SoundFX.isEnabled();
  SoundFX.setEnabled(enabled);
  btnSound.textContent = enabled ? '🔊' : '🔇';
  if (enabled) SoundFX.play('notify');
});

// Preload sounds on first interaction
document.addEventListener('click', () => { SoundFX.preload(); }, { once: true });

// --- Avatar: uses character icon from draft, no upload needed ---
function emojiToDataUrl(emoji, bgColor = '#1a1f35') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="8" fill="${bgColor}"/><text y="46" font-size="36" text-anchor="middle" x="32">${emoji}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

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

// ==================== DRAFT SYSTEM ====================

function renderCharGrid() {
  charGrid.innerHTML = '';
  CHARACTERS.forEach(char => {
    const card = document.createElement('div');
    card.className = 'char-card';
    card.style.setProperty('--char-color', char.color);
    card.innerHTML = `
      <div class="char-icon">${char.icon}</div>
      <div class="char-name">${char.name}</div>
    `;
    card.addEventListener('click', () => {
      document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedCharacter = char;
      charDescription.innerHTML = `<strong style="color:${char.color}">${char.name}</strong> — ${char.description}`;
      btnConfirmChar.disabled = false;
      SoundFX.play('notify');
    });
    charGrid.appendChild(card);
  });
}

btnConfirmChar.addEventListener('click', () => {
  if (!selectedCharacter) return;
  characterChosen = true;
  SoundFX.play('game-start');

  // Determine draft parameters based on character
  const cardCount = selectedCharacter.ability === 'extra_cards' ? 7 : 6;
  draftPicksMax = selectedCharacter.ability === 'extra_picks' ? 4 : 3;
  rerollsLeft = selectedCharacter.ability === 'rerolls' ? selectedCharacter.value : 1;

  // Set character icon as avatar
  playerProfile.avatar = selectedCharacter.icon;

  // Generate cards
  draftCards = rollDraftCards(cardCount, selectedCharacter);
  draftedPerks = [];

  // Switch to card draft phase
  charSelectPhase.classList.add('hidden');
  cardDraftPhase.classList.remove('hidden');
  draftPhase = 'cards';
  renderCardGrid();
  updateDraftUI();
});

function renderCardGrid() {
  cardGrid.innerHTML = '';
  draftCards.forEach((card, idx) => {
    const perk = PERK_MAP[card.perkId];
    if (!perk) return;
    const rarity = RARITIES[card.rarity];
    const isDrafted = draftedPerks.some(d => d.cardIndex === idx);

    const cardEl = document.createElement('div');
    cardEl.className = `draft-card ${isDrafted ? 'drafted' : ''}`;
    cardEl.style.setProperty('--rarity-color', rarity.color);
    cardEl.style.setProperty('--rarity-glow', rarity.glow);

    const pieceImg = perkPieceImg(card.perkId, myColor);
    const pieceHTML = pieceImg ? `<img src="${pieceImg}" class="draft-card-piece" alt="">` : '';

    cardEl.innerHTML = `
      <div class="draft-card-rarity" style="color:${rarity.color}">${rarity.name}</div>
      ${pieceHTML}
      <div class="draft-card-name">${perk.name}</div>
      <div class="draft-card-desc">${perk.shortDesc}</div>
      <div class="draft-card-uses" style="color:${rarity.color}">${rarity.uses} use${rarity.uses > 1 ? 's' : ''}</div>
    `;

    if (isDrafted) {
      cardEl.title = 'Click to put back';
      cardEl.addEventListener('click', () => {
        draftedPerks = draftedPerks.filter(d => d.cardIndex !== idx);
        SoundFX.play('notify');
        renderCardGrid();
        updateDraftUI();
      });
    } else if (draftedPerks.length < draftPicksMax) {
      cardEl.addEventListener('click', () => {
        draftedPerks.push({ ...card, cardIndex: idx });
        SoundFX.play('capture');
        renderCardGrid();
        updateDraftUI();
      });
    }

    cardGrid.appendChild(cardEl);
  });
}

function updateDraftUI() {
  const remaining = draftPicksMax - draftedPerks.length;
  picksRemainingEl.textContent = `Picks: ${remaining}`;
  btnReroll.textContent = `Reroll (${rerollsLeft})`;
  btnReroll.disabled = rerollsLeft <= 0;
  btnConfirmDraft.disabled = draftedPerks.length !== draftPicksMax;

  // Render drafted summary
  draftedCardsEl.innerHTML = '';
  for (let i = 0; i < draftPicksMax; i++) {
    const slot = document.createElement('div');
    const perk = draftedPerks[i];
    if (perk) {
      const def = PERK_MAP[perk.perkId];
      const rarity = RARITIES[perk.rarity];
      slot.className = 'drafted-slot';
      slot.innerHTML = `<span style="color:${rarity.color}">${def.icon}</span> ${def.name}`;
    } else {
      slot.className = 'drafted-slot empty';
      slot.textContent = 'Empty slot';
    }
    draftedCardsEl.appendChild(slot);
  }
}

btnReroll.addEventListener('click', () => {
  if (rerollsLeft <= 0) return;
  rerollsLeft--;
  // Clear drafted picks and reroll
  draftedPerks = [];
  const cardCount = selectedCharacter.ability === 'extra_cards' ? 7 : 6;
  draftCards = rollDraftCards(cardCount, selectedCharacter);
  SoundFX.play('notify');
  renderCardGrid();
  updateDraftUI();
});

btnConfirmDraft.addEventListener('click', () => {
  if (draftedPerks.length !== draftPicksMax) return;
  SoundFX.play('game-start');

  // Apply character bonuses and send to server
  const perksData = applyCharacterBonuses(draftedPerks, selectedCharacter);
  socket.emit('draft:complete', {
    characterId: selectedCharacter.id,
    perks: perksData,
    avatar: selectedCharacter.icon
  });

  // Show waiting phase
  cardDraftPhase.classList.add('hidden');
  draftWaitingPhase.classList.remove('hidden');
  draftPhase = 'waiting';
});

// ==================== GAME UI ====================

// --- Setup player bars with name + avatar ---
function setupPlayerBars(color, profiles) {
  const myProfile = profiles && profiles[color] ? profiles[color] : { name: color === 'w' ? 'White' : 'Black', avatar: '' };
  const oppColor = color === 'w' ? 'b' : 'w';
  const oppProfile = profiles && profiles[oppColor] ? profiles[oppColor] : { name: oppColor === 'w' ? 'White' : 'Black', avatar: '' };

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
  if (avatarData && avatarData.startsWith('data:')) {
    imgEl.src = avatarData;
    imgEl.style.display = '';
  } else if (avatarData) {
    // Emoji avatar from character
    imgEl.src = emojiToDataUrl(avatarData);
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
    const isUsedUp = (perk.uses || 0) <= 0;
    const rarity = perk.rarity ? RARITIES[perk.rarity] : null;
    const rarityColor = rarity ? rarity.color : def.color;
    const rarityName = rarity ? rarity.name : '';
    const rarityGlow = rarity ? rarity.glow : 'none';
    const canActivate = !isUsedUp && myColor !== 's' && gameState && !gameState.isGameOver && gameState.turn === myColor;

    const pieceImg = perkPieceImg(perk.id, myColor);
    const pieceHTML = pieceImg ? `<img src="${pieceImg}" class="perk-card-piece" alt="">` : '';

    const card = document.createElement('div');
    card.className = `perk-game-card ${isUsedUp ? 'used' : ''} ${canActivate ? 'clickable' : ''}`;
    card.style.setProperty('--rarity-color', rarityColor);
    card.style.setProperty('--rarity-glow', rarityGlow);
    card.innerHTML = `
      <div class="perk-card-rarity" style="color:${rarityColor}">${rarityName}</div>
      ${pieceHTML}
      <div class="perk-card-title">${def.name}</div>
      <div class="perk-card-desc">${def.shortDesc}</div>
      <div class="perk-card-uses" style="color:${rarityColor}">${isUsedUp ? 'Used up' : perk.uses + ' use' + (perk.uses > 1 ? 's' : '') + ' left'}</div>
    `;

    if (canActivate) {
      card.addEventListener('click', () => activatePerk(perk.id));
    }

    myPerksEl.appendChild(card);
  }

  oppPerksEl.innerHTML = '';
  for (const perk of oppPerks) {
    const def = PERK_MAP[perk.id];
    if (!def) continue;
    const isUsedUp = (perk.uses || 0) <= 0;
    const rarity = perk.rarity ? RARITIES[perk.rarity] : null;
    const rarityColor = rarity ? rarity.color : def.color;
    const rarityName = rarity ? rarity.name : '';
    const rarityGlow = rarity ? rarity.glow : 'none';

    const pieceImg = perkPieceImg(perk.id, myColor === 'w' ? 'b' : 'w');
    const pieceHTML = pieceImg ? `<img src="${pieceImg}" class="perk-card-piece-sm" alt="">` : '';

    const card = document.createElement('div');
    card.className = `perk-game-card-mini ${isUsedUp ? 'used' : ''}`;
    card.style.setProperty('--rarity-color', rarityColor);
    card.style.setProperty('--rarity-glow', rarityGlow);
    card.innerHTML = `
      ${pieceHTML}
      <div class="perk-card-mini-title">${def.name}</div>
      <div class="perk-card-mini-uses" style="color:${rarityColor}">${isUsedUp ? 'Used' : (perk.uses + 'x')}</div>
    `;
    oppPerksEl.appendChild(card);
  }
}

function activatePerk(perkId) {
  const perk = myPerks.find(p => p.id === perkId);
  if (!perk || (perk.uses || 0) <= 0) return;
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
  perkModeText.textContent = `${def.name} — Select your ${def.targetPiece ? def.targetPiece.toUpperCase() : 'piece'}`;
  perkModeBanner.classList.remove('hidden');
  gameStatus.textContent = `${def.name}: Click your ${def.targetPiece ? def.targetPiece.toUpperCase() : 'piece'} to begin.`;
  gameStatus.style.color = def.color;
}

function cancelPerkMode() {
  activePerk = null;
  perkFromSquare = null;
  perkTargets = [];
  perkModeBanner.classList.add('hidden');
  board.clearSelection();
  if (gameState) updateUI(gameState);
}

document.getElementById('btnCancelPerk').addEventListener('click', cancelPerkMode);

// --- Square click handling ---
function handleSquareClick(sqName) {
  if (activePerk) { handlePerkClick(sqName); return; }
  if (!gameState || gameState.isGameOver) return;
  if (gameState.turn !== myColor) return;

  const piece = board.getPieceAt(sqName);

  if (selectedSquare) {
    if (sqName === selectedSquare) {
      board.clearSelection();
      selectedSquare = null;
      return;
    }
    const moves = clientChess ? clientChess.moves({ square: selectedSquare, verbose: true }) : [];
    const validMove = moves.find(m => m.to === sqName);
    if (validMove) {
      if (validMove.promotion) {
        pendingPromotion = { from: selectedSquare, to: sqName };
        promotionDialog.classList.remove('hidden');
      } else {
        socket.emit('game:move', { from: selectedSquare, to: sqName });
      }
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
  clockTop.classList.toggle('low-time', topClockVal < 20);
  clockBottom.classList.toggle('low-time', bottomClockVal < 20);
  const myClockVal = myColor === 'w' ? localClocks.w : localClocks.b;
  if (myClockVal < 10 && myClockVal > 0 && !lowTimeWarned) {
    SoundFX.play('tenseconds');
    lowTimeWarned = true;
  }
  if (myClockVal >= 10) lowTimeWarned = false;  // reset if time goes back up
}

// ==================== SOCKET EVENTS ====================

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
  gameStatus.textContent = 'Opponent joined! Starting draft...';
  gameStatus.style.color = '#4ecca3';
  codeModal.classList.add('hidden');
  SoundFX.play('game-start');
});

// --- Draft events ---
socket.on('draft:start', () => {
  draftOverlay.classList.remove('hidden');
  charSelectPhase.classList.remove('hidden');
  cardDraftPhase.classList.add('hidden');
  draftWaitingPhase.classList.add('hidden');
  draftPhase = 'character';
  selectedCharacter = null;
  draftedPerks = [];
  renderCharGrid();
});

socket.on('draft:complete', () => {
  // Both players finished — hide overlay, game starts
  draftOverlay.classList.add('hidden');
  draftPhase = 'none';
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
  showGameOverBanner('⏰', `${winnerName} Wins!`, `${loserName} ran out of time`, winner);
});

socket.on('perk:activated', ({ perkLog, perks, fen }) => {
  if (gameState && fen) {
    gameState.fen = fen;
    if (window.ChessJS && ChessJS.Chess) {
      try { clientChess = new ChessJS.Chess(fen); } catch (e) { clientChess = null; }
    }
  }
  if (perks) {
    myPerks = perks[myColor] || myPerks;
    const oppColor = myColor === 'w' ? 'b' : 'w';
    oppPerks = perks[oppColor] || oppPerks;
    renderPerks();
  }
  if (perkLog && perkLog.length > 0) {
    const last = perkLog[perkLog.length - 1];
    gameStatus.textContent = `Perk used: ${last.san || 'ability'}`;
    gameStatus.style.color = '#fdcb6e';
    SoundFX.play('notify');
    setTimeout(() => { if (gameState) updateUI(gameState); }, 2000);
  }
  if (gameState) {
    board.update(gameState.fen, {
      lastMove: gameState.history && gameState.history.length > 0 ? gameState.history[gameState.history.length - 1] : null,
      checkSquare: gameState.isCheck ? getKingSquare(gameState.fen, gameState.turn) : null
    });
  }
});

socket.on('game:rematch_requested', () => {
  rematchDialogText.textContent = 'Opponent wants a rematch';
  rematchDialog.classList.remove('hidden');
});

socket.on('game:rematch_declined', () => {
  rematchDialog.classList.add('hidden');
  btnRematch.textContent = 'Request Rematch';
  btnRematch.disabled = false;
  rematchPending = false;
});

socket.on('game:rematch_accepted', () => {
  rematchDialog.classList.add('hidden');
  btnRematch.textContent = 'Request Rematch';
  btnRematch.disabled = false;
  rematchPending = false;
  hideGameOverBanner();
  // Reset draft for rematch
  draftOverlay.classList.remove('hidden');
  charSelectPhase.classList.remove('hidden');
  cardDraftPhase.classList.add('hidden');
  draftWaitingPhase.classList.add('hidden');
  draftPhase = 'character';
  selectedCharacter = null;
  draftedPerks = [];
  renderCharGrid();
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
