import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';

console.log('Game script started');

let socket, scene, camera, renderer, players = {}, playerObj, mapSize;
let moveSpeed = 0.2; // Increased movement speed
let score = 0;

const updateStatus = (message) => {
    document.getElementById('status').textContent = message;
    console.log(message);
};

const updateScore = () => {
    document.getElementById('scoreValue').textContent = score;
};

const init = () => {
    updateStatus('Initializing game');
    try {
        // Initialize Three.js
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        renderer = new THREE.WebGLRenderer();
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.getElementById('gameCanvas').appendChild(renderer.domElement);
        updateStatus('Three.js scene set up');

        // Set up basic scene
        scene.background = new THREE.Color(0x87CEEB);  // Sky blue background

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(1, 1, 1);
        scene.add(directionalLight);

        updateStatus('Basic scene created');

        // Initialize Socket.io
        socket = io();
        updateStatus('Socket.io initialized');

        socket.on('connect', () => {
            updateStatus('Connected to server');
            socket.emit('join');
        });

        socket.on('initGame', (data) => {
            updateStatus('Game initialized');
            mapSize = data.mapSize;
            createEnvironment();
            Object.keys(data.players).forEach((id) => {
                if (id !== socket.id) createPlayer(id, data.players[id]);
            });
            createPlayer(socket.id, data.players[socket.id], true);
        });

        socket.on('playerJoined', (data) => createPlayer(data.id, data));
        socket.on('playerLeft', (id) => {
            if (players[id]) {
                scene.remove(players[id].mesh);
                delete players[id];
            }
        });

        socket.on('playerMoved', (data) => {
            if (players[data.id]) {
                players[data.id].mesh.position.set(data.x, data.y, data.z);
                players[data.id].mesh.rotation.y = data.rotationY;
            }
        });

        socket.on('bulletFired', handleBulletFired);

        socket.on('playerKilled', (data) => {
            if (data.id === socket.id) {
                respawn();
            } else if (data.killerId === socket.id) {
                score++;
                updateScore();
            }
        });

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('click', handleClick);

        // Lock pointer
        renderer.domElement.requestPointerLock = renderer.domElement.requestPointerLock || renderer.domElement.mozRequestPointerLock;
        renderer.domElement.onclick = function() {
            renderer.domElement.requestPointerLock();
        };

        animate();
        updateStatus('Game initialization complete');
    } catch (error) {
        updateStatus('Error during initialization: ' + error.message);
        console.error('Error during initialization:', error);
    }
};

const createEnvironment = () => {
    // White box
    const boxGeometry = new THREE.BoxGeometry(mapSize, mapSize, mapSize);
    const boxMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide });
    const box = new THREE.Mesh(boxGeometry, boxMaterial);
    scene.add(box);

    // Obstacles
    for (let i = 0; i < 20; i++) {
        const obstacleGeometry = new THREE.BoxGeometry(2, 4, 2);
        const obstacleMaterial = new THREE.MeshPhongMaterial({ color: 0x808080 });
        const obstacle = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
        obstacle.position.set(
            (Math.random() - 0.5) * mapSize,
            2,
            (Math.random() - 0.5) * mapSize
        );
        scene.add(obstacle);
    }
};

const createPlayer = (id, data, isMainPlayer = false) => {
    const geometry = new THREE.BoxGeometry(1, 2, 1);
    const material = new THREE.MeshPhongMaterial({ color: isMainPlayer ? 0x0000ff : 0xff0000 });
    const player = new THREE.Mesh(geometry, material);
    player.position.set(data.x, data.y, data.z);
    scene.add(player);
    players[id] = { mesh: player };
    if (isMainPlayer) {
        playerObj = player;
        camera.position.set(data.x, data.y + 1.5, data.z);
    }
};

const handleKeyDown = (event) => {
    if (!playerObj) return;
    const moveDistance = moveSpeed;
    switch (event.key) {
        case 'w':
            playerObj.position.z -= Math.cos(playerObj.rotation.y) * moveDistance;
            playerObj.position.x -= Math.sin(playerObj.rotation.y) * moveDistance;
            break;
        case 's':
            playerObj.position.z += Math.cos(playerObj.rotation.y) * moveDistance;
            playerObj.position.x += Math.sin(playerObj.rotation.y) * moveDistance;
            break;
        case 'a':
            playerObj.position.x -= Math.cos(playerObj.rotation.y) * moveDistance;
            playerObj.position.z += Math.sin(playerObj.rotation.y) * moveDistance;
            break;
        case 'd':
            playerObj.position.x += Math.cos(playerObj.rotation.y) * moveDistance;
            playerObj.position.z -= Math.sin(playerObj.rotation.y) * moveDistance;
            break;
        case ' ':
            playerObj.position.y += moveDistance; // Simple jump
            setTimeout(() => playerObj.position.y -= moveDistance, 500);
            break;
    }
    camera.position.set(playerObj.position.x, playerObj.position.y + 1.5, playerObj.position.z);
    socket.emit('move', { x: playerObj.position.x, y: playerObj.position.y, z: playerObj.position.z, rotationY: playerObj.rotation.y });
};

const handleMouseMove = (event) => {
    if (!playerObj) return;
    const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
    playerObj.rotation.y -= movementX * 0.002;
    camera.rotation.x -= movementY * 0.002;
    camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
};

const handleClick = () => {
    if (!playerObj) return;
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    socket.emit('shoot', {
        x: playerObj.position.x,
        y: playerObj.position.y + 1.5,
        z: playerObj.position.z,
        directionX: direction.x,
        directionY: direction.y,
        directionZ: direction.z
    });
};

const handleBulletFired = (data) => {
    const bulletGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    bullet.position.set(data.x, data.y, data.z);
    scene.add(bullet);

    const animate = () => {
        bullet.position.x += data.directionX * 0.5;
        bullet.position.y += data.directionY * 0.5;
        bullet.position.z += data.directionZ * 0.5;

        // Check for collisions
        Object.keys(players).forEach((id) => {
            if (id !== data.playerId) {
                const distance = bullet.position.distanceTo(players[id].mesh.position);
                if (distance < 1) {
                    scene.remove(bullet);
                    socket.emit('hit', { id: id });
                }
            }
        });

        if (scene.getObjectById(bullet.id)) {
            requestAnimationFrame(animate);
        }
    };
    animate();

    setTimeout(() => scene.remove(bullet), 2000);
};

const respawn = () => {
    const x = (Math.random() - 0.5) * mapSize;
    const z = (Math.random() - 0.5) * mapSize;
    playerObj.position.set(x, 1, z);
    camera.position.set(x, 2.5, z);
    socket.emit('move', { x, y: 1, z, rotationY: playerObj.rotation.y });
};

const animate = () => {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
};

// Wait for the DOM to load before initializing the game
document.addEventListener('DOMContentLoaded', () => {
    updateStatus('DOM loaded, initializing game');
    init();
});

console.log('Game script loaded');