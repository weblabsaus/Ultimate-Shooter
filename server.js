const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const players = {};
const bulletSpeed = 0.5;
const mapSize = 100; // Increased map size

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Player joined
    socket.on('join', () => {
        players[socket.id] = {
            x: (Math.random() - 0.5) * mapSize,
            y: 1,
            z: (Math.random() - 0.5) * mapSize,
            rotationY: 0,
            health: 100,
            score: 0
        };
        socket.emit('initGame', { id: socket.id, players, mapSize });
        socket.broadcast.emit('playerJoined', { id: socket.id, ...players[socket.id] });
    });

    // Player movement
    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].rotationY = data.rotationY;
            socket.broadcast.emit('playerMoved', { id: socket.id, ...players[socket.id] });
        }
    });

    // Player shooting
    socket.on('shoot', (data) => {
        io.emit('bulletFired', {
            playerId: socket.id,
            x: data.x,
            y: data.y,
            z: data.z,
            directionX: data.directionX,
            directionY: data.directionY,
            directionZ: data.directionZ
        });
    });

    // Hit detection
    socket.on('hit', (data) => {
        if (players[data.id]) {
            players[data.id].health -= 20; // Increased damage
            if (players[data.id].health <= 0) {
                players[socket.id].score++; // Increment score for the shooter
                io.emit('playerKilled', { id: data.id, killerId: socket.id });
                // Respawn
                players[data.id].health = 100;
                players[data.id].x = (Math.random() - 0.5) * mapSize;
                players[data.id].y = 1;
                players[data.id].z = (Math.random() - 0.5) * mapSize;
            }
            io.emit('playerDamaged', { 
                id: data.id, 
                health: players[data.id].health,
                x: players[data.id].x,
                y: players[data.id].y,
                z: players[data.id].z
            });
            io.emit('scoreUpdated', { id: socket.id, score: players[socket.id].score });
        }
    });

    // Player disconnected
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

// Function to start the server
const startServer = (port) => {
    server.listen(port, () => {
        console.log(`Server running on port ${port}`);
    }).on('error', (e) => {
        if (e.code === 'EADDRINUSE') {
            console.log(`Port ${port} is busy, trying the next one...`);
            startServer(port + 1);
        } else {
            console.error(e);
        }
    });
};

// Start the server
const PORT = process.env.PORT || 3000;
startServer(PORT);