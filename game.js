(() => {
  const canvas = document.querySelector("#game-canvas");
  const ctx = canvas.getContext("2d");
  const wrap = document.querySelector("#canvas-wrap");
  const overlay = document.querySelector("#game-overlay");
  const startButton = document.querySelector("#start-button");
  const pauseButton = document.querySelector("#pause-button");
  const scoreLabel = document.querySelector("#score");
  const bestLabel = document.querySelector("#best-score");
  const stageStatus = document.querySelector("#stage-status");
  const overlayKicker = document.querySelector("#overlay-kicker");
  const overlayTitle = document.querySelector("#overlay-title");
  const overlayCopy = document.querySelector("#overlay-copy");
  const buttonLabel = document.querySelector("#button-label");
  const overlayHint = document.querySelector("#overlay-hint");
  const musicButton = document.querySelector("#music-button");
  const musicLabel = document.querySelector("#music-label");

  const BEST_KEY = "prima-best-score";
  const WORLD = { width: 960, height: 440, floor: 354 };
  const melody = [
    [659.25, .5], [783.99, .5], [987.77, .5], [783.99, .5],
    [880, .5], [783.99, .5], [659.25, .5], [587.33, .5],
    [523.25, .5], [659.25, .5], [783.99, .5], [659.25, .5],
    [587.33, .5], [523.25, .5], [587.33, .5], [659.25, .5],
    [783.99, .5], [880, .5], [987.77, .5], [880, .5],
    [783.99, .5], [659.25, .5], [587.33, .5], [659.25, .5],
    [523.25, .5], [587.33, .5], [659.25, .5], [783.99, .5],
    [659.25, .5], [587.33, .5], [523.25, .5], [493.88, .5],
  ];
  const bassNotes = [130.81, 130.81, 174.61, 174.61, 196, 196, 146.83, 146.83];
  const dancer = { x: 145, y: 0, width: 72, height: 112, velocityY: 0, grounded: true };
  const gravity = 1950;
  const jumpVelocity = -700;
  const hazards = [];
  const particles = [];
  const stars = Array.from({ length: 44 }, (_, index) => ({
    x: ((index * 197 + 47) % WORLD.width) / WORLD.width,
    y: 30 + ((index * 83 + 19) % 205),
    radius: 0.7 + (index % 4) * 0.35,
    phase: index * 0.8,
  }));

  let width = WORLD.width;
  let height = WORLD.height;
  let floor = WORLD.floor;
  let state = "ready";
  let score = 0;
  let best = readBest();
  let speed = 340;
  let spawnTimer = 1.65;
  let elapsed = 0;
  let lastTime = 0;
  let jumpPressed = false;
  let musicEnabled = true;
  let audioContext = null;
  let musicTimer = null;
  let nextNoteTime = 0;
  let noteIndex = 0;

  bestLabel.textContent = formatScore(best);
  resize();
  window.addEventListener("resize", resize);
  startButton.addEventListener("click", startGame);
  pauseButton.addEventListener("click", togglePause);
  musicButton.addEventListener("click", toggleMusic);
  wrap.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "running") pauseGame();
  });
  requestAnimationFrame(frame);

  function readBest() {
    try {
      const value = Number(localStorage.getItem(BEST_KEY));
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch (error) {
      console.warn("Prima could not read the saved high score.", error);
      return 0;
    }
  }

  function saveBest() {
    try {
      localStorage.setItem(BEST_KEY, String(best));
    } catch (error) {
      console.warn("Prima could not save the high score.", error);
    }
  }

  function toggleMusic() {
    musicEnabled = !musicEnabled;
    updateMusicButton();
    if (!musicEnabled) {
      stopMusic();
      return;
    }
    if (state === "running") startMusic();
  }

  function updateMusicButton() {
    musicButton.setAttribute("aria-pressed", String(musicEnabled));
    musicButton.setAttribute("aria-label", `Turn music ${musicEnabled ? "off" : "on"}`);
    musicLabel.textContent = `MUSIC ${musicEnabled ? "ON" : "OFF"}`;
  }

  function startMusic() {
    if (!musicEnabled || state !== "running") return;
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        musicEnabled = false;
        updateMusicButton();
        console.warn("Prima's retro soundtrack is not supported by this browser.");
        return;
      }
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === "closed") return;
    audioContext.resume().then(() => {
      if (!musicEnabled || state !== "running") return;
      if (musicTimer !== null) return;
      nextNoteTime = audioContext.currentTime + .04;
      musicTimer = window.setInterval(scheduleMusic, 35);
      scheduleMusic();
    }).catch((error) => {
      musicEnabled = false;
      updateMusicButton();
      console.warn("Prima could not start the retro soundtrack.", error);
    });
  }

  function stopMusic() {
    if (musicTimer !== null) {
      window.clearInterval(musicTimer);
      musicTimer = null;
    }
    if (audioContext && audioContext.state === "running") {
      audioContext.suspend().catch((error) => {
        console.warn("Prima could not pause the retro soundtrack.", error);
      });
    }
  }

  function scheduleMusic() {
    if (!audioContext || audioContext.state !== "running") return;
    while (nextNoteTime < audioContext.currentTime + .16) {
      const [frequency, beats] = melody[noteIndex % melody.length];
      playNote(frequency, nextNoteTime, .18, "square", .045);
      if (noteIndex % 2 === 0) {
        const bass = bassNotes[Math.floor(noteIndex / 4) % bassNotes.length];
        playNote(bass, nextNoteTime, .29, "triangle", .085);
      }
      if (noteIndex % 4 === 2) {
        playNote(frequency * 2, nextNoteTime + .25, .09, "square", .018);
      }
      nextNoteTime += beats * .24;
      noteIndex++;
    }
  }

  function playNote(frequency, startAt, duration, waveform, volume) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + .012);
    gain.gain.setValueAtTime(volume, startAt + duration * .65);
    gain.gain.exponentialRampToValueAtTime(.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + .015);
  }

  function resize() {
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const unit = canvas.height / WORLD.height;
    width = canvas.width / unit;
    height = WORLD.height;
    ctx.setTransform(unit, 0, 0, unit, 0, 0);
    floor = WORLD.floor;
    dancer.x = Math.max(64, width * .15);
    dancer.y = Math.min(dancer.y || floor - dancer.height, floor - dancer.height);
  }

  function formatScore(value) {
    return String(Math.floor(value)).padStart(5, "0");
  }

  function startGame() {
    if (state === "running") return;
    if (state === "paused") {
      state = "running";
      hideOverlay();
      pauseButton.hidden = false;
      stageStatus.textContent = "LIVE ON STAGE";
      lastTime = performance.now();
      startMusic();
      return;
    }
    score = 0;
    speed = 340;
    spawnTimer = 1.65;
    elapsed = 0;
    hazards.length = 0;
    particles.length = 0;
    dancer.y = floor - dancer.height;
    dancer.velocityY = 0;
    dancer.grounded = true;
    state = "running";
    scoreLabel.textContent = formatScore(score);
    stageStatus.textContent = "LIVE ON STAGE";
    pauseButton.hidden = false;
    hideOverlay();
    lastTime = performance.now();
    startMusic();
  }

  function pauseGame() {
    if (state !== "running") return;
    state = "paused";
    stopMusic();
    pauseButton.hidden = true;
    overlayKicker.textContent = "TAKE A BREATH";
    overlayTitle.textContent = "The stage is yours.";
    overlayCopy.innerHTML = "Your dance is on pause.<br />Ready when you are.";
    buttonLabel.textContent = "Keep dancing";
    overlayHint.textContent = "PRESS SPACE OR ENTER TO RESUME";
    overlay.classList.remove("is-hidden");
    stageStatus.textContent = "INTERMISSION";
  }

  function togglePause() {
    if (state === "running") pauseGame();
    else if (state === "paused") startGame();
  }

  function hideOverlay() {
    overlay.classList.add("is-hidden");
    overlayKicker.textContent = "CURTAIN UP";
    overlayTitle.textContent = "Ready to dance?";
    overlayCopy.innerHTML = "The stage is scattered with pointe shoes.<br />Show them what you’ve got.";
    buttonLabel.textContent = "Take the stage";
    overlayHint.textContent = "PRESS SPACE OR TAP TO JUMP";
  }

  function endGame() {
    state = "over";
    stopMusic();
    pauseButton.hidden = true;
    const newRecord = score > best;
    if (newRecord) {
      best = score;
      bestLabel.textContent = formatScore(best);
      saveBest();
    }
    overlayKicker.textContent = newRecord ? "A STANDING OVATION" : "AND… BREATHE";
    overlayTitle.textContent = newRecord ? "A new personal best!" : "Beautifully danced.";
    overlayCopy.innerHTML = `You scored <strong>${formatScore(score)}</strong> points.<br />${newRecord ? "The audience is on its feet." : "Ready for one more?"}`;
    buttonLabel.textContent = "Dance again";
    overlayHint.textContent = "PRESS SPACE OR ENTER TO PLAY AGAIN";
    overlay.classList.remove("is-hidden");
    stageStatus.textContent = "SHOW COMPLETE";
    burst(dancer.x + 38, dancer.y + 48);
  }

  function onKeyDown(event) {
    if (event.code === "Space" || event.code === "ArrowUp") {
      event.preventDefault();
      if (state === "ready" || state === "over") {
        startGame();
        jump();
      }
      else if (state === "paused") startGame();
      else jump();
    } else if (event.code === "Enter" && (state === "ready" || state === "paused" || state === "over")) {
      event.preventDefault();
      startGame();
    } else if (event.code === "Escape" && (state === "running" || state === "paused")) {
      event.preventDefault();
      togglePause();
    }
    if (event.code === "Space" || event.code === "ArrowUp") jumpPressed = true;
  }

  function onKeyUp(event) {
    if (event.code === "Space" || event.code === "ArrowUp") jumpPressed = false;
  }

  function onPointerDown(event) {
    if (event.target.closest("button")) return;
    if (state === "ready" || state === "over") {
      startGame();
      jump();
    } else if (state === "paused") startGame();
    else jump();
  }

  function jump() {
    if (state !== "running" || !dancer.grounded || jumpPressed) return;
    dancer.velocityY = jumpVelocity;
    dancer.grounded = false;
    burst(dancer.x + 27, floor - 5, 5);
  }

  function frame(time) {
    const dt = Math.min((time - (lastTime || time)) / 1000, 0.035);
    lastTime = time;
    if (state === "running") update(dt);
    else if (state !== "paused") elapsed += dt;
    render();
    requestAnimationFrame(frame);
  }

  function update(dt) {
    elapsed += dt;
    score += dt * (speed / 15);
    speed = Math.min(650, 340 + score * 0.48);
    scoreLabel.textContent = formatScore(score);

    if (!dancer.grounded) {
      dancer.velocityY += gravity * dt;
      dancer.y += dancer.velocityY * dt;
      if (dancer.y >= floor - dancer.height) {
        dancer.y = floor - dancer.height;
        dancer.velocityY = 0;
        dancer.grounded = true;
        burst(dancer.x + 27, floor - 5, 4);
      }
    }

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnHazard();
      spawnTimer = random(1.2, 1.8) * Math.max(.69, 1 - score / 6000);
    }

    for (let index = hazards.length - 1; index >= 0; index--) {
      const hazard = hazards[index];
      hazard.x -= speed * dt;
      hazard.phase += dt * 5;
      if (hazard.x + hazard.width < -20) hazards.splice(index, 1);
      else if (collides(dancer, hazard)) {
        endGame();
        break;
      }
    }

    for (let index = particles.length - 1; index >= 0; index--) {
      const particle = particles[index];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 380 * dt;
      particle.life -= dt;
      if (particle.life <= 0) particles.splice(index, 1);
    }
  }

  function spawnHazard() {
    const pair = Math.random() > .48;
    hazards.push({
      x: width + 15,
      y: floor - 36,
      width: pair ? 63 : 41,
      height: 35,
      count: pair ? 2 : 1,
      phase: Math.random() * Math.PI * 2,
    });
  }

  function collides(person, hazard) {
    const px = person.x + 18;
    const py = person.y + 17;
    const pw = person.width - 31;
    const ph = person.height - 21;
    const hx = hazard.x + 4;
    const hy = hazard.y + 9;
    const hw = hazard.width - 8;
    const hh = hazard.height - 10;
    return px < hx + hw && px + pw > hx && py < hy + hh && py + ph > hy;
  }

  function random(min, max) { return min + Math.random() * (max - min); }

  function burst(x, y, count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = random(-Math.PI, 0);
      const velocity = random(22, 92);
      particles.push({
        x, y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 15,
        life: random(.25, .55),
        maxLife: .55,
        size: random(1.5, 3.5),
      });
    }
  }

  function render() {
    ctx.clearRect(0, 0, width, height);
    drawStage();
    for (const hazard of hazards) drawShoes(hazard);
    drawBallerina();
    drawParticles();
    if (state === "ready") drawPrompt();
  }

  function drawStage() {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#382748");
    sky.addColorStop(.56, "#533451");
    sky.addColorStop(1, "#a05a72");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width * .54, floor - 18, 12, width * .54, floor - 18, 310);
    glow.addColorStop(0, "rgba(255, 199, 201, .27)");
    glow.addColorStop(1, "rgba(255, 199, 201, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(120, 40, 720, floor);

    drawCurtain();
    drawStars();
    drawBunting();
    drawAudience();
    drawFloor();
  }

  function drawCurtain() {
    const curtain = ctx.createLinearGradient(0, 0, 52, 0);
    curtain.addColorStop(0, "rgba(48, 24, 53, .96)");
    curtain.addColorStop(.5, "rgba(93, 42, 71, .75)");
    curtain.addColorStop(1, "rgba(55, 29, 57, .26)");
    ctx.fillStyle = curtain;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(104, 0);
    for (let y = 0; y <= floor + 8; y += 12) {
      const fold = 16 + Math.sin(y * .021) * 7;
      ctx.lineTo(fold, y);
    }
    ctx.lineTo(0, floor);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.fillStyle = curtain;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(104, 0);
    for (let y = 0; y <= floor + 8; y += 12) ctx.lineTo(16 + Math.sin(y * .021) * 7, y);
    ctx.lineTo(0, floor);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "rgba(233, 161, 181, .49)";
    ctx.fillRect(0, 0, width, 5);
    ctx.fillStyle = "rgba(38, 22, 43, .36)";
    ctx.fillRect(0, floor - 6, width, 9);
  }

  function drawStars() {
    for (const star of stars) {
      const alpha = .27 + (Math.sin(elapsed * 1.3 + star.phase) + 1) * .2;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ffe4df";
      ctx.beginPath();
      ctx.arc(star.x * width, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBunting() {
    ctx.strokeStyle = "rgba(241, 187, 195, .35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(111, 25);
    ctx.quadraticCurveTo(width / 2, 72, width - 111, 25);
    ctx.stroke();
    for (let i = 0; i < 13; i++) {
      const x = 128 + i * ((width - 256) / 12);
      const progress = (x - 111) / (width - 222);
      const y = 25 + 47 * 4 * progress * (1 - progress);
      ctx.fillStyle = i % 2 ? "rgba(244, 195, 198, .62)" : "rgba(247, 222, 209, .68)";
      ctx.beginPath();
      ctx.moveTo(x - 5, y);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x, y + 10);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawAudience() {
    const baseline = floor - 11;
    const count = Math.max(8, Math.floor((width - 120) / 18));
    for (let i = 0; i < count; i++) {
      const x = 60 + i * ((width - 120) / Math.max(1, count - 1));
      const y = baseline - (i % 3 === 0 ? 18 : 13) + Math.sin(i * 5) * 2;
      ctx.fillStyle = i % 4 === 0 ? "rgba(55, 29, 56, .52)" : "rgba(45, 30, 51, .4)";
      ctx.beginPath();
      ctx.arc(x, y, 4.7, Math.PI, 0);
      ctx.lineTo(x + 5, baseline);
      ctx.lineTo(x - 5, baseline);
      ctx.closePath();
      ctx.fill();
      if (i % 6 === 0) {
        ctx.fillStyle = "rgba(255, 205, 178, .46)";
        ctx.beginPath();
        ctx.arc(x - 1.5, y - 1, 1, 0, Math.PI * 2);
        ctx.arc(x + 1.5, y - 1, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawFloor() {
    const floorGradient = ctx.createLinearGradient(0, floor, 0, height);
    floorGradient.addColorStop(0, "#b47183");
    floorGradient.addColorStop(1, "#754658");
    ctx.fillStyle = floorGradient;
    ctx.fillRect(0, floor, width, height - floor);

    ctx.fillStyle = "rgba(255, 214, 205, .85)";
    ctx.fillRect(0, floor, width, 2);
    const offset = (elapsed * (state === "running" ? speed : 65)) % 116;
    ctx.strokeStyle = "rgba(255, 209, 202, .12)";
    ctx.lineWidth = 1;
    for (let x = -116 + offset; x < width + 116; x += 116) {
      ctx.beginPath();
      ctx.moveTo(x, floor + 3);
      ctx.lineTo(x - 35, height);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255, 217, 208, .12)";
    ctx.fillRect(0, floor + 3, width, 1);
  }

  function drawShoes(hazard) {
    for (let index = 0; index < hazard.count; index++) {
      const x = hazard.x + (index ? 28 : 0);
      const y = hazard.y + Math.sin(hazard.phase + index * 1.4) * .7;
      ctx.save();
      ctx.translate(x + 18, y + 17);
      ctx.rotate(index ? .2 : -.12);
      drawShoe(-18, 0, index ? "#d98da0" : "#e9a8b4", "#bd7187");
      ctx.restore();
    }
  }

  function drawShoe(x, y, upperColor, soleColor) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(45, 21, 41, .22)";
    ctx.beginPath();
    ctx.ellipse(1, 11, 19, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = soleColor;
    ctx.beginPath();
    ctx.moveTo(-19, 8);
    ctx.quadraticCurveTo(-15, 4, -6, 1);
    ctx.lineTo(7, -3);
    ctx.quadraticCurveTo(14, -5, 19, 0);
    ctx.quadraticCurveTo(16, 6, 6, 8);
    ctx.quadraticCurveTo(-7, 13, -17, 11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = upperColor;
    ctx.beginPath();
    ctx.moveTo(-17, 5);
    ctx.quadraticCurveTo(-12, 1, -5, -2);
    ctx.lineTo(7, -5);
    ctx.quadraticCurveTo(13, -6, 17, -1);
    ctx.quadraticCurveTo(15, 4, 5, 6);
    ctx.quadraticCurveTo(-8, 9, -16, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 218, 218, .68)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-9, -1);
    ctx.quadraticCurveTo(-5, -8, 3, -10);
    ctx.moveTo(0, 1);
    ctx.quadraticCurveTo(5, -5, 12, -7);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 236, 227, .8)";
    ctx.beginPath();
    ctx.ellipse(-16, 7, 2, 1.3, -.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBallerina() {
    const run = state === "running" && dancer.grounded ? Math.sin(elapsed * 15) : 0;
    const air = !dancer.grounded;
    const bob = dancer.grounded && state === "running" ? Math.abs(Math.sin(elapsed * 15)) * 3 : Math.sin(elapsed * 2.6) * 1.2;
    const x = dancer.x;
    const y = dancer.y + bob;
    const centerX = x + 37;
    const waistY = y + 57;
    const armWave = air ? -12 : run * 5;
    const legWave = air ? -11 : run * 5;

    ctx.save();
    ctx.globalAlpha = .3;
    ctx.fillStyle = "#321c37";
    ctx.beginPath();
    ctx.ellipse(centerX + 6, floor - 1, air ? 13 : 25, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    const shadow = ctx.createRadialGradient(37, 55, 2, 37, 55, 29);
    shadow.addColorStop(0, "rgba(255, 192, 201, .14)");
    shadow.addColorStop(1, "rgba(255, 192, 201, 0)");
    ctx.fillStyle = shadow;
    ctx.fillRect(0, 8, 74, 92);

    // Back arm
    ctx.strokeStyle = "#a85e76";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(38, 37);
    ctx.quadraticCurveTo(50, 39 + armWave * .3, 57, 45 + armWave * .5);
    ctx.stroke();
    ctx.fillStyle = "#ffd7d3";
    ctx.beginPath();
    ctx.arc(57, 45 + armWave * .5, 3, 0, Math.PI * 2);
    ctx.fill();

    // Leaping legs
    ctx.strokeStyle = "#f7c5c6";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(35, waistY - y + 14);
    if (air) {
      ctx.quadraticCurveTo(45, 75, 59, 78);
      ctx.quadraticCurveTo(62, 76, 69, 77);
    } else {
      ctx.quadraticCurveTo(36 + legWave, 83, 34 + legWave, 101);
      ctx.quadraticCurveTo(35 + legWave, 106, 28 + legWave, 107);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(35, waistY - y + 14);
    if (air) {
      ctx.quadraticCurveTo(20, 68, 12, 76);
      ctx.quadraticCurveTo(10, 78, 3, 77);
    } else {
      ctx.quadraticCurveTo(37 - legWave, 83, 41 - legWave, 101);
      ctx.quadraticCurveTo(40 - legWave, 106, 47 - legWave, 107);
    }
    ctx.stroke();
    drawRibbons(29 + (air ? 28 : legWave), air ? 77 : 104, air ? -0.5 : 0);
    drawRibbons(5 + (air ? 7 : -legWave), air ? 77 : 104, air ? .4 : 0);

    // Leotard and tutu
    ctx.fillStyle = "#df91ab";
    ctx.beginPath();
    ctx.moveTo(29, 35);
    ctx.quadraticCurveTo(37, 31, 45, 36);
    ctx.lineTo(43, 61);
    ctx.quadraticCurveTo(36, 65, 29, 60);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f3b5c3";
    ctx.beginPath();
    ctx.moveTo(35, 52);
    ctx.quadraticCurveTo(22, 51, 15, 58);
    ctx.quadraticCurveTo(24, 69, 36, 65);
    ctx.quadraticCurveTo(49, 68, 59, 57);
    ctx.quadraticCurveTo(47, 51, 37, 53);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 235, 233, .53)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(22 + i * 7, 57);
      ctx.lineTo(27 + i * 6, 66);
      ctx.stroke();
    }
    ctx.fillStyle = "#ffe2de";
    ctx.beginPath();
    ctx.ellipse(37, 52, 10, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Front arm, raised in a soft ballet curve
    ctx.strokeStyle = "#f7c5c6";
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(43, 39);
    ctx.quadraticCurveTo(53, 24 + (air ? -3 : 0), 45, 17 + (air ? -2 : 0));
    ctx.stroke();
    ctx.fillStyle = "#ffd7d3";
    ctx.beginPath();
    ctx.arc(45, 17 + (air ? -2 : 0), 3, 0, Math.PI * 2);
    ctx.fill();

    // Neck, face, bun
    ctx.fillStyle = "#ffd1c8";
    ctx.fillRect(34, 29, 7, 9);
    ctx.fillStyle = "#ffd1c8";
    ctx.beginPath();
    ctx.ellipse(40, 23, 10, 11, -.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#482941";
    ctx.beginPath();
    ctx.ellipse(39, 18, 10, 6, -.25, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(47, 17, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#54314b";
    ctx.beginPath();
    ctx.arc(45, 24, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(208, 113, 135, .6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(44, 27, 2, .15, 1.2);
    ctx.stroke();

    // Tiny flower in her bun
    ctx.fillStyle = "#fff0dd";
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * .4;
      ctx.beginPath();
      ctx.arc(49 + Math.cos(angle) * 3, 15 + Math.sin(angle) * 3, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRibbons(x, y, tilt) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.strokeStyle = "#ffe7dc";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-3, -2);
    ctx.quadraticCurveTo(-8, -7, -5, -11);
    ctx.moveTo(2, -2);
    ctx.quadraticCurveTo(8, -8, 7, -13);
    ctx.moveTo(-1, -3);
    ctx.lineTo(-1, 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles() {
    for (const particle of particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = "#ffe5d5";
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPrompt() {
    ctx.globalAlpha = .85 + Math.sin(elapsed * 3) * .12;
    ctx.fillStyle = "#f7e5df";
    ctx.font = '11px "DM Sans", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("PRESS SPACE TO BEGIN", width / 2, floor - 42);
    ctx.globalAlpha = 1;
  }

})();
