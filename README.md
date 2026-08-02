# ♟️ Chess App — Local Network Multiplayer

A web-based chess application for playing chess with friends on the same local network. Real-time multiplayer using Socket.io, full chess rules via chess.js.

## Features

- ✅ Real-time multiplayer (2 players + spectators)
- ✅ Full chess rules (castling, en passant, promotion, check/checkmate/stalemate)
- ✅ Drag-and-drop & click-to-move
- ✅ Move history (PGN notation)
- ✅ In-game chat
- ✅ Resign & Rematch
- ✅ Board flips for black player
- ✅ Mobile responsive
- ✅ Works on local network (WiFi/LAN)

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start
```

Then open:
- **On your machine:** http://localhost:3000
- **On other devices (same WiFi):** http://<your-ip>:3000

### How to play

1. One player clicks **"Create New Game"** → gets a game code
2. Share the code + your IP address with the other player
3. Other player enters the code and clicks **"Join Game"**
4. Play chess! 🎉

## Tech Stack

- **Backend:** Node.js + Express + Socket.io
- **Game Logic:** [chess.js](https://github.com/jhlywa/chess.js)
- **Frontend:** Vanilla JS (no framework, no build step)

## Project Structure

```
chess-app/
├── server.js          # Express + Socket.io server, game state management
├── package.json
├── public/
│   ├── index.html      # Main HTML page
│   ├── css/
│   │   └── style.css   # All styling
│   └── js/
│       ├── chessboard.js  # Custom chessboard renderer (drag/drop, highlights)
│       └── main.js        # Client game logic, Socket.io, UI updates
```

## Roadmap (Extra Features)

- [ ] AI opponent (single player)
- [ ] Move timer / clock
- [ ] PGN export/import
- [ ] Game replays
- [ ] Player accounts & ELO rating
- [ ] Opening explorer
- [ ] Sound effects
- [ ] Themes / board skins

## License

MIT
