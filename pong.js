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
let currentBPM = 69; // Known BPM of the song
let beatCount = 0;
let lastBeatTime = 0;
let lastEnergy = 0;
let peakThreshold = 0;
let valleys = 0;
let peaks = 0;
let timeWindow = 0;

// Initialize audio context and BPM analyzer
async function initAudio() {
    if (audioContext) return;
    
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();
        
        source = audioContext.createMediaElementSource(backgroundMusic);
        analyzer = audioContext.createAnalyser();
        analyzer.fftSize = 2048; // Higher resolution
        analyzer.smoothingTimeConstant = 0.9; // Smoother analysis
        
        source.connect(analyzer);
        source.connect(audioContext.destination);

        console.log('Audio context initialized:', {
            state: audioContext.state,
            sampleRate: audioContext.sampleRate
        });

        const bufferLength = analyzer.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let lastUpdateTime = audioContext.currentTime;
        let energyHistory = [];
        const historySize = 60; // 1 second of history at 60fps

        function detectBPM() {
            if (!isMusicPlaying) {
                requestAnimationFrame(detectBPM);
                return;
            }

            analyzer.getByteFrequencyData(dataArray);
            
            // Focus on bass frequencies (approximately 20-120Hz)
            let energy = 0;
            // With fftSize of 2048, each bin represents ~21.5Hz
            // We'll look at bins 1-6 (approximately 21.5Hz-129Hz)
            for (let i = 1; i < 6; i++) {
                energy += dataArray[i];
            }
            energy = energy / 5;
            
            // Keep track of energy history
            energyHistory.push(energy);
            if (energyHistory.length > historySize) {
                energyHistory.shift();
                
                // Calculate dynamic threshold
                const sorted = [...energyHistory].sort((a, b) => a - b);
                const median = sorted[Math.floor(sorted.length / 2)];
                peakThreshold = median * 1.3; // 30% above median
            }

            const now = audioContext.currentTime;
            
            // Detect beats using zero-crossing and peak detection
            if (energy > peakThreshold && energy > lastEnergy && timeWindow > 0.2) {
                beatCount++;
                timeWindow = 0;
                
                // Calculate instantaneous BPM
                const timeSinceLastBeat = now - lastBeatTime;
                if (timeSinceLastBeat > 0) {
                    const instantBPM = Math.round(60 / timeSinceLastBeat);
                    if (instantBPM >= 60 && instantBPM <= 200) { // Reasonable BPM range
                        // Weighted average favoring the known BPM
                        currentBPM = Math.round(currentBPM * 0.8 + instantBPM * 0.2);
                        bpmDisplay.textContent = `BPM: ${currentBPM}`;
                        updateBallSpeed();
                        
                        console.log('Beat detected:', {
                            instantBPM,
                            currentBPM,
                            energy: Math.round(energy),
                            threshold: Math.round(peakThreshold)
                        });
                    }
                }
                lastBeatTime = now;
            }
            
            lastEnergy = energy;
            timeWindow += 1/60; // Assuming 60fps

            requestAnimationFrame(detectBPM);
        }

        detectBPM();

    } catch (error) {
        console.error('Error initializing audio:', error);
    }
}

// Music controls
async function toggleMusic() {
    try {
        console.log('Toggle music clicked, current state:', {
            isPlaying: isMusicPlaying,
            audioContext: audioContext ? audioContext.state : 'not created'
        });

        // Initialize audio context on first click
        if (!audioContext) {
            await initAudio();
        }

        if (isMusicPlaying) {
            await backgroundMusic.pause();
            musicToggle.textContent = '🔇 Music Off';
            isMusicPlaying = false;
            bpmDisplay.textContent = 'BPM: --';
        } else {
            try {
                // Make sure audio context is running
                if (audioContext.state === 'suspended') {
                    await audioContext.resume();
                }
                
                // Try to play the music
                const playPromise = backgroundMusic.play();
                if (playPromise !== undefined) {
                    await playPromise;
                    musicToggle.textContent = '🔊 Music On';
                    isMusicPlaying = true;
                    beatCount = 0;
                    lastBeatTime = audioContext.currentTime;
                    console.log('Music started successfully');
                }
            } catch (playError) {
                console.error('Error playing music:', playError);
                // Reset state if play fails
                isMusicPlaying = false;
                musicToggle.textContent = '🔇 Music Off';
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
    // Halve the speed multiplier
    const normalizedBPM = currentBPM / 120;
    const speedMultiplier = Math.max(0.25, Math.min(1.0, Math.pow(normalizedBPM, 0.7) * 0.5));
    ball.speed = baseBallSpeed * speedMultiplier;
    
    // Maintain direction while updating speed
    const currentDxSign = Math.sign(ball.dx);
    const currentDySign = Math.sign(ball.dy);
    ball.dx = ball.speed * currentDxSign;
    ball.dy = ball.speed * currentDySign;
    
    console.log(`Current BPM: ${currentBPM}, Ball Speed: ${ball.speed.toFixed(2)} (${(speedMultiplier * 100).toFixed(1)}% of base speed)`);
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