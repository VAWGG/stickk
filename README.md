# STICK - Multiplayer Fighting Game

A minimalist multiplayer fighting game where players grow bigger when they kill opponents. Built with HTML5 Canvas, WebSocket, and Node.js.

## Features

- **Real-time multiplayer** - Play with other players online
- **Growth mechanic** - Players get bigger and stronger when they kill opponents
- **Leaderboard** - Track top players by points, kills, and best streak
- **Minimalist design** - Clean, modern UI inspired by .io games
- **Responsive controls** - WASD or arrow keys for movement, spacebar to attack

## How to Play

1. **Movement**: Use WASD keys or arrow keys to move around the map
2. **Attack**: Press spacebar when near another player to attack
3. **Kill**: Get close enough to another player to eliminate them
4. **Grow**: When you kill a player, you get bigger, stronger, and gain points
5. **Survive**: Avoid being killed by other players!

## Installation & Setup

### Prerequisites
- Node.js (version 14 or higher)
- npm (comes with Node.js)

### Steps

1. **Clone or download** this repository
2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the server**:
   ```bash
   npm start
   ```

4. **Open your browser** and go to:
   ```
   http://localhost:3000
   ```

### Development Mode

For development with auto-restart:
```bash
npm run dev
```

## Game Mechanics

- **Player Size**: Starts at 20px, can grow up to 100px
- **Health**: 100 HP, regenerates when you kill someone
- **Kill Distance**: Based on combined player sizes
- **Points**: +10 points per kill
- **Growth**: +5px size per kill

## Technical Details

- **Frontend**: HTML5 Canvas, CSS3, Vanilla JavaScript
- **Backend**: Node.js with WebSocket (ws library)
- **Real-time**: WebSocket for instant multiplayer communication
- **Canvas**: 800x600 game area with grid background
- **Minimap**: Real-time minimap showing all player positions

## File Structure

```
stick/
├── index.html          # Main HTML file
├── style.css           # CSS styling
├── game.js            # Client-side game logic
├── server.js          # WebSocket server
├── package.json       # Dependencies and scripts
└── README.md          # This file
```

## Customization

You can easily modify game settings in `server.js`:

```javascript
this.gameSettings = {
    mapWidth: 800,        // Game area width
    mapHeight: 600,       // Game area height
    minPlayerSize: 20,    // Starting player size
    maxPlayerSize: 100,   // Maximum player size
    killDistance: 30,     // Base kill distance
    playerSpeed: 3        // Player movement speed
};
```

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Troubleshooting

- **Connection issues**: Make sure the server is running on port 3000
- **Performance**: Close other browser tabs for better performance
- **Controls not working**: Click on the game area to focus it

## Future Enhancements

- [ ] Power-ups and special abilities
- [ ] Different game modes
- [ ] Player customization
- [ ] Sound effects and music
- [ ] Mobile touch controls
- [ ] Spectator mode

## License

MIT License - feel free to modify and distribute!
