class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.minimapCanvas = document.getElementById('minimapCanvas');
        this.minimapCtx = this.minimapCanvas.getContext('2d');
        
        this.players = new Map();
        this.currentPlayerId = null;
        this.keys = {};
        this.gameRunning = true;
        this.ws = null;
        this.lastUpdateTime = 0;
        
        // Game settings
        this.mapWidth = 800;
        this.mapHeight = 600;
        this.playerSpeed = 3;
        this.minPlayerSize = 20;
        this.maxPlayerSize = 100;
        this.killDistance = 30;
        
        this.init();
    }
    
    init() {
        this.connectToServer();
        this.setupEventListeners();
        this.gameLoop();
    }
    
    connectToServer() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('Connected to server');
            // Join the game
            this.ws.send(JSON.stringify({
                type: 'join',
                data: {
                    name: 'Player#' + Math.random().toString(36).substr(2, 6)
                }
            }));
        };
        
        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleServerMessage(message);
        };
        
        this.ws.onclose = () => {
            console.log('Disconnected from server');
            // Try to reconnect after 3 seconds
            setTimeout(() => this.connectToServer(), 3000);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }
    
    handleServerMessage(message) {
        switch (message.type) {
            case 'init':
                this.currentPlayerId = message.data.playerId;
                message.data.players.forEach(player => {
                    this.players.set(player.id, player);
                });
                this.updateLeaderboard();
                break;
                
            case 'playerJoined':
                this.players.set(message.data.id, message.data);
                this.updateLeaderboard();
                break;
                
            case 'playerLeft':
                this.players.delete(message.data.id);
                this.updateLeaderboard();
                break;
                
            case 'playerMoved':
                const player = this.players.get(message.data.id);
                if (player) {
                    player.x = message.data.x;
                    player.y = message.data.y;
                }
                break;
                
            case 'playerKilled':
                this.handlePlayerKilled(message.data);
                break;
                
            case 'gameUpdate':
                message.data.players.forEach(playerData => {
                    const player = this.players.get(playerData.id);
                    if (player) {
                        Object.assign(player, playerData);
                    }
                });
                this.updateLeaderboard();
                break;
        }
    }
    
    handlePlayerKilled(data) {
        const killer = this.players.get(data.killer.id);
        const victim = this.players.get(data.victim.id);
        
        if (killer) {
            Object.assign(killer, data.killer);
        }
        if (victim) {
            Object.assign(victim, data.victim);
        }
        
        this.updateLeaderboard();
        this.showKillNotification(data.killer.name, data.victim.name);
    }
    
    
    setupEventListeners() {
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
        
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                // Update leaderboard based on tab
                this.updateLeaderboard();
            });
        });
        
        // Control buttons
        document.querySelector('.control-btn').addEventListener('click', () => {
            alert('Controls:\nWASD or Arrow Keys - Move\nSpace - Attack nearby enemies');
        });
        
        document.querySelectorAll('.control-btn')[1].addEventListener('click', () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                document.documentElement.requestFullscreen();
            }
        });
    }
    
    updatePlayer(player) {
        if (player.id === this.currentPlayerId) {
            // Handle player input
            let dx = 0, dy = 0;
            
            if (this.keys['KeyW'] || this.keys['ArrowUp']) dy -= this.playerSpeed;
            if (this.keys['KeyS'] || this.keys['ArrowDown']) dy += this.playerSpeed;
            if (this.keys['KeyA'] || this.keys['ArrowLeft']) dx -= this.playerSpeed;
            if (this.keys['KeyD'] || this.keys['ArrowRight']) dx += this.playerSpeed;
            
            // Normalize diagonal movement
            if (dx !== 0 && dy !== 0) {
                dx *= 0.707;
                dy *= 0.707;
            }
            
            if (dx !== 0 || dy !== 0) {
                player.x += dx;
                player.y += dy;
                
                // Keep player within bounds
                player.x = Math.max(player.size/2, Math.min(this.mapWidth - player.size/2, player.x));
                player.y = Math.max(player.size/2, Math.min(this.mapHeight - player.size/2, player.y));
                
                // Send movement to server
                this.sendToServer({
                    type: 'move',
                    data: { x: player.x, y: player.y }
                });
            }
            
            // Check for attacks (space key)
            if (this.keys['Space']) {
                this.sendToServer({
                    type: 'attack',
                    data: { x: player.x, y: player.y }
                });
            }
        }
    }
    
    sendToServer(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }
    
    
    showKillNotification(killer, victim) {
        // Create temporary notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.8);
            color: #ff6b35;
            padding: 20px 40px;
            border-radius: 10px;
            font-size: 24px;
            font-weight: bold;
            z-index: 1000;
            animation: fadeInOut 2s ease-in-out;
        `;
        notification.textContent = `${killer} killed ${victim}!`;
        
        // Add CSS animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
                50% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
                100% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            document.body.removeChild(notification);
            document.head.removeChild(style);
        }, 2000);
    }
    
    render() {
        // Clear canvas
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.mapWidth, this.mapHeight);
        
        // Draw grid
        this.drawGrid();
        
        // Draw players
        for (let [id, player] of this.players) {
            this.drawPlayer(player);
        }
        
        // Update minimap
        this.updateMinimap();
    }
    
    drawGrid() {
        this.ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        this.ctx.lineWidth = 1;
        
        for (let x = 0; x < this.mapWidth; x += 20) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.mapHeight);
            this.ctx.stroke();
        }
        
        for (let y = 0; y < this.mapHeight; y += 20) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.mapWidth, y);
            this.ctx.stroke();
        }
    }
    
    drawPlayer(player) {
        // Draw player circle
        this.ctx.fillStyle = player.color;
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        
        this.ctx.beginPath();
        this.ctx.arc(player.x, player.y, player.size / 2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        
        // Draw player name
        this.ctx.fillStyle = '#000';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(player.name, player.x, player.y - player.size / 2 - 5);
        
        // Draw health bar
        const barWidth = 40;
        const barHeight = 4;
        const barX = player.x - barWidth / 2;
        const barY = player.y - player.size / 2 - 15;
        
        // Health bar background
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // Health bar fill
        const healthPercent = player.health / player.maxHealth;
        this.ctx.fillStyle = '#4CAF50';
        this.ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
        
        // Health bar border
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(barX, barY, barWidth, barHeight);
    }
    
    updateMinimap() {
        this.minimapCtx.fillStyle = '#333';
        this.minimapCtx.fillRect(0, 0, 100, 100);
        
        const scaleX = 100 / this.mapWidth;
        const scaleY = 100 / this.mapHeight;
        
        for (let [id, player] of this.players) {
            const x = player.x * scaleX;
            const y = player.y * scaleY;
            const size = Math.max(2, player.size * scaleX / 4);
            
            this.minimapCtx.fillStyle = player.id === this.currentPlayerId ? '#4CAF50' : '#ff6b35';
            this.minimapCtx.beginPath();
            this.minimapCtx.arc(x, y, size, 0, Math.PI * 2);
            this.minimapCtx.fill();
        }
    }
    
    updateLeaderboard() {
        const playersList = document.getElementById('playersList');
        const activeTab = document.querySelector('.tab.active').dataset.tab;
        
        // Sort players based on active tab
        const sortedPlayers = Array.from(this.players.values()).sort((a, b) => {
            switch (activeTab) {
                case 'kills':
                    return b.kills - a.kills;
                case 'streak':
                    return b.points - a.points; // Using points as streak for now
                default: // points
                    return b.points - a.points;
            }
        });
        
        playersList.innerHTML = '';
        
        sortedPlayers.forEach((player, index) => {
            const playerItem = document.createElement('div');
            playerItem.className = 'player-item';
            
            const value = activeTab === 'kills' ? player.kills : 
                         activeTab === 'streak' ? player.points : player.points;
            
            playerItem.innerHTML = `
                <div class="player-rank">${index + 1}</div>
                <div class="player-name">${player.name}</div>
                <div class="player-kd">K/D: ${player.kills}/${player.deaths}</div>
                <div class="player-points">${value}</div>
            `;
            
            playersList.appendChild(playerItem);
        });
        
        // Update player count
        document.getElementById('playerCount').textContent = `${this.players.size} player${this.players.size !== 1 ? 's' : ''} online`;
    }
    
    gameLoop() {
        if (!this.gameRunning) return;
        
        // Update all players
        for (let [id, player] of this.players) {
            this.updatePlayer(player);
        }
        
        // Render game
        this.render();
        
        // Continue game loop
        requestAnimationFrame(() => this.gameLoop());
    }
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
    new Game();
});
