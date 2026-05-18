(() => {
  const ROWS = 31;
  const COLS = 28;
  const SUPER_PELLET_COUNT = 10;
  const FLASH_DURATION_MS = 20000;
  const PACMAN_TICK_MS = 110;
  const GHOST_TICK_MS = 220;
  const MAZE_FILL_RATE = 0.18;

  const TILE = {
    WALL: 0,
    PATH: 1,
    GHOST_HOUSE: 2,
  };

  const DIRS = {
    LEFT: { x: -1, y: 0 },
    RIGHT: { x: 1, y: 0 },
    UP: { x: 0, y: -1 },
    DOWN: { x: 0, y: 1 },
  };

  const KEY_TO_DIR = {
    a: DIRS.LEFT,
    s: DIRS.RIGHT,
    w: DIRS.UP,
    z: DIRS.DOWN,
  };

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const highScoreEl = document.getElementById("high-score");
  const highScorerEl = document.getElementById("high-scorer");
  const startBtn = document.getElementById("start-btn");
  const modal = document.getElementById("name-modal");
  const nameInput = document.getElementById("name-input");
  const nameSubmit = document.getElementById("name-submit");

  let gameState = null;
  let pacmanTimer = null;
  let ghostTimer = null;
  let animationFrame = null;
  let queuedDirection = null;
  let mouthFrames = 0;
  let cachedHighScore = 0;
  let cachedHighScorer = "N/A";

  function randomInt(max) {
    return Math.floor(Math.random() * max);
  }

  function createEmptyGrid(value) {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(value));
  }

  function inBounds(x, y) {
    return x >= 0 && x < COLS && y >= 0 && y < ROWS;
  }

  function neighbors4(x, y) {
    return [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ].filter((p) => inBounds(p.x, p.y));
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function findConnectedPathCells(grid, gateRows) {
    const start = { x: 1, y: gateRows[0] };
    const seen = createEmptyGrid(false);
    const queue = [start];
    seen[start.y][start.x] = true;

    while (queue.length > 0) {
      const cur = queue.shift();
      for (const n of neighbors4(cur.x, cur.y)) {
        if (seen[n.y][n.x]) {
          continue;
        }
        if (grid[n.y][n.x] !== TILE.PATH) {
          continue;
        }
        seen[n.y][n.x] = true;
        queue.push(n);
      }
    }

    return seen;
  }

  function buildMaze() {
    const grid = createEmptyGrid(TILE.WALL);

    for (let y = 1; y < ROWS - 1; y += 2) {
      for (let x = 1; x < COLS - 1; x += 2) {
        grid[y][x] = TILE.PATH;
      }
    }

    const oddCells = [];
    for (let y = 1; y < ROWS - 1; y += 2) {
      for (let x = 1; x < COLS - 1; x += 2) {
        oddCells.push({ x, y });
      }
    }

    const start = oddCells[randomInt(oddCells.length)];
    const stack = [start];
    const visited = new Set([`${start.x},${start.y}`]);

    while (stack.length > 0) {
      const cur = stack[stack.length - 1];
      const options = [
        { x: cur.x + 2, y: cur.y, wx: cur.x + 1, wy: cur.y },
        { x: cur.x - 2, y: cur.y, wx: cur.x - 1, wy: cur.y },
        { x: cur.x, y: cur.y + 2, wx: cur.x, wy: cur.y + 1 },
        { x: cur.x, y: cur.y - 2, wx: cur.x, wy: cur.y - 1 },
      ].filter((o) => o.x > 0 && o.x < COLS - 1 && o.y > 0 && o.y < ROWS - 1 && !visited.has(`${o.x},${o.y}`));

      if (options.length === 0) {
        stack.pop();
        continue;
      }

      const next = options[randomInt(options.length)];
      visited.add(`${next.x},${next.y}`);
      grid[next.wy][next.wx] = TILE.PATH;
      stack.push({ x: next.x, y: next.y });
    }

    // Add a few loops to avoid a strict tree maze.
    for (let y = 1; y < ROWS - 1; y += 1) {
      for (let x = 1; x < COLS - 1; x += 1) {
        if (grid[y][x] === TILE.WALL && Math.random() < MAZE_FILL_RATE) {
          const around = neighbors4(x, y).filter((n) => grid[n.y][n.x] === TILE.PATH).length;
          if (around >= 2) {
            grid[y][x] = TILE.PATH;
          }
        }
      }
    }

    const centerTop = Math.floor(ROWS / 2) - 2;
    const centerBottom = Math.floor(ROWS / 2) + 2;
    const centerLeft = Math.floor(COLS / 2) - 4;
    const centerRight = Math.floor(COLS / 2) + 3;

    for (let y = centerTop; y <= centerBottom; y += 1) {
      for (let x = centerLeft; x <= centerRight; x += 1) {
        grid[y][x] = TILE.GHOST_HOUSE;
      }
    }

    const houseDoorTop = { x: Math.floor(COLS / 2), y: centerTop - 1 };
    const houseDoorBottom = { x: Math.floor(COLS / 2), y: centerBottom + 1 };
    grid[houseDoorTop.y][houseDoorTop.x] = TILE.PATH;
    grid[houseDoorBottom.y][houseDoorBottom.x] = TILE.PATH;

    const gateRows = [Math.floor(ROWS / 2) - 1, Math.floor(ROWS / 2) + 1];
    for (const y of gateRows) {
      grid[y][0] = TILE.PATH;
      grid[y][COLS - 1] = TILE.PATH;
      grid[y][1] = TILE.PATH;
      grid[y][COLS - 2] = TILE.PATH;
    }

    const connected = findConnectedPathCells(grid, gateRows);
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (grid[y][x] === TILE.PATH && !connected[y][x]) {
          grid[y][x] = TILE.WALL;
        }
      }
    }

    return {
      grid,
      gateRows,
      ghostHouse: { top: centerTop, bottom: centerBottom, left: centerLeft, right: centerRight },
    };
  }

  function posKey(x, y) {
    return `${x},${y}`;
  }

  function validPacmanCell(grid, x, y) {
    if (!inBounds(x, y)) {
      return false;
    }
    return grid[y][x] === TILE.PATH;
  }

  function validGhostCell(state, x, y, ghost) {
    if (!inBounds(x, y)) {
      return false;
    }
    if (x === 0 || x === COLS - 1) {
      return false;
    }

    const tile = state.grid[y][x];
    if (tile === TILE.WALL) {
      return false;
    }
    if (tile === TILE.GHOST_HOUSE && ghost.hasExited) {
      return false;
    }
    return true;
  }

  function choosePacmanStart(state) {
    const cells = [];
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (state.grid[y][x] === TILE.PATH) {
          cells.push({ x, y });
        }
      }
    }

    let pick = cells[randomInt(cells.length)];
    while (state.superPellets.has(posKey(pick.x, pick.y))) {
      pick = cells[randomInt(cells.length)];
    }

    if (Math.random() < 0.4) {
      state.pellets.delete(posKey(pick.x, pick.y));
    }

    return pick;
  }

  function placePellets(state) {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (state.grid[y][x] === TILE.PATH) {
          state.pellets.add(posKey(x, y));
        }
      }
    }

    const keys = Array.from(state.pellets.values());
    shuffle(keys);
    for (let i = 0; i < Math.min(SUPER_PELLET_COUNT, keys.length); i += 1) {
      const key = keys[i];
      state.superPellets.add(key);
    }
  }

  function createGhosts(state) {
    const colors = ["#ff2f2f", "#00d7ff", "#ff7f11", "#ff66c4", "#7bff00", "#ffd400"];
    const ghosts = [];
    const centerY = Math.floor((state.ghostHouse.top + state.ghostHouse.bottom) / 2);
    const startXs = [
      state.ghostHouse.left + 1,
      state.ghostHouse.left + 2,
      state.ghostHouse.left + 3,
      state.ghostHouse.right - 3,
      state.ghostHouse.right - 2,
      state.ghostHouse.right - 1,
    ];

    const count = 6;
    for (let i = 0; i < count; i += 1) {
      ghosts.push({
        id: i,
        x: startXs[i],
        y: centerY,
        color: colors[i % colors.length],
        hasExited: false,
        retired: false,
      });
    }

    return ghosts;
  }

  function applyGateTeleport(entity, gateRows, canUseGates) {
    if (!canUseGates) {
      return;
    }
    if (!gateRows.includes(entity.y)) {
      return;
    }
    if (entity.x < 0) {
      entity.x = COLS - 1;
    } else if (entity.x > COLS - 1) {
      entity.x = 0;
    }
  }

  function initState() {
    const { grid, gateRows, ghostHouse } = buildMaze();
    const state = {
      grid,
      gateRows,
      ghostHouse,
      pellets: new Set(),
      superPellets: new Set(),
      pacman: { x: 1, y: 1, dir: DIRS.LEFT },
      ghosts: [],
      score: 0,
      gameOver: false,
      won: false,
      flashingUntil: 0,
      isRunning: false,
      promptShown: false,
      pendingHighScoreName: false,
      highScore: cachedHighScore,
      highScorer: cachedHighScorer,
    };

    placePellets(state);
    state.pacman = { ...choosePacmanStart(state), dir: DIRS.LEFT };
    state.ghosts = createGhosts(state);
    return state;
  }

  async function fetchHighScore() {
    try {
      const response = await fetch("/api/highscore", {
        method: "GET",
        headers: { "Accept": "application/json" },
      });
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      cachedHighScore = Number(payload.score || 0);
      cachedHighScorer = (payload.name || "N/A").trim() || "N/A";
    } catch (_err) {
      cachedHighScore = 0;
      cachedHighScorer = "N/A";
    }
  }

  async function saveHighScore(score, name) {
    const response = await fetch("/api/highscore", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ score, name }),
    });

    if (!response.ok) {
      return false;
    }

    const payload = await response.json();
    cachedHighScore = Number(payload.score || 0);
    cachedHighScorer = (payload.name || "N/A").trim() || "N/A";
    return true;
  }

  function syncHud() {
    scoreEl.textContent = String(gameState.score);
    highScoreEl.textContent = String(gameState.highScore);
    highScorerEl.textContent = gameState.highScorer;
  }

  function resizeCanvas() {
    const width = Math.floor(window.innerWidth * 0.8);
    const height = Math.floor(window.innerHeight * 0.8);
    canvas.width = Math.max(width, 560);
    canvas.height = Math.max(height, 620);
  }

  function cellMetrics() {
    const cellW = canvas.width / COLS;
    const cellH = canvas.height / ROWS;
    const cellSize = Math.min(cellW, cellH);
    const offsetX = (canvas.width - cellSize * COLS) / 2;
    const offsetY = (canvas.height - cellSize * ROWS) / 2;
    return { cellSize, offsetX, offsetY };
  }

  function setScore(value) {
    gameState.score = value;
    scoreEl.textContent = String(value);

    if (value > gameState.highScore) {
      gameState.highScore = value;
      gameState.pendingHighScoreName = true;
      highScoreEl.textContent = String(gameState.highScore);
    }
  }

  function updateHighScorer(name) {
    const normalized = name.trim() || "Player";
    gameState.highScorer = normalized;
    highScorerEl.textContent = normalized;
    cachedHighScorer = normalized;
  }

  function finishGame({ won, buttonText }) {
    gameState.won = won;
    gameState.gameOver = true;
    stopLoop();
    startBtn.textContent = buttonText;
    startBtn.classList.remove("hidden");

    if (gameState.pendingHighScoreName && !gameState.promptShown) {
      gameState.promptShown = true;
      modal.classList.remove("hidden");
      nameInput.focus();
    }
  }

  function consumeAtPacman() {
    const key = posKey(gameState.pacman.x, gameState.pacman.y);
    if (!gameState.pellets.has(key)) {
      return;
    }

    mouthFrames = 6;
    gameState.pellets.delete(key);

    if (gameState.superPellets.has(key)) {
      gameState.superPellets.delete(key);
      setScore(gameState.score + 10);
      gameState.flashingUntil = Date.now() + FLASH_DURATION_MS;
    } else {
      setScore(gameState.score + 1);
    }

    if (gameState.pellets.size === 0) {
      finishGame({ won: true, buttonText: "You won - Play Again" });
    }
  }

  function movePacman() {
    if (!gameState || gameState.gameOver) {
      return;
    }

    if (queuedDirection) {
      const nx = gameState.pacman.x + queuedDirection.x;
      const ny = gameState.pacman.y + queuedDirection.y;
      const canTurn =
        (nx < 0 || nx >= COLS
          ? gameState.gateRows.includes(gameState.pacman.y)
          : validPacmanCell(gameState.grid, nx, ny));
      if (canTurn) {
        gameState.pacman.dir = queuedDirection;
      }
    }

    const next = {
      x: gameState.pacman.x + gameState.pacman.dir.x,
      y: gameState.pacman.y + gameState.pacman.dir.y,
    };

    if (next.x < 0 || next.x >= COLS) {
      if (gameState.gateRows.includes(gameState.pacman.y)) {
        gameState.pacman.x = next.x;
        applyGateTeleport(gameState.pacman, gameState.gateRows, true);
      }
    } else if (validPacmanCell(gameState.grid, next.x, next.y)) {
      gameState.pacman.x = next.x;
      gameState.pacman.y = next.y;
    }

    consumeAtPacman();
    checkCollisions();
  }

  function directionScoreForGhost(ghost, dir) {
    const nx = ghost.x + dir.x;
    const ny = ghost.y + dir.y;
    if (!validGhostCell(gameState, nx, ny, ghost)) {
      return -9999;
    }

    const dist = Math.abs(gameState.pacman.x - nx) + Math.abs(gameState.pacman.y - ny);
    const randomBoost = Math.random() * 5;
    return 25 - dist + randomBoost;
  }

  function moveGhosts() {
    if (!gameState || gameState.gameOver) {
      return;
    }

    for (const ghost of gameState.ghosts) {
      if (ghost.retired) {
        continue;
      }

      const candidates = [DIRS.LEFT, DIRS.RIGHT, DIRS.UP, DIRS.DOWN];
      let bestDir = candidates[0];
      let bestScore = -9999;

      for (const dir of candidates) {
        const score = directionScoreForGhost(ghost, dir);
        if (score > bestScore) {
          bestScore = score;
          bestDir = dir;
        }
      }

      if (Math.random() < 0.2) {
        bestDir = candidates[randomInt(candidates.length)];
      }

      const nx = ghost.x + bestDir.x;
      const ny = ghost.y + bestDir.y;
      if (validGhostCell(gameState, nx, ny, ghost)) {
        ghost.x = nx;
        ghost.y = ny;
      }

      if (
        ghost.y < gameState.ghostHouse.top ||
        ghost.y > gameState.ghostHouse.bottom ||
        ghost.x < gameState.ghostHouse.left ||
        ghost.x > gameState.ghostHouse.right
      ) {
        ghost.hasExited = true;
      }
    }

    checkCollisions();
  }

  function checkCollisions() {
    const flashing = Date.now() < gameState.flashingUntil;
    for (const ghost of gameState.ghosts) {
      if (ghost.retired) {
        continue;
      }
      if (ghost.x === gameState.pacman.x && ghost.y === gameState.pacman.y) {
        if (flashing) {
          ghost.retired = true;
          setScore(gameState.score + 25);
        } else {
          finishGame({ won: false, buttonText: "Game Over - Play Again" });
          return;
        }
      }
    }
  }

  function drawGrid() {
    const { cellSize, offsetX, offsetY } = cellMetrics();

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const tile = gameState.grid[y][x];
        if (tile === TILE.PATH || tile === TILE.GHOST_HOUSE) {
          ctx.fillStyle = "#000000";
          ctx.fillRect(offsetX + x * cellSize, offsetY + y * cellSize, cellSize, cellSize);
        }
      }
    }

    ctx.fillStyle = "#000000";
    for (let y = gameState.ghostHouse.top; y <= gameState.ghostHouse.bottom; y += 1) {
      for (let x = gameState.ghostHouse.left; x <= gameState.ghostHouse.right; x += 1) {
        ctx.fillRect(
          offsetX + x * cellSize + 1,
          offsetY + y * cellSize + 1,
          Math.max(1, cellSize - 2),
          Math.max(1, cellSize - 2)
        );
      }
    }

    for (const y of gameState.gateRows) {
      ctx.fillStyle = "#ffff00";
      ctx.fillRect(offsetX, offsetY + y * cellSize + cellSize * 0.35, cellSize, cellSize * 0.3);
      ctx.fillRect(
        offsetX + (COLS - 1) * cellSize,
        offsetY + y * cellSize + cellSize * 0.35,
        cellSize,
        cellSize * 0.3
      );
    }
  }

  function drawPellets() {
    const { cellSize, offsetX, offsetY } = cellMetrics();
    for (const key of gameState.pellets) {
      const [x, y] = key.split(",").map(Number);
      const isSuper = gameState.superPellets.has(key);
      const radius = isSuper ? cellSize * 0.16 : cellSize * 0.08;
      ctx.fillStyle = isSuper ? "#ff3333" : "#ff69b4";
      ctx.beginPath();
      ctx.arc(
        offsetX + x * cellSize + cellSize / 2,
        offsetY + y * cellSize + cellSize / 2,
        radius,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  function drawPacman() {
    const { cellSize, offsetX, offsetY } = cellMetrics();
    const radius = cellSize * 0.375;
    const centerX = offsetX + gameState.pacman.x * cellSize + cellSize / 2;
    const centerY = offsetY + gameState.pacman.y * cellSize + cellSize / 2;

    let angle = 0;
    if (gameState.pacman.dir === DIRS.RIGHT) {
      angle = 0;
    } else if (gameState.pacman.dir === DIRS.LEFT) {
      angle = Math.PI;
    } else if (gameState.pacman.dir === DIRS.UP) {
      angle = -Math.PI / 2;
    } else if (gameState.pacman.dir === DIRS.DOWN) {
      angle = Math.PI / 2;
    }

    const mouthOpen = mouthFrames > 0 ? 0.1 : 0.35;
    if (mouthFrames > 0) {
      mouthFrames -= 1;
    }

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, angle + mouthOpen, angle - mouthOpen + Math.PI * 2, false);
    ctx.closePath();
    ctx.fill();
  }

  function drawGhost(ghost) {
    const { cellSize, offsetX, offsetY } = cellMetrics();
    const x = offsetX + ghost.x * cellSize;
    const y = offsetY + ghost.y * cellSize;
    const flashing = Date.now() < gameState.flashingUntil;

    if (ghost.retired) {
      return;
    }

    const isFlashFrame = flashing && Math.floor(Date.now() / 180) % 2 === 0;
    ctx.fillStyle = isFlashFrame ? "#ffffff" : ghost.color;

    ctx.beginPath();
    ctx.arc(x + cellSize / 2, y + cellSize * 0.45, cellSize * 0.35, Math.PI, 0);
    ctx.lineTo(x + cellSize * 0.85, y + cellSize * 0.9);
    ctx.lineTo(x + cellSize * 0.65, y + cellSize * 0.75);
    ctx.lineTo(x + cellSize * 0.5, y + cellSize * 0.9);
    ctx.lineTo(x + cellSize * 0.35, y + cellSize * 0.75);
    ctx.lineTo(x + cellSize * 0.15, y + cellSize * 0.9);
    ctx.closePath();
    ctx.fill();
  }

  function drawEndOverlay() {
    if (!gameState.gameOver) {
      return;
    }
    const message = gameState.won ? "YOU WIN" : "GAME OVER";
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "28px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);
  }

  function render() {
    if (!gameState) {
      return;
    }
    drawGrid();
    drawPellets();
    drawPacman();
    for (const ghost of gameState.ghosts) {
      drawGhost(ghost);
    }
    drawEndOverlay();
    animationFrame = requestAnimationFrame(render);
  }

  function stopLoop() {
    if (pacmanTimer) {
      clearInterval(pacmanTimer);
      pacmanTimer = null;
    }
    if (ghostTimer) {
      clearInterval(ghostTimer);
      ghostTimer = null;
    }
  }

  function initializeBoard() {
    gameState = initState();
    queuedDirection = DIRS.LEFT;
    mouthFrames = 0;
    syncHud();
  }

  async function startGame() {
    stopLoop();
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }

    await fetchHighScore();
    initializeBoard();

    startBtn.classList.add("hidden");
    modal.classList.add("hidden");

    // Render immediately so pellets and super-pellets are visible before movement begins.
    render();
    pacmanTimer = setInterval(movePacman, PACMAN_TICK_MS);
    ghostTimer = setInterval(moveGhosts, GHOST_TICK_MS);
  }

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (!KEY_TO_DIR[key]) {
      return;
    }
    queuedDirection = KEY_TO_DIR[key];
    event.preventDefault();
  });

  startBtn.addEventListener("click", startGame);

  nameSubmit.addEventListener("click", async () => {
    const chosenName = nameInput.value;
    const saved = await saveHighScore(gameState.highScore, chosenName);
    if (saved) {
      updateHighScorer(cachedHighScorer);
      gameState.pendingHighScoreName = false;
    }
    modal.classList.add("hidden");
    nameInput.value = "";
  });

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  (async () => {
    modal.classList.add("hidden");
    await fetchHighScore();
    initializeBoard();
    render();
  })();
})();
