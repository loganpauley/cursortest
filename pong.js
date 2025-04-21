// Get the canvas and context
const canvas = document.getElementById('pongCanvas');
const ctx = canvas.getContext('2d');

// Audio elements and context
const backgroundMusic = document.getElementById('backgroundMusic');
const volumeSlider = document.getElementById('volumeSlider');
const musicToggle = document.getElementById('musicToggle');
const bpmDisplay = document.getElementById('bpmDisplay');
let isMusicPlaying = false;

// Audio context and BPM analyzer setup
let audioContext = null;
let analyzer = null;
let source = null;
const baseBallSpeed = 5;
let currentBPM = 120; // Default BPM
let beatCount = 0;
let lastBeatTime = 0;
let measureStartTime = 0;

// Initialize audio context and BPM analyzer
async function initAudio() {
    if (audioContext) return; // Don't initialize if already exists
    
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        source = audioContext.createMediaElementSource(backgroundMusic);
        
        // Create analyzer node
        analyzer = audioContext.createAnalyser();
        analyzer.fftSize = 256; // Increased for better frequency resolution
        analyzer.smoothingTimeConstant = 0.4;
        
        // Connect nodes
        source.connect(analyzer);
        source.connect(audioContext.destination);

        // Process audio data for BPM
        const bufferLength = analyzer.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let lastUpdateTime = audioContext.currentTime;
        let energyHistory = [];
        const historySize = 10;
        
        function detectBPM() {
            if (!isMusicPlaying) {
                requestAnimationFrame(detectBPM);
                return;
            }

            analyzer.getByteFrequencyData(dataArray);
            
            // Focus on bass frequencies (first 6 bins)
            let bassEnergy = 0;
            for (let i = 0; i < 6; i++) {
                bassEnergy += dataArray[i];
            }
            bassEnergy = bassEnergy / 6;
            
            // Keep track of energy history
            energyHistory.push(bassEnergy);
            if (energyHistory.length > historySize) {
                energyHistory.shift();
            }
            
            // Calculate average energy
            const avgEnergy = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length;
            
            const now = audioContext.currentTime;
            const timeSinceUpdate = now - lastUpdateTime;
            
            // Update BPM more frequently (every 0.5 seconds)
            if (timeSinceUpdate >= 0.5) {
                // Calculate BPM based on beat count
                if (beatCount > 0) {
                    currentBPM = Math.round(beatCount * (120 / timeSinceUpdate));
                    
                    // Constrain BPM to reasonable range
                    currentBPM = Math.max(60, Math.min(200, currentBPM));
                    
                    // Update display
                    bpmDisplay.textContent = `BPM: ${currentBPM}`;
                    updateBallSpeed();
                    
                    console.log('BPM Update:', {
                        currentBPM,
                        beatCount,
                        timeSinceUpdate: timeSinceUpdate.toFixed(2),
                        bassEnergy: bassEnergy.toFixed(2),
                        avgEnergy: avgEnergy.toFixed(2)
                    });
                }
                
                // Reset for next measurement
                beatCount = 0;
                lastUpdateTime = now;
            }

            // Detect beat when bass energy is significantly above average
            if (bassEnergy > avgEnergy * 1.2) { // 20% above average
                const timeSinceLastBeat = now - lastBeatTime;
                if (timeSinceLastBeat > 0.2) { // Minimum time between beats
                    beatCount++;
                    lastBeatTime = now;
                    
                    console.log('Beat detected:', {
                        bassEnergy: bassEnergy.toFixed(2),
                        avgEnergy: avgEnergy.toFixed(2),
                        beatCount
                    });
                }
            }

            requestAnimationFrame(detectBPM);
        }

        // Start BPM detection when music plays
        backgroundMusic.addEventListener('play', () => {
            console.log('Music started playing');
            beatCount = 0;
            lastBeatTime = audioContext.currentTime;
            lastUpdateTime = audioContext.currentTime;
            energyHistory = [];
            detectBPM();
        });

    } catch (error) {
        console.error('Error initializing audio:', error);
    }
}

// Music controls
async function toggleMusic() {
    try {
        console.log('Toggle music clicked');
        
        // Initialize audio context on first click
        if (!audioContext) {
            console.log('Initializing audio context');
            await initAudio();
        }

        if (isMusicPlaying) {
            console.log('Pausing music');
            await backgroundMusic.pause();
            musicToggle.textContent = '🔇 Music Off';
            isMusicPlaying = false;
            bpmDisplay.textContent = 'BPM: --';
            currentBPM = 120; // Reset to default
        } else {
            console.log('Starting music');
            // Resume audio context if it's suspended
            if (audioContext && audioContext.state === 'suspended') {
                console.log('Resuming audio context');
                await audioContext.resume();
            }
            try {
                await backgroundMusic.play();
                console.log('Music started successfully');
                musicToggle.textContent = '🔊 Music On';
                isMusicPlaying = true;
                beatCount = 0;
                lastBeatTime = audioContext.currentTime;
            } catch (playError) {
                console.error('Error playing music:', playError);
            }
        }
    } catch (error) {
        console.error('Error toggling music:', error);
    }
}

