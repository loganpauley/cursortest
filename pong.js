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
let energyBuffer = [];
const energyBufferSize = 1024; // Store 2 seconds of energy data at 512Hz

// Initialize audio context and BPM analyzer
async function initAudio() {
    if (audioContext) return;
    
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();
        
        source = audioContext.createMediaElementSource(backgroundMusic);
        analyzer = audioContext.createAnalyser();
        analyzer.fftSize = 1024;
        analyzer.smoothingTimeConstant = 0.85;
        
        source.connect(analyzer);
        source.connect(audioContext.destination);

        console.log('Audio context initialized:', {
            state: audioContext.state,
            sampleRate: audioContext.sampleRate
        });

        const bufferLength = analyzer.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let lastUpdateTime = audioContext.currentTime;

        function detectBPM() {
            if (!isMusicPlaying) {
                requestAnimationFrame(detectBPM);
                return;
            }

            analyzer.getByteFrequencyData(dataArray);
            
            // Calculate energy focusing on bass and low-mid frequencies (20Hz - 200Hz)
            let energy = 0;
            // Assuming 44.1kHz sample rate, each bin represents ~43Hz
            // We'll look at bins 1-5 (approximately 43Hz-215Hz)
            for (let i = 1; i < 5; i++) {
                energy += dataArray[i];
            }
            energy = energy / 4;

            // Add energy to buffer
            energyBuffer.push(energy);
            if (energyBuffer.length > energyBufferSize) {
                energyBuffer.shift();
            }

            const now = audioContext.currentTime;
            const timeSinceUpdate = now - lastUpdateTime;

            // Update BPM every 2 seconds
            if (timeSinceUpdate >= 2.0 && energyBuffer.length === energyBufferSize) {
                // Calculate BPM using autocorrelation
                const bpm = calculateBPM(energyBuffer);
                
                if (bpm > 0) {
                    // Smooth the BPM changes
                    if (currentBPM === 120) {
                        currentBPM = bpm;
                    } else {
                        currentBPM = Math.round(currentBPM * 0.7 + bpm * 0.3);
                    }
                    
                    // Constrain BPM to reasonable range
                    currentBPM = Math.max(60, Math.min(200, currentBPM));
                    
                    bpmDisplay.textContent = `BPM: ${currentBPM}`;
                    updateBallSpeed();
                    
                    console.log('BPM Update:', {
                        detectedBPM: bpm,
                        currentBPM,
                        timeSinceUpdate: timeSinceUpdate.toFixed(2)
                    });
                }
                
                lastUpdateTime = now;
            }

            requestAnimationFrame(detectBPM);
        }

        // Start BPM detection
        detectBPM();

    } catch (error) {
        console.error('Error initializing audio:', error);
    }
}

// Calculate BPM using autocorrelation
function calculateBPM(buffer) {
    const correlation = new Float32Array(buffer.length);
    
    // Calculate autocorrelation
    for (let lag = 0; lag < buffer.length; lag++) {
        let sum = 0;
        for (let i = 0; i < buffer.length - lag; i++) {
            sum += buffer[i] * buffer[i + lag];
        }
        correlation[lag] = sum;
    }
    
    // Find peaks in correlation
    const peaks = [];
    for (let i = 1; i < correlation.length - 1; i++) {
        if (correlation[i] > correlation[i - 1] && correlation[i] > correlation[i + 1]) {
            peaks.push({
                position: i,
                value: correlation[i]
            });
        }
    }
    
    // Sort peaks by correlation value
    peaks.sort((a, b) => b.value - a.value);
    
    // Find most prominent peak in the reasonable BPM range
    // Assuming 512Hz sample rate, convert peak positions to BPM
    for (const peak of peaks) {
        const bpm = Math.round(60 * 512 / peak.position);
        if (bpm >= 60 && bpm <= 200) {
            return bpm;
        }
    }
    
    return 120; // Default BPM if no valid peak found
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
                    energyBuffer = [];
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