const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

const rooms = {};
const FOOD_COUNT = 5;
const WIDTH = 30;
const HEIGHT = 20;

function spawnFood() {
    return {
        x: Math.floor(Math.random() * WIDTH),
        y: Math.floor(Math.random() * HEIGHT)
    };
}

wss.on('connection', (ws) => {
    let playerRoom, playerId;

    ws.on('message', (msg) => {
        const data = JSON.parse(msg);

        if (data.type === 'create') {
            const code = Math.random().toString(36).substring(2, 8);
            rooms[code] = {
                players: [],
                foods: Array.from({ length: FOOD_COUNT }, spawnFood),
                state: 'waiting'
            };
            playerRoom = code;
            playerId = 0;
            rooms[code].players.push({
                ws,
                snake: [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }],
                dir: { x: 1, y: 0 },
                score: 0,
                alive: true
            });
            ws.send(JSON.stringify({ type: 'created', code, playerId }));
        }

        if (data.type === 'join') {
            const room = rooms[data.code];
            if (!room || room.players.length >= 2) {
                ws.send(JSON.stringify({ type: 'error', msg: 'Комната не найдена или полна' }));
                return;
            }
            playerRoom = data.code;
            playerId = 1;
            room.players.push({
                ws,
                snake: [{ x: 25, y: 10 }, { x: 26, y: 10 }, { x: 27, y: 10 }],
                dir: { x: -1, y: 0 },
                score: 0,
                alive: true
            });
            room.state = 'playing';
            room.players.forEach(p => p.ws.send(JSON.stringify({ type: 'start', playerId: p === room.players[1] ? 1 : 0 })));
            startGameLoop(room, data.code);
        }

        if (data.type === 'dir') {
            const room = rooms[playerRoom];
            if (!room || !room.players[playerId]) return;
            const p = room.players[playerId];
            const newDir = data.dir;
            if (p.dir.x + newDir.x !== 0 || p.dir.y + newDir.y !== 0) {
                p.dir = newDir;
            }
        }
    });

    ws.on('close', () => {
        if (playerRoom && rooms[playerRoom]) {
            const other = rooms[playerRoom].players.find(p => p.ws !== ws);
            if (other) other.ws.send(JSON.stringify({ type: 'opponent_left' }));
            delete rooms[playerRoom];
        }
    });
});

function startGameLoop(room, code) {
    const interval = setInterval(() => {
        if (!rooms[code]) { clearInterval(interval); return; }

        room.players.forEach((p, i) => {
            if (!p.alive) return;
            const head = { x: p.snake[0].x + p.dir.x, y: p.snake[0].y + p.dir.y };

            // Проверка стен
            if (head.x < 0 || head.x >= WIDTH || head.y < 0 || head.y >= HEIGHT) {
                p.alive = false;
                return;
            }
            // Проверка себя
            if (p.snake.some(s => s.x === head.x && s.y === head.y)) {
                p.alive = false;
                return;
            }
            // Проверка соперника
            const other = room.players[1 - i];
            if (other.snake.some(s => s.x === head.x && s.y === head.y)) {
                p.alive = false;
                return;
            }

            p.snake.unshift(head);
            const ate = room.foods.find(f => f.x === head.x && f.y === head.y);
            if (ate) {
                p.score += 10;
                room.foods = room.foods.filter(f => f !== ate);
                room.foods.push(spawnFood());
            } else {
                p.snake.pop();
            }
        });

        room.players.forEach(p => {
            p.ws.send(JSON.stringify({
                type: 'update',
                players: room.players.map(pl => ({
                    snake: pl.snake,
                    score: pl.score,
                    alive: pl.alive
                })),
                foods: room.foods
            }));
        });

        if (room.players.every(p => !p.alive)) {
            clearInterval(interval);
            room.players.forEach(p => p.ws.send(JSON.stringify({ type: 'draw' })));
        } else if (room.players.some(p => !p.alive)) {
            clearInterval(interval);
            const winner = room.players.find(p => p.alive);
            room.players.forEach(p => p.ws.send(JSON.stringify({ type: 'winner', playerId: room.players.indexOf(winner) })));
        }
    }, 120);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));
