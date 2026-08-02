// perks.js — Shared perk definitions for Chess with Perks
// Works in both Node.js (require) and browser (global)

const PERKS = [
  {
    id: 'sniper-rook',
    name: 'Sniper Rook',
    icon: '🔫',
    color: '#e94560',
    description: 'Your Rook captures an enemy piece on its rank or file without moving. Path must be clear.',
    shortDesc: 'Rook captures without moving',
    targetPiece: 'r',
    needsTarget: true,
    uses: 1
  },
  {
    id: 'kings-knight',
    name: "King's Knight",
    icon: '🐎',
    color: '#4ecca3',
    description: 'Your King can make a knight move once.',
    shortDesc: 'King moves like a knight',
    targetPiece: 'k',
    needsTarget: true,
    uses: 1
  },
  {
    id: 'queens-leap',
    name: "Queen's Leap",
    icon: '👑',
    color: '#a29bfe',
    description: 'Your Queen can make a knight move once.',
    shortDesc: 'Queen moves like a knight',
    targetPiece: 'q',
    needsTarget: true,
    uses: 1
  },
  {
    id: 'pawn-blitz',
    name: 'Forward Charge',
    icon: '⚡',
    color: '#fdcb6e',
    description: 'Your pawn captures an enemy piece straight ahead (same file, 1 square forward).',
    shortDesc: 'Pawn captures straight forward',
    targetPiece: 'p',
    needsTarget: true,
    uses: 1
  },
  {
    id: 'bishop-warp',
    name: 'Bishop Warp',
    icon: '✨',
    color: '#74b9ff',
    description: 'Your Bishop teleports to any empty square of the same color.',
    shortDesc: 'Bishop teleports to same-color square',
    targetPiece: 'b',
    needsTarget: true,
    uses: 1
  },
  {
    id: 'long-knight',
    name: 'Long Knight',
    icon: '🦘',
    color: '#e17055',
    description: 'Your Knight can jump in a 3+1 pattern instead of 2+1.',
    shortDesc: 'Knight jumps 3+1 squares',
    targetPiece: 'n',
    needsTarget: true,
    uses: 1
  },
  {
    id: 'double-move',
    name: 'Double Move',
    icon: '⏩',
    color: '#00cec9',
    description: 'Make two consecutive moves in one turn.',
    shortDesc: 'Move twice in a row',
    targetPiece: null,
    needsTarget: false,
    uses: 1
  },
  {
    id: 'resurrect',
    name: 'Resurrect',
    icon: '♻️',
    color: '#fd79a8',
    description: 'Revive a captured piece to its starting square.',
    shortDesc: 'Bring back a captured piece',
    targetPiece: null,
    needsTarget: true,
    uses: 1
  }
];

const PERK_MAP = {};
PERKS.forEach(p => PERK_MAP[p.id] = p);

