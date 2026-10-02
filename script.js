(() => {
  'use strict';

  const WIDTH = 960;
  const HEIGHT = 540;
  const GROUND_Y = 424;
  const PLAYER_X = 154;
  const GRAVITY = 1780;
  const JUMP_VELOCITY = -690;
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('game-stage');
  const scoreValue = document.getElementById('score-value');
  const coinValue = document.getElementById('coin-value');
  const bestValue = document.getElementById('best-value');
  const distanceLabel = document.getElementById('distance-label');
  const statusLabel = document.getElementById('status-label');
  const overlay = document.getElementById('game-overlay');
  const startPanel = document.getElementById('start-panel');
  const pausePanel = document.getElementById('pause-panel');
  const gameoverPanel = document.getElementById('gameover-panel');
  const pauseButton = document.getElementById('pause-button');
  const soundButton = document.getElementById('sound-button');
  const jumpButton = document.getElementById('jump-button');
  const finalScore = document.getElementById('final-score');
  const finalCoins = document.getElementById('final-coins');
  const newRecord = document.getElementById('new-record');

  let state = 'ready';
  let lastTime = 0;
  let elapsed = 0;
  let score = 0;
  let coinsCollected = 0;
  let bestScore = readBestScore();
  let speed = 330;
  let obstacleTimer = 1.05;
  let coinTimer = 1.1;
  let groundOffset = 0;
  let cloudOffset = 0;
  let mountainOffset = 0;
  let foregroundOffset = 0;
  let ambientTime = 0;
  let dustTimer = 0;
  let soundEnabled = true;
  let audioContext = null;
  let musicTimer = null;
  let musicStep = 0;
  let wasNewRecord = false;
  let obstacles = [];
  let coins = [];
  let particles = [];
  let floatTexts = [];
  let player = { y: GROUND_Y, vy: 0, onGround: true, runTime: 0, squash: 0 };

  bestValue.textContent = formatScore(bestScore);
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  if ('ResizeObserver' in window) new ResizeObserver(resizeCanvas).observe(stage);

  document.getElementById('start-button').addEventListener('click', startGame);
  document.getElementById('resume-button').addEventListener('click', resumeGame);
  document.getElementById('pause-restart-button').addEventListener('click', startGame);
  document.getElementById('play-again-button').addEventListener('click', startGame);
  pauseButton.addEventListener('click', togglePause);
  soundButton.addEventListener('click', toggleSound);
  jumpButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    jump();
  });

  stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    if (state === 'ready') startGame();
    else if (state === 'running') jump();
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code === 'ArrowUp') {
      event.preventDefault();
      if (state === 'ready') startGame();
      else if (state === 'running' && !event.repeat) jump();
    } else if ((event.code === 'KeyP' || event.code === 'Escape') && !event.repeat) {
      event.preventDefault();
      togglePause();
    }
  });

  // Scale the fixed game world to the responsive canvas without changing physics.
  function resizeCanvas() {
    const bounds = stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(bounds.width * pixelRatio);
    canvas.height = Math.round(bounds.height * pixelRatio);
    ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
    draw();
  }

  function readBestScore() {
    try { return Number(localStorage.getItem('sunnySprintBest')) || 0; }
    catch { return 0; }
  }

  function saveBestScore(value) {
    try { localStorage.setItem('sunnySprintBest', String(value)); }
    catch { /* The run still works when browser storage is unavailable. */ }
  }

  function formatScore(value) {
    return String(Math.floor(value)).padStart(5, '0');
  }

  function showPanel(panel) {
    overlay.classList.remove('is-hidden');
    startPanel.hidden = panel !== startPanel;
    pausePanel.hidden = panel !== pausePanel;
    gameoverPanel.hidden = panel !== gameoverPanel;
  }

  function hidePanel() {
    overlay.classList.add('is-hidden');
  }

  function startGame() {
    elapsed = 0;
    score = 0;
    coinsCollected = 0;
    speed = 330;
    obstacleTimer = 1.15;
    coinTimer = .9;
    groundOffset = 0;
    cloudOffset = 0;
    mountainOffset = 0;
    foregroundOffset = 0;
    ambientTime = 0;
    dustTimer = 0;
    obstacles = [];
    coins = [];
    particles = [];
    floatTexts = [];
    player = { y: GROUND_Y, vy: 0, onGround: true, runTime: 0, squash: 0 };
    updateHud();
    state = 'running';
    pauseButton.disabled = false;
    pauseButton.setAttribute('aria-label', 'Pause game');
    pauseButton.title = 'Pause (P)';
    distanceLabel.textContent = 'LET’S GO!';
    statusLabel.textContent = 'You’re on a roll';
    hidePanel();
    lastTime = performance.now();
    ensureAudio();
    startMusic();
    requestAnimationFrame(gameLoop);
  }

  function pauseGame() {
    if (state !== 'running') return;
    state = 'paused';
    stopMusic();
    pauseButton.setAttribute('aria-label', 'Resume game');
    pauseButton.title = 'Resume (P)';
    distanceLabel.textContent = 'TIME FOR A BREATHER';
    statusLabel.textContent = 'Run paused';
    showPanel(pausePanel);
    draw();
  }

  function resumeGame() {
    if (state !== 'paused') return;
    state = 'running';
    pauseButton.setAttribute('aria-label', 'Pause game');
    pauseButton.title = 'Pause (P)';
    distanceLabel.textContent = 'NICE AND EASY';
    statusLabel.textContent = 'You’re on a roll';
    hidePanel();
    lastTime = performance.now();
    startMusic();
    requestAnimationFrame(gameLoop);
  }

  function togglePause() {
    if (state === 'running') pauseGame();
    else if (state === 'paused') resumeGame();
  }

  function jump() {
    if (state !== 'running' || !player.onGround) return;
    player.vy = JUMP_VELOCITY;
    player.onGround = false;
    player.squash = .12;
    spawnParticles(PLAYER_X + 36, GROUND_Y - 3, '#fff3b1', 7, 125);
    playTone(430, .09, 'sine', .055, 680);
  }

  function endGame() {
    if (state !== 'running') return;
    state = 'gameover';
    stopMusic();
    wasNewRecord = score > bestScore;
    if (wasNewRecord) {
      bestScore = score;
      saveBestScore(bestScore);
      bestValue.textContent = formatScore(bestScore);
    }
    pauseButton.disabled = true;
    distanceLabel.textContent = 'RUN COMPLETE';
    statusLabel.textContent = 'Every run makes you faster';
    finalScore.textContent = formatScore(score);
    finalCoins.textContent = String(coinsCollected);
    newRecord.hidden = !wasNewRecord;
    showPanel(gameoverPanel);
    playTone(280, .2, 'triangle', .07, 120);
    draw();
  }

  function updateHud() {
    scoreValue.textContent = formatScore(score);
    coinValue.textContent = String(coinsCollected);
    bestValue.textContent = formatScore(bestScore);
  }

  function gameLoop(now) {
    if (state !== 'running') return;
    const delta = Math.min((now - lastTime) / 1000, .035);
    lastTime = now;
    update(delta);
    draw();
    if (state === 'running') requestAnimationFrame(gameLoop);
  }

  // Advance movement, spawn timers, animation and collisions using a clamped delta.
  function update(delta) {
    elapsed += delta;
    speed = Math.min(330 + elapsed * 8.5, 690);
    score += delta * (12 + elapsed * .08);
    groundOffset = (groundOffset + speed * delta) % 80;
    cloudOffset = (cloudOffset + speed * delta * .08) % 1100;
    mountainOffset = (mountainOffset + speed * delta * .025) % 1400;
    foregroundOffset = (foregroundOffset + speed * delta * .42) % 1120;
    ambientTime += delta;
    player.runTime += delta * (8 + speed / 100);
    player.squash = Math.max(0, player.squash - delta * 2.5);

    dustTimer -= delta;
    if (player.onGround && dustTimer <= 0) {
      spawnParticles(PLAYER_X + 13, GROUND_Y - 4, 'rgba(255, 250, 222, .8)', 2, 24);
      dustTimer = .14;
    }

    if (!player.onGround) {
      player.vy += GRAVITY * delta;
      player.y += player.vy * delta;
      if (player.y >= GROUND_Y) {
        player.y = GROUND_Y;
        player.vy = 0;
        player.onGround = true;
        player.squash = .18;
        spawnParticles(PLAYER_X + 34, GROUND_Y - 2, '#f9f3c5', 6, 90);
      }
    }

    obstacleTimer -= delta;
    if (obstacleTimer <= 0) {
      spawnObstacle();
      obstacleTimer = Math.max(1.02, 1.48 - elapsed * .008) + Math.random() * .55;
    }

    coinTimer -= delta;
    if (coinTimer <= 0) {
      spawnCoinGroup();
      coinTimer = 1.3 + Math.random() * 1.25;
    }

    for (const obstacle of obstacles) obstacle.x -= speed * delta;
    for (const coin of coins) coin.x -= speed * delta;
    obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.w > -30);

    for (const coin of coins) {
      coin.phase += delta * 7;
      if (!coin.collected && intersects(playerBounds(), coinBounds(coin))) {
        coin.collected = true;
        coinsCollected += 1;
        score += 25;
        spawnParticles(coin.x + coin.r, coin.y, '#ffd34d', 12, 170);
        floatTexts.push({ x: coin.x, y: coin.y - 8, life: .7, text: '+25' });
        playBell();
      }
    }
    coins = coins.filter((coin) => !coin.collected && coin.x + coin.r > -20);

    for (const obstacle of obstacles) {
      if (intersects(playerBounds(), obstacleBounds(obstacle))) {
        endGame();
        break;
      }
    }

    for (const particle of particles) {
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += particle.gravity * delta;
      particle.life -= delta;
    }
    particles = particles.filter((particle) => particle.life > 0);
    for (const text of floatTexts) {
      text.y -= 35 * delta;
      text.life -= delta;
    }
    floatTexts = floatTexts.filter((text) => text.life > 0);

    scoreValue.textContent = formatScore(score);
    coinValue.textContent = String(coinsCollected);
    distanceLabel.textContent = `${Math.floor(elapsed * speed / 10)} M DOWN THE TRAIL`;
  }

  function spawnObstacle() {
    const roll = Math.random();
    let type;
    if (roll < .36) type = 'rock';
    else if (roll < .69) type = 'crate';
    else type = 'cactus';
    const size = type === 'rock' ? { w: 52, h: 36 } : type === 'crate' ? { w: 48, h: 48 } : { w: 38, h: 62 };
    obstacles.push({ type, x: WIDTH + 35, y: GROUND_Y - size.h, ...size, seed: Math.random() * 10 });
  }

  function spawnCoinGroup() {
    const count = 3 + Math.floor(Math.random() * 3);
    const baseY = 300 + Math.random() * 50;
    const arc = Math.random() < .55;
    for (let index = 0; index < count; index += 1) {
      const lift = arc ? Math.sin((index / Math.max(1, count - 1)) * Math.PI) * 48 : 0;
      coins.push({ x: WIDTH + 35 + index * 43, y: baseY - lift, r: 13, phase: Math.random() * Math.PI * 2, collected: false });
    }
  }

  function playerBounds() {
    const runBounce = player.onGround ? Math.abs(Math.sin(player.runTime * 2)) * 3 : 0;
    return { x: PLAYER_X + 12, y: player.y - 72 - runBounce, w: 43, h: 64 };
  }

  function obstacleBounds(obstacle) {
    if (obstacle.type === 'rock') return { x: obstacle.x + 8, y: obstacle.y + 8, w: obstacle.w - 16, h: obstacle.h - 10 };
    if (obstacle.type === 'cactus') return { x: obstacle.x + 9, y: obstacle.y + 4, w: obstacle.w - 18, h: obstacle.h - 5 };
    return { x: obstacle.x + 5, y: obstacle.y + 5, w: obstacle.w - 10, h: obstacle.h - 8 };
  }

  function coinBounds(coin) {
    return { x: coin.x + 2, y: coin.y + 2, w: coin.r * 2 - 4, h: coin.r * 2 - 4 };
  }

  function intersects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function spawnParticles(x, y, color, count, force) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = force * (.3 + Math.random() * .7);
      particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity - force * .25, gravity: 260, life: .32 + Math.random() * .45, maxLife: .77, size: 2 + Math.random() * 4, color });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawSky();
    drawClouds();
    drawBirds();
    drawMountains();
    drawCastle();
    drawHills();
    drawRiver();
    drawFarTrees();
    drawGround();
    for (const coin of coins) drawCoin(coin);
    for (const obstacle of obstacles) drawObstacle(obstacle);
    drawPlayer();
    drawEffects();
  }

  function drawSky() {
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, '#a8e5f5');
    sky.addColorStop(.61, '#d9f6ef');
    sky.addColorStop(1, '#eaf7ce');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const glow = ctx.createRadialGradient(760, 98, 6, 760, 98, 83);
    glow.addColorStop(0, 'rgba(255, 246, 177, .78)');
    glow.addColorStop(1, 'rgba(255, 246, 177, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(650, 0, 220, 205);
    ctx.fillStyle = '#fff0a4';
    ctx.beginPath();
    ctx.arc(760, 98, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.34)';
    ctx.beginPath();
    ctx.arc(750, 87, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawClouds() {
    const clouds = [{ x: 115, y: 116, scale: .82 }, { x: 480, y: 81, scale: .68 }, { x: 850, y: 151, scale: .95 }, { x: 1130, y: 94, scale: .65 }];
    for (const cloud of clouds) {
      let x = (cloud.x - cloudOffset + 1200) % 1200 - 110;
      ctx.save();
      ctx.translate(x, cloud.y);
      ctx.scale(cloud.scale, cloud.scale);
      ctx.fillStyle = 'rgba(255,255,255,.74)';
      ctx.beginPath();
      ctx.ellipse(0, 13, 47, 13, 0, 0, Math.PI * 2);
      ctx.arc(-19, 8, 17, Math.PI, Math.PI * 2);
      ctx.arc(0, 0, 23, Math.PI, Math.PI * 2);
      ctx.arc(22, 8, 17, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawBirds() {
    const flock = [{ x: 190, y: 191, scale: .75 }, { x: 390, y: 142, scale: 1 }, { x: 790, y: 212, scale: .65 }];
    ctx.strokeStyle = 'rgba(52, 111, 128, .72)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (const bird of flock) {
      const x = (bird.x + ambientTime * 26) % 1120 - 65;
      const flap = Math.sin(ambientTime * 8 + bird.x) * 4;
      ctx.save();
      ctx.translate(x, bird.y + Math.sin(ambientTime * 2 + bird.x) * 3);
      ctx.scale(bird.scale, bird.scale);
      ctx.beginPath();
      ctx.moveTo(-11, flap);
      ctx.quadraticCurveTo(-5, -6 - flap, 0, 0);
      ctx.quadraticCurveTo(6, -7 - flap, 12, flap);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawMountains() {
    const offset = mountainOffset;
    ctx.fillStyle = '#8dbad0';
    ctx.beginPath();
    ctx.moveTo(-100, 323);
    ctx.lineTo(-100, 285);
    ctx.lineTo(100, 205);
    ctx.lineTo(220, 284);
    ctx.lineTo(385, 174);
    ctx.lineTo(555, 294);
    ctx.lineTo(714, 196);
    ctx.lineTo(900, 301);
    ctx.lineTo(1080, 218);
    ctx.lineTo(1160, 277);
    ctx.lineTo(1160, 350);
    ctx.closePath();
    ctx.save();
    ctx.translate(-offset * .32, 0);
    ctx.fill();
    ctx.translate(1400, 0);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(-offset * .32, 0);
    for (const peak of [{ x: 385, y: 174, size: 53 }, { x: 714, y: 196, size: 43 }, { x: 100, y: 205, size: 33 }]) {
      ctx.fillStyle = 'rgba(247, 255, 250, .82)';
      ctx.beginPath();
      ctx.moveTo(peak.x - peak.size, peak.y + peak.size * 1.08);
      ctx.lineTo(peak.x, peak.y);
      ctx.lineTo(peak.x + peak.size, peak.y + peak.size * 1.08);
      ctx.lineTo(peak.x + 13, peak.y + peak.size * .78);
      ctx.lineTo(peak.x, peak.y + peak.size * .9);
      ctx.lineTo(peak.x - 14, peak.y + peak.size * .72);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCastle() {
    const x = ((820 - mountainOffset * .55) % 1450 + 1450) % 1450 - 160;
    const base = 329;
    ctx.save();
    ctx.globalAlpha = .86;
    ctx.fillStyle = '#efd5ae';
    roundedRect(x, base - 37, 82, 42, 3);
    ctx.fill();
    ctx.fillStyle = '#d29b78';
    roundedRect(x - 12, base - 58, 25, 63, 4);
    ctx.fill();
    roundedRect(x + 68, base - 52, 25, 57, 4);
    ctx.fill();
    ctx.fillStyle = '#c97968';
    ctx.beginPath();
    ctx.moveTo(x - 17, base - 57);
    ctx.lineTo(x, base - 78);
    ctx.lineTo(x + 18, base - 57);
    ctx.closePath();
    ctx.moveTo(x + 63, base - 51);
    ctx.lineTo(x + 80, base - 72);
    ctx.lineTo(x + 98, base - 51);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f8e7c8';
    roundedRect(x + 29, base - 64, 24, 69, 5);
    ctx.fill();
    ctx.fillStyle = '#b97066';
    ctx.beginPath();
    ctx.moveTo(x + 25, base - 63);
    ctx.lineTo(x + 41, base - 87);
    ctx.lineTo(x + 57, base - 63);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#88c6c1';
    for (const windowX of [x - 4, x + 35, x + 76]) {
      roundedRect(windowX, base - 37, 8, 13, 4);
      ctx.fill();
    }
    ctx.strokeStyle = '#738fa0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 41, base - 87);
    ctx.lineTo(x + 41, base - 101);
    ctx.stroke();
    ctx.fillStyle = '#ef716b';
    ctx.beginPath();
    ctx.moveTo(x + 42, base - 100);
    ctx.lineTo(x + 58, base - 96);
    ctx.lineTo(x + 42, base - 90);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawHills() {
    ctx.fillStyle = '#b4e4a1';
    ctx.beginPath();
    ctx.moveTo(0, 317);
    for (let x = 0; x <= WIDTH; x += 5) {
      const y = 304 + Math.sin((x + cloudOffset * .2) / 105) * 16 + Math.sin((x + 60) / 52) * 7;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(WIDTH, GROUND_Y);
    ctx.lineTo(0, GROUND_Y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#8dce8f';
    ctx.beginPath();
    ctx.moveTo(0, 357);
    for (let x = 0; x <= WIDTH; x += 5) {
      const y = 354 + Math.sin((x + cloudOffset * .42) / 89) * 18 + Math.sin(x / 43) * 6;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(WIDTH, GROUND_Y);
    ctx.lineTo(0, GROUND_Y);
    ctx.closePath();
    ctx.fill();
  }

  function drawRiver() {
    const shimmer = .5 + Math.sin(ambientTime * 3) * .12;
    ctx.save();
    ctx.fillStyle = '#6cc7dd';
    ctx.beginPath();
    ctx.moveTo(627, 274);
    ctx.bezierCurveTo(615, 300, 639, 321, 624, 348);
    ctx.bezierCurveTo(615, 368, 581, 377, 579, 397);
    ctx.bezierCurveTo(578, 410, 608, 417, 640, 424);
    ctx.lineTo(777, 424);
    ctx.bezierCurveTo(723, 406, 675, 397, 674, 384);
    ctx.bezierCurveTo(673, 367, 704, 356, 705, 337);
    ctx.bezierCurveTo(706, 315, 671, 297, 675, 274);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(220, 255, 250, ${shimmer})`;
    ctx.beginPath();
    ctx.moveTo(638, 281);
    ctx.bezierCurveTo(629, 306, 649, 323, 635, 349);
    ctx.bezierCurveTo(627, 367, 600, 379, 595, 396);
    ctx.strokeStyle = 'rgba(229, 255, 251, .8)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  function drawFarTrees() {
    for (let index = 0; index < 10; index += 1) {
      const x = ((index * 142 - foregroundOffset) % 1120 + 1120) % 1120 - 70;
      const base = 387 + Math.sin(index * 2.2) * 7;
      ctx.fillStyle = '#70b987';
      ctx.fillRect(x - 3, base - 33, 6, 34);
      ctx.beginPath();
      ctx.arc(x, base - 44, 18, 0, Math.PI * 2);
      ctx.arc(x - 11, base - 34, 12, 0, Math.PI * 2);
      ctx.arc(x + 12, base - 35, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      ctx.beginPath();
      ctx.arc(x - 5, base - 49, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGround() {
    ctx.fillStyle = '#65b875';
    ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);
    ctx.fillStyle = '#83cd78';
    ctx.fillRect(0, GROUND_Y, WIDTH, 8);
    ctx.fillStyle = '#4b9f69';
    ctx.fillRect(0, GROUND_Y + 8, WIDTH, 4);

    for (let x = -groundOffset; x < WIDTH + 80; x += 80) {
      ctx.fillStyle = 'rgba(255,255,255,.19)';
      roundedRect(x + 12, GROUND_Y + 26, 27, 6, 3);
      roundedRect(x + 48, GROUND_Y + 48, 14, 4, 2);
      ctx.fillStyle = 'rgba(39,126,79,.18)';
      ctx.beginPath();
      ctx.ellipse(x + 65, GROUND_Y + 19, 3, 7, -.5, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let x = -groundOffset; x < WIDTH + 110; x += 120) {
      const sway = Math.sin(ambientTime * 5 + x * .08) * 3;
      ctx.strokeStyle = '#388f61';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 82, GROUND_Y + 8);
      ctx.quadraticCurveTo(x + 79 + sway, GROUND_Y - 1, x + 76 + sway, GROUND_Y - 7);
      ctx.moveTo(x + 82, GROUND_Y + 8);
      ctx.quadraticCurveTo(x + 86 - sway, GROUND_Y, x + 90 - sway, GROUND_Y - 5);
      ctx.stroke();
      ctx.fillStyle = '#ff8a78';
      ctx.beginPath();
      ctx.arc(x + 76 + sway, GROUND_Y - 8, 2.4, 0, Math.PI * 2);
      ctx.arc(x + 90 - sway, GROUND_Y - 6, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd05b';
      ctx.beginPath();
      ctx.arc(x + 76 + sway, GROUND_Y - 8, 1, 0, Math.PI * 2);
      ctx.arc(x + 90 - sway, GROUND_Y - 6, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlayer() {
    const run = player.onGround ? Math.sin(player.runTime * 2) : -.25;
    const bounce = player.onGround ? Math.abs(Math.sin(player.runTime * 2)) * 3 : 0;
    const feet = player.y - bounce;
    const swing = player.onGround ? Math.sin(player.runTime * 2) * 9 : -4;

    ctx.save();
    ctx.translate(PLAYER_X, feet - 82);
    ctx.scale(1 + player.squash * .25, 1 - player.squash * .2);

    ctx.fillStyle = 'rgba(46, 99, 67, .17)';
    ctx.beginPath();
    ctx.ellipse(35, GROUND_Y + 87 - feet, player.onGround ? 29 : 20, player.onGround ? 6 : 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#d8494f';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(30, 51);
    ctx.lineTo(27 - swing * .7, 65);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(45, 51);
    ctx.lineTo(49 + swing * .7, 65);
    ctx.stroke();
    ctx.strokeStyle = '#e58d58';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(27 - swing * .7, 65, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(49 + swing * .7, 65, 3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#3975bd';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(31, 60);
    ctx.lineTo(27 + swing, 73);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(44, 60);
    ctx.lineTo(48 - swing, 73);
    ctx.stroke();
    ctx.fillStyle = '#e94755';
    ctx.beginPath();
    ctx.ellipse(26 + swing, 74, 8, 4, -.12, 0, Math.PI * 2);
    ctx.ellipse(49 - swing, 74, 8, 4, .12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff5dc';
    ctx.beginPath();
    ctx.ellipse(27 + swing, 75, 5, 2, 0, 0, Math.PI * 2);
    ctx.ellipse(50 - swing, 75, 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#9a5941';
    roundedRect(16, 39, 15, 22, 6);
    ctx.fill();
    ctx.fillStyle = '#e33e4d';
    ctx.beginPath();
    ctx.moveTo(34, 40);
    ctx.lineTo(48, 43);
    ctx.lineTo(47, 62);
    ctx.lineTo(29, 62);
    ctx.lineTo(26, 47);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff7a78';
    ctx.beginPath();
    ctx.moveTo(32, 42);
    ctx.lineTo(38, 48);
    ctx.lineTo(44, 42);
    ctx.lineTo(42, 55);
    ctx.lineTo(34, 55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffcf5a';
    ctx.beginPath();
    ctx.arc(38, 56, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffe2b4';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(35, 43);
    ctx.lineTo(36, 51);
    ctx.moveTo(43, 43);
    ctx.lineTo(42, 51);
    ctx.stroke();

    ctx.fillStyle = '#f5c09a';
    ctx.beginPath();
    ctx.ellipse(39, 26, 16, 18, .08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d88c69';
    ctx.beginPath();
    ctx.arc(53, 29, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#70442d';
    ctx.beginPath();
    ctx.moveTo(23, 28);
    ctx.lineTo(17, 14 + run * 1.5);
    ctx.lineTo(30, 19);
    ctx.lineTo(34, 5 + run * 1.5);
    ctx.lineTo(41, 16);
    ctx.lineTo(50, 7 + run);
    ctx.lineTo(50, 19);
    ctx.lineTo(58, 15);
    ctx.lineTo(54, 27);
    ctx.quadraticCurveTo(51, 30, 49, 33);
    ctx.quadraticCurveTo(45, 24, 40, 22);
    ctx.lineTo(35, 34);
    ctx.lineTo(30, 26);
    ctx.lineTo(24, 36);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a5683d';
    ctx.beginPath();
    ctx.moveTo(25, 15);
    ctx.lineTo(31, 19);
    ctx.lineTo(33, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c1844c';
    ctx.beginPath();
    ctx.moveTo(38, 16);
    ctx.lineTo(45, 11 + run);
    ctx.lineTo(43, 20);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(39, 28, 3.8, 5.5, -.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3c5f8d';
    ctx.beginPath();
    ctx.ellipse(40, 29, 2.2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#26394e';
    ctx.beginPath();
    ctx.arc(40, 30, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(41, 27, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#293c55';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(45, 29);
    ctx.quadraticCurveTo(49, 25, 53, 28);
    ctx.stroke();
    ctx.strokeStyle = '#a65c4a';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(45, 35);
    ctx.quadraticCurveTo(50, 40 + run, 54, 34);
    ctx.stroke();
    ctx.fillStyle = '#f07c79';
    ctx.beginPath();
    ctx.ellipse(51, 38 + run, 2.4, 1.1, -.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(247, 117, 113, .44)';
    ctx.beginPath();
    ctx.ellipse(33, 35, 3.5, 2, 0, 0, Math.PI * 2);
    ctx.ellipse(52, 35, 3.5, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#293c55';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(36, 22);
    ctx.quadraticCurveTo(39, 20, 42, 22);
    ctx.moveTo(46, 21);
    ctx.lineTo(51, 19);
    ctx.stroke();
    ctx.restore();
  }

  function drawCoin(coin) {
    const bob = Math.sin(coin.phase) * 3;
    const flip = .25 + Math.abs(Math.cos(coin.phase * .65)) * .75;
    ctx.save();
    ctx.translate(coin.x + coin.r, coin.y + coin.r + bob);
    ctx.scale(flip, 1);
    ctx.fillStyle = 'rgba(170, 111, 28, .2)';
    ctx.beginPath();
    ctx.ellipse(2, 3, coin.r + 1, coin.r + 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0a928';
    ctx.beginPath();
    ctx.arc(0, 0, coin.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffda56';
    ctx.beginPath();
    ctx.arc(-1, -1, coin.r - 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff0a4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, coin.r - 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#e89b23';
    ctx.font = '800 15px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', 0, 1);
    ctx.restore();
  }

  function drawObstacle(obstacle) {
    ctx.save();
    ctx.translate(obstacle.x, obstacle.y);
    if (obstacle.type === 'rock') {
      ctx.fillStyle = 'rgba(55, 98, 76, .18)';
      ctx.beginPath();
      ctx.ellipse(26, obstacle.h - 1, 28, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#898c80';
      ctx.beginPath();
      ctx.moveTo(2, obstacle.h);
      ctx.lineTo(5, 19);
      ctx.lineTo(20, 4);
      ctx.lineTo(35, 8);
      ctx.lineTo(51, 25);
      ctx.lineTo(48, obstacle.h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#b5b7a6';
      ctx.beginPath();
      ctx.moveTo(8, 20);
      ctx.lineTo(20, 6);
      ctx.lineTo(34, 10);
      ctx.lineTo(24, 16);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.42)';
      ctx.beginPath();
      ctx.ellipse(17, 23, 4, 2, -.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (obstacle.type === 'crate') {
      ctx.fillStyle = 'rgba(55, 98, 76, .17)';
      ctx.fillRect(3, obstacle.h - 2, obstacle.w, 6);
      roundedRect(2, 1, obstacle.w - 4, obstacle.h - 3, 7);
      ctx.fillStyle = '#dc8650';
      ctx.fill();
      ctx.strokeStyle = '#ac623e';
      ctx.lineWidth = 3;
      roundedRect(6, 5, obstacle.w - 12, obstacle.h - 11, 4);
      ctx.stroke();
      ctx.strokeStyle = '#f3bd75';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(10, obstacle.h - 10);
      ctx.lineTo(obstacle.w - 10, 10);
      ctx.moveTo(10, 10);
      ctx.lineTo(obstacle.w - 10, obstacle.h - 10);
      ctx.stroke();
      ctx.fillStyle = '#ffda92';
      ctx.beginPath();
      ctx.arc(obstacle.w / 2, obstacle.h / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(55, 98, 76, .17)';
      ctx.beginPath();
      ctx.ellipse(19, obstacle.h, 22, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#39976d';
      roundedRect(12, 5, 17, obstacle.h - 5, 8);
      ctx.fill();
      roundedRect(0, 25, 13, 24, 6);
      ctx.fill();
      roundedRect(27, 35, 12, 24, 6);
      ctx.fill();
      ctx.fillStyle = '#76c77d';
      roundedRect(15, 11, 4, obstacle.h - 20, 2);
      ctx.fill();
      ctx.strokeStyle = '#e6cf85';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(20, 13);
      ctx.lineTo(20, 31);
      ctx.moveTo(6, 30);
      ctx.lineTo(6, 42);
      ctx.moveTo(33, 40);
      ctx.lineTo(33, 52);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEffects() {
    for (const particle of particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const text of floatTexts) {
      ctx.globalAlpha = Math.min(1, text.life * 2);
      ctx.fillStyle = '#fffdf2';
      ctx.strokeStyle = '#c27a1c';
      ctx.lineWidth = 3;
      ctx.font = '900 17px Trebuchet MS, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeText(text.text, text.x, text.y);
      ctx.fillText(text.text, text.x, text.y);
    }
    ctx.globalAlpha = 1;
  }

  function roundedRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    soundButton.classList.toggle('is-muted', !soundEnabled);
    soundButton.setAttribute('aria-pressed', String(soundEnabled));
    soundButton.setAttribute('aria-label', soundEnabled ? 'Turn sound off' : 'Turn sound on');
    soundButton.title = soundEnabled ? 'Sound on' : 'Sound off';
    if (soundEnabled) {
      ensureAudio();
      if (state === 'running') startMusic();
    } else {
      stopMusic();
    }
  }

  function ensureAudio() {
    if (!soundEnabled) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === 'suspended') audioContext.resume();
  }

  function playTone(startFrequency, duration, wave, volume, endFrequency) {
    if (!soundEnabled) return;
    ensureAudio();
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(startFrequency, now);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  function playBell() {
    if (!soundEnabled) return;
    ensureAudio();
    if (!audioContext) return;
    const now = audioContext.currentTime;
    for (const partial of [{ frequency: 1175, volume: .055, decay: .58 }, { frequency: 1760, volume: .025, decay: .34 }]) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(partial.frequency, now);
      gain.gain.setValueAtTime(partial.volume, now);
      gain.gain.exponentialRampToValueAtTime(.001, now + partial.decay);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + partial.decay);
    }
  }

  function startMusic() {
    if (!soundEnabled || state !== 'running' || !audioContext || musicTimer !== null) return;
    const melody = [659, 784, 988, 784, 587, 698, 880, 698, 523, 659, 784, 659, 587, 523, 440, 523];
    const bass = [262, 0, 196, 0, 220, 0, 175, 0];
    musicStep = 0;

    const playMusicStep = () => {
      if (state !== 'running' || !soundEnabled) {
        musicTimer = null;
        return;
      }
      playTone(melody[musicStep % melody.length], .22, 'triangle', .018);
      const bassNote = bass[musicStep % bass.length];
      if (bassNote) playTone(bassNote, .3, 'sine', .012);
      musicStep += 1;
      musicTimer = window.setTimeout(playMusicStep, 270);
    };

    playMusicStep();
  }

  function stopMusic() {
    if (musicTimer !== null) window.clearTimeout(musicTimer);
    musicTimer = null;
  }

  function renderFrame() {
    if (state !== 'running') draw();
    requestAnimationFrame(renderFrame);
  }

  requestAnimationFrame(renderFrame);
})();
