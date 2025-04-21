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
let peakTimes = []; // Store peak times for BPM calculation

// Initialize audio context and BPM analyzer
async function initAudio() {
    if (audioContext) return; // Don't initialize if already exists
    
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        source = audioContext.createMediaElementSource(backgroundMusic);
        
        // Create analyzer node
        analyzer = audioContext.createAnalyser();
        analyzer.fftSize = 256; // Even smaller for better responsiveness
        analyzer.smoothingTimeConstant = 0.3; // More responsive to changes
        
        // Connect nodes
        source.connect(analyzer);
        source.connect(audioContext.destination);

        // Process audio data for BPM
        const bufferLength = analyzer.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let lastPeakTime = 0;
        let energyThreshold = 0;
        let lastEnergy = 0;
        let frameCount = 0;
        
        function detectBPM() {
            if (!isMusicPlaying) {
                requestAnimationFrame(detectBPM);
                return;
            }
            
            analyzer.getByteFrequencyData(dataArray);
            
            // Calculate energy focusing on bass frequencies (first quarter of frequency data)
            let energy = 0;
            const bassRange = Math.floor(bufferLength / 4);
            for (let i = 0; i < bassRange; i++) {
                energy += dataArray[i];
            }
            energy = energy / bassRange;

            // Initialize threshold if needed
            if (energyThreshold === 0) {
                energyThreshold = energy;
            }

            // Dynamic threshold with faster adaptation
            energyThreshold = energyThreshold * 0.8 + energy * 0.2;

            // Debug info every 60 frames
            frameCount++;
            if (frameCount % 60 === 0) {
                console.log('Audio Analysis:', {
                    energy: energy.toFixed(2),
                    threshold: energyThreshold.toFixed(2),
                    peakCount: peakTimes.length,
                    currentBPM: currentBPM
                });
            }

            // More sensitive beat detection
            const now = audioContext.currentTime;
            if (energy > energyThreshold * 1.2 && energy > lastEnergy && now - lastPeakTime > 0.2) {
                peakTimes.push(now);
                lastPeakTime = now;

                // Keep only the last 3 seconds of peaks for faster BPM updates
                const threeSecondsAgo = now - 3;
                peakTimes = peakTimes.filter(time => time > threeSecondsAgo);

                // Calculate BPM with at least 2 peaks
                if (peakTimes.length >= 2) {
                    const intervals = [];
                    for (let i = 1; i < peakTimes.length; i++) {
                        intervals.push(peakTimes[i] - peakTimes[i - 1]);
                    }

                    // Calculate average interval
                    const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
                    if (avgInterval > 0) {
                        const calculatedBPM = Math.round(60 / avgInterval);
                        
                        // Smooth BPM changes
                        if (currentBPM === 120) { // First valid reading
                            currentBPM = calculatedBPM;
                        } else {
                            currentBPM = Math.round(currentBPM * 0.7 + calculatedBPM * 0.3);
                        }
                        
                        // Constrain BPM to reasonable range (40-200 BPM)
                        currentBPM = Math.max(40, Math.min(200, currentBPM));
                        
                        // Update display and ball speed
                        bpmDisplay.textContent = `BPM: ${currentBPM}`;
                        updateBallSpeed();
                        
                        console.log('Beat detected!', {
                            calculatedBPM,
                            currentBPM,
                            peakCount: peakTimes.length
                        });
                    }
                }
            }
            
            lastEnergy = energy;
            requestAnimationFrame(detectBPM);
        }

        // Start BPM detection when music plays
        backgroundMusic.addEventListener('play', () => {
            console.log('Music started playing');
            peakTimes = [];
            lastPeakTime = audioContext.currentTime;
            energyThreshold = 0;
            frameCount = 0;
            detectBPM();
        });

        // Also start detection if music is already playing
        if (backgroundMusic.played.length > 0 && !backgroundMusic.paused) {
            console.log('Music was already playing');
            peakTimes = [];
            lastPeakTime = audioContext.currentTime;
            energyThreshold = 0;
            frameCount = 0;
            detectBPM();
        }

    } catch (error) {
        console.error('Error initializing audio:', error);
    }
}

// Music controls
async function toggleMusic() {
    try {
        // Initialize audio context on first click
        if (!audioContext) {
            await initAudio();
        }

        if (isMusicPlaying) {
            await backgroundMusic.pause();
            musicToggle.textContent = '🔇 Music Off';
            isMusicPlaying = false;
        } else {
            // Resume audio context if it's suspended
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            await backgroundMusic.play();
            musicToggle.textContent = '🔊 Music On';
            isMusicPlaying = true;
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