function rollPerks(count = 3) {
  const shuffled = [...PERKS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map(p => ({
    id: p.id,
    used: false
  }));
}

// --- Client-side validation: get valid target squares for a perk ---
function getPerkTargets(perkId, fromSquare, chessInstance, myColor) {
  const chess = chessInstance;
  const piece = chess.get(fromSquare);
  if (!piece || piece.color !== myColor) return [];

  const perk = PERK_MAP[perkId];
  if (!perk) return [];

  // Check piece type matches (if perk requires specific piece)
  if (perk.targetPiece && piece.type !== perk.targetPiece) return [];

  const FILES = ['a','b','c','d','e','f','g','h'];
  const RANKS = ['1','2','3','4','5','6','7','8'];

  function sqToCoords(sq) {
    return { file: FILES.indexOf(sq[0]), rank: RANKS.indexOf(sq[1]) };
  }
  function coordsToSq(file, rank) {
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
    return FILES[file] + RANKS[rank];
  }

  const from = sqToCoords(fromSquare);
  const targets = [];

  switch (perkId) {
    case 'sniper-rook': {
      // All empty-path squares on same rank/file that have enemy pieces
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          if (i === from.rank && j === from.file) continue;
          const sq = coordsToSq(j, i);
          if (!sq) continue;
          const target = chess.get(sq);
          if (!target || target.color === myColor) continue;
          // Must be on same rank or file
          if (i !== from.rank && j !== from.file) continue;
          // Check path is clear
          let pathClear = true;
          const dr = Math.sign(i - from.rank);
          const df = Math.sign(j - from.file);
          let r = from.rank + dr, f = from.file + df;
          while (r !== i || f !== j) {
            const pathSq = coordsToSq(f, r);
            if (pathSq && chess.get(pathSq)) { pathClear = false; break; }
            r += dr; f += df;
          }
          if (pathClear) targets.push(sq);
        }
      }
      break;
    }

    case 'kings-knight':
    case 'queens-leap': {
      // Knight moves from 'from'
      const knightMoves = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
      for (const [dr, df] of knightMoves) {
        const sq = coordsToSq(from.file + df, from.rank + dr);
        if (!sq) continue;
        const target = chess.get(sq);
        if (!target || target.color !== myColor) targets.push(sq);
      }
      break;
    }

    case 'pawn-blitz': {
      // Capture straight forward (1 square ahead, same file, enemy piece)
      const dir = myColor === 'w' ? -1 : 1;
      const sq = coordsToSq(from.file, from.rank + dir);
      if (sq) {
        const target = chess.get(sq);
        if (target && target.color !== myColor) targets.push(sq);
      }
      break;
    }

    case 'bishop-warp': {
      // Any empty square of same color (light/dark)
      const fromIsLight = (from.file + from.rank) % 2 === 0;
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const sq = coordsToSq(j, i);
          if (!sq || sq === fromSquare) continue;
          const isLight = (j + i) % 2 === 0;
          if (isLight !== fromIsLight) continue;
          if (chess.get(sq)) continue; // Must be empty
          targets.push(sq);
        }
      }
      break;
    }

    case 'long-knight': {
      // 3+1 jumps
      const longMoves = [[3,1],[3,-1],[-3,1],[-3,-1],[1,3],[1,-3],[-1,3],[-1,-3]];
      for (const [dr, df] of longMoves) {
        const sq = coordsToSq(from.file + df, from.rank + dr);
        if (!sq) continue;
        const target = chess.get(sq);
        if (!target || target.color !== myColor) targets.push(sq);
      }
      break;
    }
  }

  return targets;
}

// Valid piece types for resurrect (based on captured pieces)
function getResurrectOptions(chessInstance, myColor) {
  // Count pieces on board, compare to starting count
  const board = chessInstance.board();
  const counts = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  for (const row of board) {
    for (const sq of row) {
      if (sq && sq.color === myColor && counts[sq.type] !== undefined) {
        counts[sq.type]++;
      }
    }
  }
  const starting = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const captured = [];
  for (const type of ['q','r','b','n','p']) {
    const missing = starting[type] - counts[type];
    for (let i = 0; i < missing; i++) {
      captured.push(type);
    }
  }
  return captured;
}

// Get valid resurrect squares for a piece type
function getResurrectSquares(pieceType, myColor) {
  const FILES = ['a','b','c','d','e','f','g','h'];
  const squares = [];
  if (myColor === 'w') {
    // White starts on rank 1 (RANKS index 0)
    for (const f of FILES) {
      squares.push(f + '1');
    }
  } else {
    // Black starts on rank 8 (RANKS index 7)
    for (const f of FILES) {
      squares.push(f + '8');
    }
  }
  return squares;
}

// Export
if (typeof module !== 'undefined') {
  module.exports = { PERKS, PERK_MAP, rollPerks, getPerkTargets, getResurrectOptions, getResurrectSquares };
}
if (typeof window !== 'undefined') {
  window.PERKS = PERKS;
  window.PERK_MAP = PERK_MAP;
  window.rollPerks = rollPerks;
  window.getPerkTargets = getPerkTargets;
  window.getResurrectOptions = getResurrectOptions;
  window.getResurrectSquares = getResurrectSquares;
}