// Add click event listener to music toggle button
musicToggle.addEventListener('click', toggleMusic);

// Volume control
volumeSlider.addEventListener('input', (e) => {
    backgroundMusic.volume = e.target.value;
});

// Initialize volume
backgroundMusic.volume = volumeSlider.value;

// Game objects
const ball = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: 10,
    speed: baseBallSpeed,
    dx: baseBallSpeed,
    dy: baseBallSpeed
};

function updateBallSpeed() {
    if (!currentBPM || currentBPM < 40) {
        currentBPM = 120; // Default BPM if not detected
    }
    
    // Scale ball speed based on BPM (120 BPM is considered "normal" speed)
    // Use a more gradual scaling function
    const normalizedBPM = currentBPM / 120;
    const speedMultiplier = Math.max(0.5, Math.min(2, Math.pow(normalizedBPM, 0.7)));
    ball.speed = baseBallSpeed * speedMultiplier;
    
    // Maintain direction while updating speed
    const currentDxSign = Math.sign(ball.dx);
    const currentDySign = Math.sign(ball.dy);
    ball.dx = ball.speed * currentDxSign;
    ball.dy = ball.speed * currentDySign;
    
    console.log(`Current BPM: ${currentBPM}, Ball Speed: ${ball.speed.toFixed(2)}`);
}

const paddleHeight = 100;
const paddleWidth = 10;
const player = {
    y: canvas.height / 2 - paddleHeight / 2,
    score: 0
};
const computer = {
    y: canvas.height / 2 - paddleHeight / 2,
    score: 0
};

// Game controls
let upPressed = false;
let downPressed = false;

// Event listeners for paddle control
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') upPressed = true;
    if (e.key === 'ArrowDown') downPressed = true;
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp') upPressed = false;
    if (e.key === 'ArrowDown') downPressed = false;
});

// Draw functions
function drawBall() {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.closePath();
}

function drawPaddle(x, y) {
    ctx.fillStyle = 'white';
    ctx.fillRect(x, y, paddleWidth, paddleHeight);
}

function drawScore() {
    ctx.fillStyle = 'white';
    ctx.font = '32px Arial';
    ctx.fillText(player.score, canvas.width / 4, 50);
    ctx.fillText(computer.score, 3 * canvas.width / 4, 50);
}

// Game logic
function movePaddles() {
    // Player paddle movement
    if (upPressed && player.y > 0) {
        player.y -= 7;
    }
    if (downPressed && player.y + paddleHeight < canvas.height) {
        player.y += 7;
    }

    // Simple AI for computer paddle
    const computerSpeed = 5;
    const computerCenter = computer.y + paddleHeight / 2;
    if (computerCenter < ball.y - 35) {
        computer.y += computerSpeed;
    } else if (computerCenter > ball.y + 35) {
        computer.y -= computerSpeed;
    }
}

function moveBall() {
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Top and bottom collisions
    if (ball.y + ball.radius > canvas.height || ball.y - ball.radius < 0) {
        ball.dy *= -1;
    }

    // Paddle collisions
    if (ball.dx < 0) {
        // Player paddle collision
        if (ball.x - ball.radius < paddleWidth &&
            ball.y > player.y &&
            ball.y < player.y + paddleHeight) {
            ball.dx *= -1;
        }
    } else {
        // Computer paddle collision
        if (ball.x + ball.radius > canvas.width - paddleWidth &&
            ball.y > computer.y &&
            ball.y < computer.y + paddleHeight) {
            ball.dx *= -1;
        }
    }

    // Scoring
    if (ball.x + ball.radius > canvas.width) {
        player.score++;
        resetBall();
    } else if (ball.x - ball.radius < 0) {
        computer.score++;
        resetBall();
    }
}

function resetBall() {
    ball.x = canvas.width / 2;
    ball.y = canvas.height / 2;
    ball.dx = ball.speed * (Math.random() > 0.5 ? 1 : -1);
    ball.dy = ball.speed * (Math.random() * 2 - 1);
}

// Main game loop
function gameLoop() {
    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw everything
    drawBall();
    drawPaddle(0, player.y);
    drawPaddle(canvas.width - paddleWidth, computer.y);
    drawScore();

    // Update game state
    movePaddles();
    moveBall();

    // Continue game loop
    requestAnimationFrame(gameLoop);
}

// Start the game
gameLoop(); 