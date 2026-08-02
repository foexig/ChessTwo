// draft.js — Character selection + Perk draft system
// Loaded after perks.js, before main.js
// Does NOT redeclare FILES/RANKS or PERKS/PERK_MAP (those belong to perks.js)

// In Node.js, require perks.js. In browser, PERKS/PERK_MAP are global from perks.js.
const _PERKS = typeof module !== 'undefined' ? require('./perks.js').PERKS : PERKS;
const _PERK_MAP = typeof module !== 'undefined' ? require('./perks.js').PERK_MAP : PERK_MAP;

// --- 8 Characters with meta-perks ---
const CHARACTERS = [
  {
    id: 'gambler', name: 'Gambler', icon: '🎰', color: '#fdcb6e',
    description: '3 rerolls during the draft. Don\'t like your cards? Roll again.',
    ability: 'rerolls', value: 3
  },
  {
    id: 'sniper', name: 'Sniper', icon: '🎯', color: '#e94560',
    description: 'Draft 4 perks instead of 3. More options, more power.',
    ability: 'extra_picks', value: 4
  },
  {
    id: 'guardian', name: 'Guardian', icon: '🛡️', color: '#74b9ff',
    description: 'Your first perk gets a bonus use. Make it count.',
    ability: 'bonus_uses', value: 1
  },
  {
    id: 'sage', name: 'Sage', icon: '📚', color: '#a29bfe',
    description: 'All card rarities are revealed. No mystery, just strategy.',
    ability: 'see_rarities', value: true
  },
  {
    id: 'warlord', name: 'Warlord', icon: '⚔️', color: '#e17055',
    description: '7 cards to choose from instead of 6. More to pick from.',
    ability: 'extra_cards', value: 7
  },
  {
    id: 'speedster', name: 'Speedster', icon: '⚡', color: '#00cec9',
    description: 'Your clock gets +15% time. Play fast, think faster.',
    ability: 'time_bonus', value: 0.15
  },
  {
    id: 'necromancer', name: 'Necromancer', icon: '💀', color: '#6c5ce7',
    description: 'Resurrect perk is always in your draft pool.',
    ability: 'guaranteed_resurrect', value: true
  },
  {
    id: 'lucky', name: 'Lucky', icon: '🍀', color: '#55efc4',
    description: 'One guaranteed Epic+ card in your draft hand.',
    ability: 'guaranteed_high', value: 'epic'
  }
];

const CHARACTER_MAP = {};
CHARACTERS.forEach(c => CHARACTER_MAP[c.id] = c);

// --- 5 Rarity tiers ---
const RARITIES = {
  common:    { name: 'Common',    color: '#95a5a6', glow: 'none',           weight: 50, uses: 3 },
  rare:      { name: 'Rare',      color: '#3498db', glow: '0 0 8px #3498db', weight: 25, uses: 1 },
  epic:      { name: 'Epic',      color: '#9b59b6', glow: '0 0 12px #9b59b6', weight: 15, uses: 1 },
  legendary: { name: 'Legendary', color: '#f1c40f', glow: '0 0 16px #f1c40f', weight: 8,  uses: 1 },
  mythic:    { name: 'Mythic',    color: '#e74c3c', glow: '0 0 20px #e74c3c', weight: 2,  uses: 1 }
};

// --- Rarity based on affected piece type ---
// pawns → common, knights/bishops → rare, rooks → epic, queen/king → legendary, rest → mythic
function rarityForPiece(pieceType) {
  if (!pieceType) return 'mythic';        // double-move, resurrect
  if (pieceType === 'p') return 'common';
  if (pieceType === 'n' || pieceType === 'b') return 'rare';
  if (pieceType === 'r') return 'epic';
  if (pieceType === 'q' || pieceType === 'k') return 'legendary';
  return 'mythic';
}

const RARITY_KEYS = Object.keys(RARITIES);

// --- Roll a rarity based on weights ---
function rollRarity() {
  const total = RARITY_KEYS.reduce((s, k) => s + RARITIES[k].weight, 0);
  let roll = Math.random() * total;
  for (const k of RARITY_KEYS) {
    roll -= RARITIES[k].weight;
    if (roll <= 0) return k;
  }
  return 'common';
}

// --- Generate draft cards (array of { perkId, rarity }) ---
function rollDraftCards(count, character, existingPool) {
  const pool = existingPool || _PERKS.map(p => p.id);
  const cards = [];

  for (let i = 0; i < count; i++) {
    const perkId = pool[Math.floor(Math.random() * pool.length)];
    const perk = _PERK_MAP[perkId];
    // Rarity determined by affected piece type, not random
    let rarity = perk ? rarityForPiece(perk.targetPiece) : 'mythic';

    if (character) {
      if (character.ability === 'guaranteed_resurrect' && i === 0) {
        cards.push({ perkId: 'resurrect', rarity: 'mythic' });
        continue;
      }
    }

    cards.push({ perkId, rarity });
  }

  return cards;
}

// --- Get piece SVG path for a perk (for card display) ---
function perkPieceImg(perkId, color) {
  const perk = _PERK_MAP[perkId];
  if (!perk || !perk.targetPiece) return null;
  const prefix = color === 'w' ? 'w' : 'b';
  return `/img/pieces/${prefix}${perk.targetPiece.toUpperCase()}.svg`;
}

// --- Apply character bonus to drafted perks ---
function applyCharacterBonuses(draftedPerks, character) {
  const perks = draftedPerks.map(p => ({
    id: p.perkId,
    rarity: p.rarity,
    uses: RARITIES[p.rarity].uses,
    used: 0
  }));

  if (character && character.ability === 'bonus_uses' && perks.length > 0) {
    perks[0].uses += character.value;
  }

  return perks;
}

// --- Export ---
if (typeof module !== 'undefined') {
  module.exports = { CHARACTERS, CHARACTER_MAP, RARITIES, rarityForPiece, rollRarity, rollDraftCards, applyCharacterBonuses };
}
if (typeof window !== 'undefined') {
  window.CHARACTERS = CHARACTERS;
  window.CHARACTER_MAP = CHARACTER_MAP;
  window.RARITIES = RARITIES;
  window.rollRarity = rollRarity;
  window.rollDraftCards = rollDraftCards;
  window.perkPieceImg = perkPieceImg;
  window.applyCharacterBonuses = applyCharacterBonuses;
}
