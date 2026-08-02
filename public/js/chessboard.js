// chessboard.js — Custom chessboard renderer with drag-and-drop + click-to-move
// Uses Unicode chess pieces, renders from FEN, handles highlights

const PIECES = {
  'wK': '♔', 'wQ': '♕', 'wR': '♖', 'wB': '♗', 'wN': '♘', 'wP': '♙',
  'bK': '♚', 'bQ': '♛', 'bR': '♜', 'bB': '♝', 'bN': '♞', 'bP': '♟'
};

const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = ['8','7','6','5','4','3','2','1'];

class ChessBoard {
  constructor(containerId, callbacks = {}) {
    this.container = document.getElementById(containerId);
    this.onMove = callbacks.onMove || (() => {});
    this.onSquareClick = callbacks.onSquareClick || (() => {});
    this.flipped = false;
    this.fen = '';
    this.selectedSquare = null;
    this.legalMoves = [];
    this.lastMove = null;
    this.checkSquare = null;
    this.interactive = true;
    this.myColor = 'w';
    this.draggedPiece = null;
    this.draggedFrom = null;

    this.render();
  }

  setFlipped(flipped) {
    this.flipped = flipped;
    this.render();
  }

  setMyColor(color) {
    this.myColor = color;
    this.interactive = color === 'w' || color === 'b';
  }

  parseFEN(fen) {
    const board = [];
    const rows = fen.split(' ')[0].split('/');
    for (const row of rows) {
      const boardRow = [];
      for (const ch of row) {
        if (isNaN(ch)) {
          const color = ch === ch.toUpperCase() ? 'w' : 'b';
          boardRow.push(color + ch.toUpperCase());
        } else {
          for (let i = 0; i < parseInt(ch); i++) boardRow.push(null);
        }
      }
      board.push(boardRow);
    }
    return board;
  }

  // Convert display row/col to algebraic square name (handles flip)
  squareName(row, col) {
    const displayRow = this.flipped ? 7 - row : row;
    const displayCol = this.flipped ? 7 - col : col;
    return FILES[displayCol] + RANKS[displayRow];
  }

  // Convert algebraic square name to FEN board indices (always standard, no flip)
  squareToBoard(sqName) {
    const col = FILES.indexOf(sqName[0]);
    const row = RANKS.indexOf(sqName[1]);
    return { row, col };
  }

  getPieceAt(sqName) {
    const board = this.parseFEN(this.fen);
    const { row, col } = this.squareToBoard(sqName);
    return board[row] ? board[row][col] : null;
  }

  render() {
    this.container.innerHTML = '';
    const board = this.parseFEN(this.fen);

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const square = document.createElement('div');
        const isLight = (row + col) % 2 === 0;
        square.className = `square ${isLight ? 'light' : 'dark'}`;
        const sqName = this.squareName(row, col);
        square.dataset.square = sqName;

        // Highlight selected
        if (this.selectedSquare === sqName) {
          square.classList.add('selected');
        }

        // Highlight legal move targets
        if (this.legalMoves.some(m => m.to === sqName)) {
          const { row: r, col: c } = this.squareToBoard(sqName);
          const targetPiece = board[r] && board[r][c];
          if (targetPiece) {
            square.classList.add('capture-target');
          } else {
            square.classList.add('move-target');
          }
        }

        // Last move highlight
        if (this.lastMove && (this.lastMove.from === sqName || this.lastMove.to === sqName)) {
          square.classList.add('last-move');
        }

        // Check highlight
        if (this.checkSquare === sqName) {
          square.classList.add('in-check');
        }

        // Place piece
        const { row: pr, col: pc } = this.squareToBoard(sqName);
        const piece = board[pr] && board[pr][pc];
        if (piece) {
          const pieceEl = document.createElement('span');
          pieceEl.className = `piece ${piece[0] === 'w' ? 'white' : 'black'}`;
          pieceEl.textContent = PIECES[piece];
          pieceEl.dataset.piece = piece;
          pieceEl.dataset.square = sqName;

          // Drag and drop
          pieceEl.draggable = this.interactive && this.isMyPiece(piece);
          pieceEl.addEventListener('dragstart', (e) => this.onDragStart(e, sqName, pieceEl));
          pieceEl.addEventListener('dragend', (e) => this.onDragEnd(e));
          pieceEl.addEventListener('touchstart', (e) => this.onTouchStart(e, sqName), { passive: false });

          square.appendChild(pieceEl);
        }

        // Click to move
        square.addEventListener('click', () => this.onSquareClick(sqName));

        // Drag over
        square.addEventListener('dragover', (e) => {
          e.preventDefault();
          square.classList.add('drag-over');
        });
        square.addEventListener('dragleave', () => {
          square.classList.remove('drag-over');
        });
        square.addEventListener('drop', (e) => {
          e.preventDefault();
          square.classList.remove('drag-over');
          if (this.draggedFrom && this.draggedFrom !== sqName) {
            this.handleMove(this.draggedFrom, sqName);
          }
        });

        this.container.appendChild(square);
      }
    }
  }

  isMyPiece(piece) {
    return piece && piece[0] === this.myColor;
  }

  onDragStart(e, sqName, pieceEl) {
    if (!this.interactive) { e.preventDefault(); return; }
    if (!this.isMyPiece(pieceEl.dataset.piece)) { e.preventDefault(); return; }
    this.draggedFrom = sqName;
    this.draggedPiece = pieceEl;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', sqName); } catch(_) {}
  }

  onDragEnd(e) {
    this.draggedFrom = null;
    this.draggedPiece = null;
  }

  onTouchStart(e, sqName) {
    if (!this.interactive) return;
    this.onSquareClick(sqName);
  }

  handleMove(from, to) {
    const piece = this.getPieceAt(from);
    if (piece && piece[1] === 'P') {
      const targetRank = to[1];
      if ((piece[0] === 'w' && targetRank === '8') || (piece[0] === 'b' && targetRank === '1')) {
        this.onMove(from, to, true);
        return;
      }
    }
    this.onMove(from, to, false);
  }

  update(fen, options = {}) {
    this.fen = fen;
    if (options.lastMove) this.lastMove = options.lastMove;
    if (options.checkSquare !== undefined) this.checkSquare = options.checkSquare;
    this.selectedSquare = null;
    this.legalMoves = [];
    this.render();
  }

  selectSquare(sqName) {
    if (!this.interactive) return;
    const piece = this.getPieceAt(sqName);
    if (piece && this.isMyPiece(piece)) {
      this.selectedSquare = sqName;
      return true;
    }
    return false;
  }

  setLegalMoves(moves) {
    this.legalMoves = moves || [];
    this.render();
  }

  clearSelection() {
    this.selectedSquare = null;
    this.legalMoves = [];
    this.render();
  }
}

window.ChessBoard = ChessBoard;
