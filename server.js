const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

class GameServer {
    constructor() {
        this.players = new Map();
        this.server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });
        
        this.wss = new WebSocket.Server({ server: this.server });
        this.setupWebSocket();
        
        this.gameSettings = {
            mapWidth: 800,
            mapHeight: 600,
            minPlayerSize: 20,
            maxPlayerSize: 100,
            killDistance: 30,
            playerSpeed: 3
        };
        
        this.gameLoop();
    }
    
    handleRequest(req, res) {
        let filePath = req.url === '/' ? '/index.html' : req.url;
        const fullPath = path.join(__dirname, filePath);
        
        fs.readFile(fullPath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('File not found');
                return;
            }
            
            const ext = path.extname(fullPath);
            const contentType = this.getContentType(ext);
            
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        });
    }
    
    getContentType(ext) {
        const types = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json'
        };
        return types[ext] || 'text/plain';
    }
    
    setupWebSocket() {
        this.wss.on('connection', (ws) => {
            console.log('New player connected');
            
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.handleMessage(ws, message);
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            });
            
            ws.on('close', () => {
                this.removePlayer(ws);
            });
            
            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                this.removePlayer(ws);
            });
        });
    }
    
    handleMessage(ws, message) {
        switch (message.type) {
            case 'join':
                this.addPlayer(ws, message.data);
                break;
            case 'move':
                this.updatePlayerPosition(ws, message.data);
                break;
            case 'attack':
                this.handleAttack(ws, message.data);
                break;
        }
    }
    
    addPlayer(ws, data) {
        const playerId = 'player_' + Math.random().toString(36).substr(2, 9);
        const player = {
            id: playerId,
            name: data.name || 'Player#' + Math.random().toString(36).substr(2, 6),
            x: Math.random() * (this.gameSettings.mapWidth - 40) + 20,
            y: Math.random() * (this.gameSettings.mapHeight - 40) + 20,
            size: this.gameSettings.minPlayerSize,
            health: 100,
            maxHealth: 100,
            kills: 0,
            deaths: 0,
            points: 0,
            color: this.getRandomColor(),
            ws: ws
        };
        
        this.players.set(playerId, player);
        ws.playerId = playerId;
        
        // Send player their ID and game state
        ws.send(JSON.stringify({
            type: 'init',
            data: {
                playerId: playerId,
                players: Array.from(this.players.values()).map(p => ({
                    id: p.id,
                    name: p.name,
                    x: p.x,
                    y: p.y,
                    size: p.size,
                    health: p.health,
                    maxHealth: p.maxHealth,
                    kills: p.kills,
                    deaths: p.deaths,
                    points: p.points,
                    color: p.color
                }))
            }
        }));
        
        // Notify other players
        this.broadcast({
            type: 'playerJoined',
            data: {
                id: player.id,
                name: player.name,
                x: player.x,
                y: player.y,
                size: player.size,
                health: player.health,
                maxHealth: player.maxHealth,
                kills: player.kills,
                deaths: player.deaths,
                points: player.points,
                color: player.color
            }
        }, ws);
        
        console.log(`Player ${player.name} joined (${this.players.size} total)`);
    }
    
    removePlayer(ws) {
        if (ws.playerId && this.players.has(ws.playerId)) {
            const player = this.players.get(ws.playerId);
            this.players.delete(ws.playerId);
            
            this.broadcast({
                type: 'playerLeft',
                data: { id: ws.playerId }
            });
            
            console.log(`Player ${player.name} left (${this.players.size} total)`);
        }
    }
    
    updatePlayerPosition(ws, data) {
        if (!ws.playerId || !this.players.has(ws.playerId)) return;
        
        const player = this.players.get(ws.playerId);
        player.x = Math.max(player.size/2, Math.min(this.gameSettings.mapWidth - player.size/2, data.x));
        player.y = Math.max(player.size/2, Math.min(this.gameSettings.mapHeight - player.size/2, data.y));
        
        // Broadcast position to other players
        this.broadcast({
            type: 'playerMoved',
            data: {
                id: player.id,
                x: player.x,
                y: player.y
            }
        }, ws);
    }
    
    handleAttack(ws, data) {
        if (!ws.playerId || !this.players.has(ws.playerId)) return;
        
        const attacker = this.players.get(ws.playerId);
        
        // Check for kills
        for (let [id, target] of this.players) {
            if (id === attacker.id) continue;
            
            const dx = attacker.x - target.x;
            const dy = attacker.y - target.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const killDistance = (attacker.size + target.size) / 2 + this.gameSettings.killDistance;
            
            if (distance < killDistance) {
                this.killPlayer(attacker, target);
            }
        }

    }
    
    killPlayer(killer, victim) {
        // Increase killer's stats
        killer.size = Math.min(this.gameSettings.maxPlayerSize, killer.size + 5);
        killer.points += 10;
        killer.kills++;
        killer.health = Math.min(killer.maxHealth, killer.health + 20);
        
        // Reset victim
        victim.size = this.gameSettings.minPlayerSize;
        victim.health = victim.maxHealth;
        victim.deaths++;
        victim.x = Math.random() * (this.gameSettings.mapWidth - 40) + 20;
        victim.y = Math.random() * (this.gameSettings.mapHeight - 40) + 20;
        
        // Broadcast kill event
        this.broadcast({
            type: 'playerKilled',
            data: {
                killer: {
                    id: killer.id,
                    name: killer.name,
                    size: killer.size,
                    points: killer.points,
                    kills: killer.kills,
                    health: killer.health
                },
                victim: {
                    id: victim.id,
                    name: victim.name,
                    x: victim.x,
                    y: victim.y,
                    size: victim.size,
                    health: victim.health,
                    deaths: victim.deaths
                }
            }
        });
    }
    
    broadcast(message, excludeWs = null) {
        this.wss.clients.forEach(ws => {
            if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(message));
            }
        });
    }
    
    getRandomColor() {
        const colors = ['#ff6b35', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff'];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    gameLoop() {
        // Send periodic updates to all clients
        setInterval(() => {
            if (this.players.size > 0) {
                this.broadcast({
                    type: 'gameUpdate',
                    data: {
                        players: Array.from(this.players.values()).map(p => ({
                            id: p.id,
                            x: p.x,
                            y: p.y,
                            size: p.size,
                            health: p.health,
                            kills: p.kills,
                            deaths: p.deaths,
                            points: p.points
                        }))
                    }
                });
            }
        }, 1000 / 30); // 30 FPS
    }
    
    start(port = 3000) {
        this.server.listen(port, () => {
            console.log(`Game server running on http://localhost:${port}`);
        });
    }
}

// Start server
const gameServer = new GameServer();
gameServer.start(3000);