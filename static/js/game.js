(() => {
  const DEFAULT_CONFIG = {
    rows: 31,
    cols: 28,
    palette: {
      wall: "#0d1047",
      path: "#000000",
      pacman: "#ffffff",
      pellet: "#ff80c8",
      superPellet: "#ff0000",
      border: "#ffffff",
    },
  };

  function normalizeDimension(value, fallback) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      return fallback;
    }
    let clamped = Math.max(21, Math.min(61, parsed));
    if (clamped % 2 === 0) {
      clamped -= 1;
    }
    return clamped;
  }

  function normalizeColor(value, fallback) {
    const text = String(value || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : fallback;
  }

  const bootConfigEl = document.getElementById("boot-config");
  let runtimeConfig = {};
  try {
    runtimeConfig = bootConfigEl?.dataset?.gameConfig
      ? JSON.parse(bootConfigEl.dataset.gameConfig)
      : (window.GAME_CONFIG || {});
  } catch (_err) {
    runtimeConfig = window.GAME_CONFIG || {};
  }
  const normalizedPath = window.location.pathname.endsWith("/")
    ? window.location.pathname
    : `${window.location.pathname}/`;
  const fallbackHighScoreApiUrl = new URL(
    "api/highscore",
    `${window.location.origin}${normalizedPath}`
  ).toString();
  const HIGH_SCORE_API_URL =
    bootConfigEl?.dataset?.highScoreApiUrl || window.HIGH_SCORE_API_URL || fallbackHighScoreApiUrl;
  const ROWS = normalizeDimension(runtimeConfig.rows, DEFAULT_CONFIG.rows);
  const COLS = normalizeDimension(runtimeConfig.cols, DEFAULT_CONFIG.cols);
  const PALETTE = {
    wall: normalizeColor(runtimeConfig?.palette?.wall, DEFAULT_CONFIG.palette.wall),
    path: normalizeColor(runtimeConfig?.palette?.path, DEFAULT_CONFIG.palette.path),
    pacman: normalizeColor(runtimeConfig?.palette?.pacman, DEFAULT_CONFIG.palette.pacman),
    pellet: normalizeColor(runtimeConfig?.palette?.pellet, DEFAULT_CONFIG.palette.pellet),
    superPellet: normalizeColor(runtimeConfig?.palette?.superPellet, DEFAULT_CONFIG.palette.superPellet),
    border: normalizeColor(runtimeConfig?.palette?.border, DEFAULT_CONFIG.palette.border),
  };

  const THEMES = {
    classic: {
      "--bg-1": "#02061f",
      "--bg-2": "#05154f",
      "--panel": "rgba(4, 14, 54, 0.7)",
      "--line": "#8be9ff",
      "--text": "#f1f1f1",
      "--accent": "#f7d745",
    },
    light: {
      "--bg-1": "#e8eefc",
      "--bg-2": "#c3d8ff",
      "--panel": "rgba(255, 255, 255, 0.82)",
      "--line": "#194ca8",
      "--text": "#0e1f49",
      "--accent": "#ffb300",
    },
    dark: {
      "--bg-1": "#040404",
      "--bg-2": "#151515",
      "--panel": "rgba(10, 10, 10, 0.78)",
      "--line": "#6e6e6e",
      "--text": "#e8e8e8",
      "--accent": "#f84e4e",
    },
  };

  const SUPER_PELLET_COUNT = 10;
  const FLASH_DURATION_MS = 20000;
  const GHOST_RESPAWN_MIN_MS = 20000;
  const GHOST_RESPAWN_MAX_MS = 30000;
  const SCATTER_MIN_MS = 15000;
  const SCATTER_MAX_MS = 35000;
  const CHASE_MIN_MS = 15000;
  const CHASE_MAX_MS = 25000;
  const PACMAN_TICK_MS_BY_DIFFICULTY = {
    relaxed: 190,
    classic: 180,
    arcade: 145,
  };
  const GHOST_TICK_MS_BY_DIFFICULTY = {
    relaxed: 355,
    classic: 335,
    arcade: 285,
  };

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
    arrowleft: DIRS.LEFT,
    s: DIRS.RIGHT,
    arrowright: DIRS.RIGHT,
    w: DIRS.UP,
    arrowup: DIRS.UP,
    z: DIRS.DOWN,
    arrowdown: DIRS.DOWN,
  };

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const highScoreEl = document.getElementById("high-score");
  const highScorerEl = document.getElementById("high-scorer");
  const ghostModeEl = document.getElementById("ghost-mode");
  const settingsBtn = document.getElementById("settings-btn");
  const runStatus = document.getElementById("run-status");
  const difficultyValueEl = document.getElementById("difficulty-value");
  const elapsedTimeEl = document.getElementById("elapsed-time");
  const settingsModal = document.getElementById("settings-modal");
  const difficultyBtns = document.querySelectorAll(".difficulty-btn");
  const themeBtns = document.querySelectorAll(".theme-btn");
  const settingsClose = document.getElementById("settings-close");
  const rowsInput = document.getElementById("settings-rows");
  const colsInput = document.getElementById("settings-cols");
  const fieldSizeCurrent = document.getElementById("field-size-current");
  const applyFieldSizeBtn = document.getElementById("apply-field-size-btn");
  const resetHighScoreBtn = document.getElementById("reset-high-score-btn");
  const touchControls = document.getElementById("touch-controls");
  const startBtn = document.getElementById("start-btn");
  const modal = document.getElementById("name-modal");
  const nameInput = document.getElementById("name-input");
  const nameSubmit = document.getElementById("name-submit");
  const RESET_HIGH_SCORE_API_URL =
    bootConfigEl?.dataset?.resetHighScoreApiUrl
    || window.RESET_HIGH_SCORE_API_URL
    || new URL("api/highscore/reset", window.location.href).toString();

  let gameState = null;
  let pacmanTimer = null;
  let ghostTimer = null;
  let animationFrame = null;
  let queuedDirection = null;
  let pressedDirectionKeys = [];
  let mouthFrames = 0;
  let cachedHighScore = 0;
  let cachedHighScorer = "N/A";
  let currentDifficulty = localStorage.getItem("pacman-difficulty") || "classic";
  let currentTheme = localStorage.getItem("pacman-theme") || "classic";
  const touchPointerDirections = new Map();

  function randomInt(max) {
    return Math.floor(Math.random() * max);
  }

  function getDirectionKey(key) {
    const normalized = String(key || "").toLowerCase();
    return KEY_TO_DIR[normalized] ? normalized : null;
  }

  function syncQueuedDirectionFromPressedKeys() {
    if (pressedDirectionKeys.length === 0) {
      return;
    }
    const activeKey = pressedDirectionKeys[0];
    queuedDirection = KEY_TO_DIR[activeKey];
  }

  function pressDirectionKey(key) {
    const normalized = getDirectionKey(key);
    if (!normalized) {
      return;
    }

    if (pressedDirectionKeys.includes(normalized)) {
      return;
    }

    pressedDirectionKeys.push(normalized);
    if (pressedDirectionKeys.length === 1) {
      queuedDirection = KEY_TO_DIR[normalized];
    }
  }

  function releaseDirectionKey(key) {
    const normalized = getDirectionKey(key);
    if (!normalized) {
      return;
    }

    const releasedIndex = pressedDirectionKeys.indexOf(normalized);
    if (releasedIndex === -1) {
      return;
    }

    pressedDirectionKeys.splice(releasedIndex, 1);
    if (releasedIndex === 0 && pressedDirectionKeys.length > 0) {
      syncQueuedDirectionFromPressedKeys();
    }
  }

  function clearDirectionKeys() {
    pressedDirectionKeys = [];
  }

  function isTouchDevice() {
    return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
  }

  function updateTouchControlsVisibility() {
    if (!touchControls) {
      return;
    }
    document.body.classList.toggle("touch-controls-visible", isTouchDevice());
  }

  function directionForTouchButton(button) {
    const key = button?.getAttribute("data-direction");
    return getDirectionKey(key);
  }

  function setTouchButtonActive(button, active) {
    if (!button) {
      return;
    }
    button.classList.toggle("is-active", active);
  }

  function pressTouchDirection(pointerId, button) {
    const directionKey = directionForTouchButton(button);
    if (!directionKey) {
      return;
    }

    touchPointerDirections.set(pointerId, directionKey);
    pressDirectionKey(directionKey);
    setTouchButtonActive(button, true);
  }

  function releaseTouchDirection(pointerId) {
    const directionKey = touchPointerDirections.get(pointerId);
    if (!directionKey) {
      return;
    }

    const button = touchControls?.querySelector(`[data-direction="${directionKey}"]`);
    releaseDirectionKey(directionKey);
    setTouchButtonActive(button, false);
    touchPointerDirections.delete(pointerId);
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

    // Add a small number of safe loops without creating broad corridors.
    for (let y = 1; y < ROWS - 1; y += 1) {
      for (let x = 1; x < COLS - 1; x += 1) {
        if (grid[y][x] !== TILE.WALL) {
          continue;
        }
        if (Math.random() >= 0.08) {
          continue;
        }

        const left = grid[y][x - 1] === TILE.PATH;
        const right = grid[y][x + 1] === TILE.PATH;
        const up = grid[y - 1][x] === TILE.PATH;
        const down = grid[y + 1][x] === TILE.PATH;
        const pathCount = [left, right, up, down].filter(Boolean).length;
        const oppositeHorizontal = left && right && !up && !down;
        const oppositeVertical = up && down && !left && !right;
        const cornerJoin = pathCount === 2 && !oppositeHorizontal && !oppositeVertical;

        if (oppositeHorizontal || oppositeVertical || cornerJoin) {
          grid[y][x] = TILE.PATH;
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

    // Enforce side accessibility without forcing long full-edge corridors:
    // for each side position, either the edge cell or the cell one step inward is a path.
    for (let y = 0; y < ROWS; y += 1) {
      if (grid[y][0] !== TILE.PATH && grid[y][1] !== TILE.PATH) {
        grid[y][1] = TILE.PATH;
      }
      if (grid[y][COLS - 1] !== TILE.PATH && grid[y][COLS - 2] !== TILE.PATH) {
        grid[y][COLS - 2] = TILE.PATH;
      }
    }
    for (let x = 0; x < COLS; x += 1) {
      if (grid[0][x] !== TILE.PATH && grid[1][x] !== TILE.PATH) {
        grid[1][x] = TILE.PATH;
      }
      if (grid[ROWS - 1][x] !== TILE.PATH && grid[ROWS - 2][x] !== TILE.PATH) {
        grid[ROWS - 2][x] = TILE.PATH;
      }
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

  function buildDistanceMap(state, startX, startY) {
    const distances = Array.from({ length: ROWS }, () => Array(COLS).fill(Number.POSITIVE_INFINITY));
    if (!inBounds(startX, startY) || state.grid[startY][startX] === TILE.WALL) {
      return distances;
    }

    const queue = [{ x: startX, y: startY }];
    distances[startY][startX] = 0;
    let index = 0;
    while (index < queue.length) {
      const cur = queue[index];
      index += 1;
      const curDist = distances[cur.y][cur.x];
      for (const n of neighbors4(cur.x, cur.y)) {
        if (state.grid[n.y][n.x] === TILE.WALL || distances[n.y][n.x] <= curDist + 1) {
          continue;
        }
        distances[n.y][n.x] = curDist + 1;
        queue.push(n);
      }
    }

    return distances;
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

  function randomRangeInt(min, max) {
    return min + randomInt(max - min + 1);
  }

  function nextScatterDurationMs() {
    return randomRangeInt(SCATTER_MIN_MS, SCATTER_MAX_MS);
  }

  function nextChaseDurationMs() {
    return randomRangeInt(CHASE_MIN_MS, CHASE_MAX_MS);
  }

  function createGhosts(state, now) {
    const colors = ["#ff2f2f", "#00d7ff", "#ff7f11", "#ff66c4", "#7bff00", "#ffd400"];
    const ghosts = [];
    const centerY = Math.floor((state.ghostHouse.top + state.ghostHouse.bottom) / 2);
    const centerX = Math.floor((state.ghostHouse.left + state.ghostHouse.right) / 2);
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
        respawnAt: 0,
        homeX: centerX,
        homeY: centerY,
        phaseMode: "scatter",
        phaseUntil: now + nextScatterDurationMs(),
        lastDir: DIRS.LEFT,
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
    const now = Date.now();
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
      startedAt: 0,
      highScore: cachedHighScore,
      highScorer: cachedHighScorer,
      pacmanDistanceMap: null,
    };

    placePellets(state);
    state.pacman = { ...choosePacmanStart(state), dir: DIRS.LEFT };
    state.ghosts = createGhosts(state, now);
    state.pacmanDistanceMap = buildDistanceMap(state, state.pacman.x, state.pacman.y);
    return state;
  }

  async function fetchHighScore() {
    try {
      const response = await fetch(HIGH_SCORE_API_URL, {
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
    const response = await fetch(HIGH_SCORE_API_URL, {
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

  function getCurrentGhostMode() {
    if (!gameState || gameState.ghosts.length === 0) {
      return "-";
    }

    const now = Date.now();
    const isFlashing = now < gameState.flashingUntil;
    if (isFlashing) {
      return "FRIGHT";
    }

    const modes = new Set();
    for (const ghost of gameState.ghosts) {
      if (!ghost.retired) {
        modes.add(ghost.phaseMode);
      }
    }

    if (modes.size === 0) {
      return "-";
    }
    if (modes.size === 1) {
      return Array.from(modes)[0].toUpperCase();
    }
    return Array.from(modes).map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join("/");
  }

  function normalizeDifficulty(value) {
    if (value === "easy") {
      return "relaxed";
    }
    if (value === "medium") {
      return "classic";
    }
    if (value === "hard") {
      return "arcade";
    }
    return ["relaxed", "classic", "arcade"].includes(value) ? value : "classic";
  }

  function difficultyLabel(value) {
    if (value === "relaxed") {
      return "Relaxed";
    }
    if (value === "arcade") {
      return "Arcade";
    }
    return "Classic";
  }

  function formatElapsedTime(totalMs) {
    const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function isGameInProgress() {
    return Boolean(gameState) && !gameState.gameOver && startBtn.classList.contains("hidden");
  }

  function updateRunStatusHud() {
    if (difficultyValueEl) {
      difficultyValueEl.textContent = difficultyLabel(currentDifficulty);
    }

    const inProgress = isGameInProgress();
    settingsBtn.classList.toggle("hidden", inProgress);
    if (runStatus) {
      runStatus.classList.toggle("hidden", !inProgress);
    }

    if (elapsedTimeEl) {
      if (inProgress && gameState.startedAt) {
        elapsedTimeEl.textContent = formatElapsedTime(Date.now() - gameState.startedAt);
      } else {
        elapsedTimeEl.textContent = "00:00";
      }
    }
  }

  function normalizeTheme(value) {
    return ["light", "dark", "classic"].includes(value) ? value : "classic";
  }

  function setActiveButton(buttons, attrName, value) {
    buttons.forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute(attrName) === value);
    });
  }

  function applyTheme(theme, persist = true) {
    const normalized = normalizeTheme(theme);
    const vars = THEMES[normalized];
    Object.entries(vars).forEach(([key, val]) => {
      document.documentElement.style.setProperty(key, val);
    });
    currentTheme = normalized;
    setActiveButton(themeBtns, "data-theme", normalized);
    if (persist) {
      localStorage.setItem("pacman-theme", normalized);
    }
  }

  function normalizeFieldSizeValue(value, fallback) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      return fallback;
    }
    let clamped = Math.max(21, Math.min(61, parsed));
    if (clamped % 2 === 0) {
      clamped -= 1;
    }
    return clamped;
  }

  function refreshSettingsSummary() {
    rowsInput.value = String(ROWS);
    colsInput.value = String(COLS);
    fieldSizeCurrent.textContent = `Current: ${ROWS} x ${COLS}`;
    setActiveButton(difficultyBtns, "data-difficulty", currentDifficulty);
    setActiveButton(themeBtns, "data-theme", currentTheme);
  }

  function applyFieldSizeSetting() {
    const rows = normalizeFieldSizeValue(rowsInput.value, ROWS);
    const cols = normalizeFieldSizeValue(colsInput.value, COLS);
    const target = new URL(window.location.href);
    target.searchParams.set("rows", String(rows));
    target.searchParams.set("cols", String(cols));
    window.location.href = target.toString();
  }

  async function resetHighScore() {
    const firstConfirm = window.confirm("Reset high score to 0 (N/A)?");
    if (!firstConfirm) {
      return;
    }
    const secondConfirm = window.confirm("This cannot be undone. Confirm reset?");
    if (!secondConfirm) {
      return;
    }

    const response = await fetch(RESET_HIGH_SCORE_API_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
      },
    });
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    cachedHighScore = Number(payload.score || 0);
    cachedHighScorer = (payload.name || "N/A").trim() || "N/A";

    if (gameState) {
      gameState.highScore = cachedHighScore;
      gameState.highScorer = cachedHighScorer;
      highScoreEl.textContent = String(cachedHighScore);
      highScorerEl.textContent = cachedHighScorer;
    }
  }

  function syncHud() {
    scoreEl.textContent = String(gameState.score);
    highScoreEl.textContent = String(gameState.highScore);
    highScorerEl.textContent = gameState.highScorer;
    ghostModeEl.textContent = getCurrentGhostMode();
    updateRunStatusHud();
  }

  function resizeCanvas() {
    const width = Math.floor(window.innerWidth * 0.8);
    const height = Math.floor(window.innerHeight * 0.8);
    canvas.width = Math.max(width, COLS * 20);
    canvas.height = Math.max(height, ROWS * 20);
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
    updateRunStatusHud();

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

    const prevX = gameState.pacman.x;
    const prevY = gameState.pacman.y;
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

    if (gameState.pacman.x !== prevX || gameState.pacman.y !== prevY) {
      gameState.pacmanDistanceMap = buildDistanceMap(gameState, gameState.pacman.x, gameState.pacman.y);
    }

    consumeAtPacman();
    checkCollisions();
  }

  function ghostEffectiveMode(ghost, now) {
    return now < gameState.flashingUntil ? "fright" : ghost.phaseMode;
  }

  function advanceGhostPhase(ghost, now) {
    while (now >= ghost.phaseUntil) {
      if (ghost.phaseMode === "scatter") {
        ghost.phaseMode = "chase";
        ghost.phaseUntil = now + nextChaseDurationMs();
      } else {
        ghost.phaseMode = "scatter";
        ghost.phaseUntil = now + nextScatterDurationMs();
      }
    }
  }

  function validGhostMoves(ghost) {
    return [DIRS.LEFT, DIRS.RIGHT, DIRS.UP, DIRS.DOWN].filter((dir) => {
      const nx = ghost.x + dir.x;
      const ny = ghost.y + dir.y;
      return validGhostCell(gameState, nx, ny, ghost);
    });
  }

  function getDifficultyRandomness() {
    if (currentDifficulty === "relaxed") {
      return 0.72;
    }
    if (currentDifficulty === "arcade") {
      return 0.22;
    }
    return 0.5;
  }

  function shouldPickRandomMove() {
    const rand = Math.random();
    if (currentDifficulty === "relaxed") {
      return rand < 0.45;
    }
    if (currentDifficulty === "arcade") {
      return rand < 0.1;
    }
    return rand < 0.2;
  }

  function getPacmanTickMs() {
    return PACMAN_TICK_MS_BY_DIFFICULTY[currentDifficulty] || PACMAN_TICK_MS_BY_DIFFICULTY.classic;
  }

  function getGhostTickMs() {
    return GHOST_TICK_MS_BY_DIFFICULTY[currentDifficulty] || GHOST_TICK_MS_BY_DIFFICULTY.classic;
  }

  function chooseScatterMove(ghost, moves) {
    const centerX = ghost.homeX;
    const centerY = ghost.homeY;
    let bestMove = moves[0];
    let bestScore = -9999;

    for (const move of moves) {
      const nx = ghost.x + move.x;
      const ny = ghost.y + move.y;
      const awayFromPen = Math.abs(nx - centerX) + Math.abs(ny - centerY);
      let nearestOther = COLS + ROWS;

      for (const other of gameState.ghosts) {
        if (other.id === ghost.id || other.retired) {
          continue;
        }
        const distOther = Math.abs(nx - other.x) + Math.abs(ny - other.y);
        nearestOther = Math.min(nearestOther, distOther);
      }

      const randomness = getDifficultyRandomness();
      const randomBoost = Math.random() * randomness;
      const difficultyMultiplier = currentDifficulty === "arcade" ? 1.35 : currentDifficulty === "relaxed" ? 0.55 : 1.0;
      const score = (awayFromPen * 1.2 + nearestOther * 1.1) * difficultyMultiplier + randomBoost;
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  function chooseChaseMove(ghost, moves) {
    const distMap = gameState.pacmanDistanceMap;
    let bestMove = moves[0];
    let bestDist = Number.POSITIVE_INFINITY;

    for (const move of moves) {
      const nx = ghost.x + move.x;
      const ny = ghost.y + move.y;
      const dist = distMap[ny][nx];
      if (dist < bestDist) {
        bestDist = dist;
        bestMove = move;
      }
    }

    if (shouldPickRandomMove()) {
      bestMove = moves[randomInt(moves.length)];
    }

    return bestMove;
  }

  function chooseFrightMove(ghost, moves) {
    const distMap = gameState.pacmanDistanceMap;
    let bestMove = moves[0];
    let bestScore = -9999;

    for (const move of moves) {
      const nx = ghost.x + move.x;
      const ny = ghost.y + move.y;
      const pathDist = distMap[ny][nx];
      const pacmanDist = Number.isFinite(pathDist)
        ? pathDist
        : Math.abs(gameState.pacman.x - nx) + Math.abs(gameState.pacman.y - ny) + COLS + ROWS;
      const difficultyMultiplier = currentDifficulty === "arcade" ? 1.25 : currentDifficulty === "relaxed" ? 0.65 : 1.0;
      const score = pacmanDist * difficultyMultiplier + Math.random() * getDifficultyRandomness();
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  function chooseGhostMove(ghost, now) {
    const moves = validGhostMoves(ghost);
    if (moves.length === 0) {
      return null;
    }

    const mode = ghostEffectiveMode(ghost, now);
    if (mode === "chase") {
      return chooseChaseMove(ghost, moves);
    }
    if (mode === "fright") {
      return chooseFrightMove(ghost, moves);
    }
    return chooseScatterMove(ghost, moves);
  }

  function respawnDelayMs() {
    return GHOST_RESPAWN_MIN_MS + randomInt(GHOST_RESPAWN_MAX_MS - GHOST_RESPAWN_MIN_MS + 1);
  }

  function reviveGhostIfReady(ghost, now) {
    if (!ghost.retired || now < ghost.respawnAt) {
      return false;
    }

    ghost.x = ghost.homeX;
    ghost.y = ghost.homeY;
    ghost.hasExited = false;
    ghost.retired = false;
    ghost.respawnAt = 0;
    ghost.phaseMode = "scatter";
    ghost.phaseUntil = now + nextScatterDurationMs();
    ghost.lastDir = DIRS.LEFT;
    return true;
  }

  function moveGhosts() {
    if (!gameState || gameState.gameOver) {
      return;
    }

    const now = Date.now();
    for (const ghost of gameState.ghosts) {
      reviveGhostIfReady(ghost, now);
      if (ghost.retired) {
        continue;
      }

      advanceGhostPhase(ghost, now);
      const bestDir = chooseGhostMove(ghost, now);
      if (!bestDir) {
        continue;
      }

      const nx = ghost.x + bestDir.x;
      const ny = ghost.y + bestDir.y;
      if (validGhostCell(gameState, nx, ny, ghost)) {
        ghost.x = nx;
        ghost.y = ny;
        ghost.lastDir = bestDir;
      }

      applyGateTeleport(ghost, gameState.gateRows, true);

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
          ghost.respawnAt = Date.now() + respawnDelayMs();
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

    // Wall / non-path areas: dark navy blue
    ctx.fillStyle = PALETTE.wall;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Path and ghost-house cells: black (accessible floor)
    ctx.fillStyle = PALETTE.path;
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const tile = gameState.grid[y][x];
        if (tile === TILE.PATH || tile === TILE.GHOST_HOUSE) {
          ctx.fillRect(offsetX + x * cellSize, offsetY + y * cellSize, cellSize, cellSize);
        }
      }
    }

    // Ghost house interior fill (slightly inset)
    ctx.fillStyle = PALETTE.path;
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

    // Dashed pen boundary: clearly marks ghost house as inaccessible for Pacman.
    const penWidth = gameState.ghostHouse.right - gameState.ghostHouse.left + 1;
    const penHeight = gameState.ghostHouse.bottom - gameState.ghostHouse.top + 1;
    ctx.strokeStyle = PALETTE.border;
    ctx.lineWidth = 1;
    ctx.setLineDash([Math.max(2, cellSize * 0.22), Math.max(2, cellSize * 0.14)]);
    ctx.strokeRect(
      offsetX + gameState.ghostHouse.left * cellSize + 0.5,
      offsetY + gameState.ghostHouse.top * cellSize + 0.5,
      penWidth * cellSize - 1,
      penHeight * cellSize - 1
    );
    ctx.setLineDash([]);

    // Thin white border lines along every path↔wall edge
    ctx.strokeStyle = PALETTE.border;
    ctx.lineWidth = 1;
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const tile = gameState.grid[y][x];
        if (tile !== TILE.PATH && tile !== TILE.GHOST_HOUSE) {
          continue;
        }
        const px = offsetX + x * cellSize;
        const py = offsetY + y * cellSize;
        const isGateRow = gameState.gateRows.includes(y);
        // Left edge
        const drawLeftEdge =
          (x === 0 && !isGateRow)
          || (x > 0 && gameState.grid[y][x - 1] !== TILE.PATH && gameState.grid[y][x - 1] !== TILE.GHOST_HOUSE);
        if (drawLeftEdge) {
          ctx.beginPath(); ctx.moveTo(px + 0.5, py); ctx.lineTo(px + 0.5, py + cellSize); ctx.stroke();
        }
        // Right edge
        const drawRightEdge =
          (x === COLS - 1 && !isGateRow)
          || (x < COLS - 1 && gameState.grid[y][x + 1] !== TILE.PATH && gameState.grid[y][x + 1] !== TILE.GHOST_HOUSE);
        if (drawRightEdge) {
          ctx.beginPath(); ctx.moveTo(px + cellSize - 0.5, py); ctx.lineTo(px + cellSize - 0.5, py + cellSize); ctx.stroke();
        }
        // Top edge
        if (y === 0 || (gameState.grid[y - 1][x] !== TILE.PATH && gameState.grid[y - 1][x] !== TILE.GHOST_HOUSE)) {
          ctx.beginPath(); ctx.moveTo(px, py + 0.5); ctx.lineTo(px + cellSize, py + 0.5); ctx.stroke();
        }
        // Bottom edge
        if (y === ROWS - 1 || (gameState.grid[y + 1][x] !== TILE.PATH && gameState.grid[y + 1][x] !== TILE.GHOST_HOUSE)) {
          ctx.beginPath(); ctx.moveTo(px, py + cellSize - 0.5); ctx.lineTo(px + cellSize, py + cellSize - 0.5); ctx.stroke();
        }
      }
    }
  }

  function drawPellets() {
    const { cellSize, offsetX, offsetY } = cellMetrics();
    for (const key of gameState.pellets) {
      const [x, y] = key.split(",").map(Number);
      const isSuper = gameState.superPellets.has(key);
      const radius = isSuper ? cellSize * 0.16 : cellSize * 0.08;
      ctx.fillStyle = isSuper ? PALETTE.superPellet : PALETTE.pellet;
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

    ctx.fillStyle = PALETTE.pacman;
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
    ghostModeEl.textContent = getCurrentGhostMode();
    updateRunStatusHud();
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

  function startMovementLoops() {
    pacmanTimer = setInterval(movePacman, getPacmanTickMs());
    ghostTimer = setInterval(moveGhosts, getGhostTickMs());
  }

  function initializeBoard() {
    gameState = initState();
    queuedDirection = DIRS.LEFT;
    pressedDirectionKeys = [];
    touchPointerDirections.clear();
    if (touchControls) {
      touchControls.querySelectorAll(".touch-control").forEach((button) => {
        button.classList.remove("is-active");
      });
    }
    mouthFrames = 0;
    canvas.style.backgroundColor = PALETTE.wall;
    gameState.startedAt = 0;
    syncHud();
  }

  function canRestartFromOverlay() {
    return !startBtn.classList.contains("hidden") && modal.classList.contains("hidden");
  }

  function handleRestartRequest(event) {
    if (!canRestartFromOverlay()) {
      return;
    }
    event?.preventDefault();
    startGame();
  }

  async function startGame() {
    stopLoop();
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }

    await fetchHighScore();
    initializeBoard();
    gameState.startedAt = Date.now();

    startBtn.classList.add("hidden");
    modal.classList.add("hidden");
    updateRunStatusHud();

    // Render immediately so pellets and super-pellets are visible before movement begins.
    render();
    startMovementLoops();
  }

  async function submitHighScoreName() {
    const chosenName = nameInput.value;
    const saved = await saveHighScore(gameState.highScore, chosenName);
    if (saved) {
      updateHighScorer(cachedHighScorer);
      gameState.pendingHighScoreName = false;
    }
    modal.classList.add("hidden");
    nameInput.value = "";
  }

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();

    if (key === "enter") {
      if (!modal.classList.contains("hidden")) {
        event.preventDefault();
        submitHighScoreName();
        return;
      }
      if (!startBtn.classList.contains("hidden")) {
        handleRestartRequest(event);
        return;
      }
    }

    if (!KEY_TO_DIR[key]) {
      return;
    }
    pressDirectionKey(key);
    event.preventDefault();
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    releaseDirectionKey(key);
  });

  window.addEventListener("blur", clearDirectionKeys);
  window.addEventListener("blur", () => {
    touchPointerDirections.clear();
    if (touchControls) {
      touchControls.querySelectorAll(".touch-control").forEach((button) => {
        button.classList.remove("is-active");
      });
    }
  });

  startBtn.addEventListener("click", handleRestartRequest);
  startBtn.addEventListener("pointerup", handleRestartRequest);
  canvas.addEventListener("click", handleRestartRequest);

  nameSubmit.addEventListener("click", submitHighScoreName);

  settingsBtn.addEventListener("click", () => {
    refreshSettingsSummary();
    settingsModal.classList.remove("hidden");
  });

  difficultyBtns.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      const difficulty = normalizeDifficulty(event.target.getAttribute("data-difficulty"));
      currentDifficulty = difficulty;
      localStorage.setItem("pacman-difficulty", difficulty);
      setActiveButton(difficultyBtns, "data-difficulty", difficulty);
      updateRunStatusHud();
      if (gameState && !gameState.gameOver && startBtn.classList.contains("hidden")) {
        stopLoop();
        startMovementLoops();
      }
    });
  });

  themeBtns.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      applyTheme(event.target.getAttribute("data-theme"));
    });
  });

  applyFieldSizeBtn.addEventListener("click", applyFieldSizeSetting);

  resetHighScoreBtn.addEventListener("click", resetHighScore);

  settingsClose.addEventListener("click", () => {
    settingsModal.classList.add("hidden");
  });

  if (touchControls) {
    touchControls.addEventListener("pointerdown", (event) => {
      const button = event.target.closest(".touch-control");
      if (!button) {
        return;
      }
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      pressTouchDirection(event.pointerId, button);
    });

    touchControls.addEventListener("pointerup", (event) => {
      const button = event.target.closest(".touch-control");
      if (button) {
        setTouchButtonActive(button, false);
      }
      releaseTouchDirection(event.pointerId);
    });

    touchControls.addEventListener("pointercancel", (event) => {
      releaseTouchDirection(event.pointerId);
    });

    touchControls.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "touch") {
        return;
      }
      releaseTouchDirection(event.pointerId);
    });
  }

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  updateTouchControlsVisibility();
  window.addEventListener("resize", updateTouchControlsVisibility);

  (async () => {
    modal.classList.add("hidden");
    settingsModal.classList.add("hidden");
    currentDifficulty = normalizeDifficulty(currentDifficulty);
    currentTheme = normalizeTheme(currentTheme);
    localStorage.setItem("pacman-difficulty", currentDifficulty);
    localStorage.setItem("pacman-theme", currentTheme);
    applyTheme(currentTheme, false);
    refreshSettingsSummary();
    updateRunStatusHud();
    await fetchHighScore();
    initializeBoard();
    render();
  })();
})();
