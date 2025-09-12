const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

class MultiplayerGameServer {
    constructor() {
        this.players = new Map();
        this.playerCounter = 0;
        this.server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });
        
        this.wss = new WebSocket.Server({ server: this.server });
        this.setupWebSocket();
        
        this.gameSettings = {
            mapWidth: 800,
            mapHeight: 600,
            minPlayerSize: 20,
            maxPlayerSize: 80,
            attackRange: 50,
            punchCooldown: 500,
            kickCooldown: 800,
            playerSpeed: 3
        };
        
        this.gameLoop();
    }
    
    handleRequest(req, res) {
        let filePath = req.url === '/' ? '/index-multiplayer.html' : req.url;
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
            case 'rename':
                this.handleRename(ws, message.data);
                break;
        }
    }
    
    addPlayer(ws, data) {
        this.playerCounter++;
        const playerId = 'player_' + this.playerCounter;
        const playerName = data.name || `Player ${this.playerCounter}`;
        
        const player = {
            id: playerId,
            name: playerName,
            x: Math.random() * (this.gameSettings.mapWidth - 40) + 20,
            y: Math.random() * (this.gameSettings.mapHeight - 40) + 20,
            size: this.gameSettings.minPlayerSize,
            health: 100,
            maxHealth: 100,
            kills: 0,
            deaths: 0,
            points: 0,
            color: this.getRandomColor(),
            facing: 1,
            isAttacking: false,
            attackType: null,
            attackTimer: 0,
            lastPunch: 0,
            lastKick: 0,
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
                    color: p.color,
                    facing: p.facing,
                    isAttacking: p.isAttacking,
                    attackType: p.attackType
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
                color: player.color,
                facing: player.facing
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
        player.facing = data.facing || player.facing;
        
        // Broadcast position to other players
        this.broadcast({
            type: 'playerMoved',
            data: {
                id: player.id,
                x: player.x,
                y: player.y,
                facing: player.facing
            }
        }, ws);
    }
    
    handleAttack(ws, data) {
        if (!ws.playerId || !this.players.has(ws.playerId)) return;
        
        const attacker = this.players.get(ws.playerId);
        const now = Date.now();
        
        // Check cooldown
        if (data.attackType === 'punch' && now - attacker.lastPunch < this.gameSettings.punchCooldown) return;
        if (data.attackType === 'kick' && now - attacker.lastKick < this.gameSettings.kickCooldown) return;
        
        // Update cooldown
        if (data.attackType === 'punch') {
            attacker.lastPunch = now;
        } else {
            attacker.lastKick = now;
        }
        
        // Set attack state
        attacker.isAttacking = true;
        attacker.attackType = data.attackType;
        attacker.attackTimer = data.attackType === 'punch' ? 300 : 400;
        
        // Check for hits
        const damage = data.attackType === 'punch' ? 25 : 35;
        const range = this.gameSettings.attackRange + (data.attackType === 'kick' ? 10 : 0);
        
        for (let [id, target] of this.players) {
            if (id === attacker.id) continue;
            
            const dx = target.x - attacker.x;
            const dy = target.y - attacker.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < range) {
                this.hitPlayer(attacker, target, damage);
            }
        }
        
        // Broadcast attack
        this.broadcast({
            type: 'playerAttacked',
            data: {
                id: attacker.id,
                attackType: data.attackType,
                x: attacker.x,
                y: attacker.y
            }
        });
    }
    
    handleRename(ws, data) {
        if (!ws.playerId || !this.players.has(ws.playerId)) return;
        
        const player = this.players.get(ws.playerId);
        const oldName = player.name;
        player.name = data.newName || `Player ${ws.playerId.split('_')[1]}`;
        
        // Broadcast rename
        this.broadcast({
            type: 'playerRenamed',
            data: {
                id: player.id,
                oldName: oldName,
                newName: player.name
            }
        });
        
        console.log(`Player ${oldName} renamed to ${player.name}`);
    }
    
    hitPlayer(attacker, target, damage) {
        target.health -= damage;
        
        if (target.health <= 0) {
            this.killPlayer(attacker, target);
        } else {
            // Broadcast damage
            this.broadcast({
                type: 'playerDamaged',
                data: {
                    id: target.id,
                    health: target.health,
                    maxHealth: target.maxHealth
                }
            });
        }
    }
    
    killPlayer(killer, victim) {
        // Increase killer's stats
        killer.size = Math.min(this.gameSettings.maxPlayerSize, killer.size + 8);
        killer.points += 10;
        killer.kills++;
        killer.health = Math.min(killer.maxHealth, killer.health + 30);
        
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
        // Update attack timers
        setInterval(() => {
            for (let [id, player] of this.players) {
                if (player.isAttacking) {
                    player.attackTimer -= 16;
                    if (player.attackTimer <= 0) {
                        player.isAttacking = false;
                        player.attackType = null;
                    }
                }
            }
        }, 16);
        
        // Send periodic updates
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
                            points: p.points,
                            facing: p.facing,
                            isAttacking: p.isAttacking,
                            attackType: p.attackType
                        }))
                    }
                });
            }
        }, 1000 / 30); // 30 FPS
    }
    
    start(port = 3000) {
        this.server.listen(port, () => {
            console.log(`Multiplayer game server running on http://localhost:${port}`);
            console.log(`Players will be numbered: Player 1, Player 2, Player 3...`);
        });
    }
}

// Start server
const gameServer = new MultiplayerGameServer();
gameServer.start(3000);
