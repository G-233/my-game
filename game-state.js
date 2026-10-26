/* Global module order: game-config.js -> game-state.js -> pattern-system.js -> inventory-system.js -> audio-synth.js -> game.js. */
(function (root) {
  "use strict";

  const config = root.NeonGame.CONFIG;

  function createBoard() {
    return Array.from({ length: config.ROWS }, function () {
      return Array(config.COLS).fill(null);
    });
  }

  function createScore() {
    return {
      baseScore: 0,
      areaScore: 0,
      patternScore: 0,
      efficiencyScore: 0,
      bombPenalty: 0,
      totalScore: 0
    };
  }

  function createPlayer() {
    return {
      energy: config.ENERGY.start,
      energyCapacity: config.ENERGY.max,
      health: config.INFINITE.health,
      patternScore: 0,
      bombLosses: 0,
      score: createScore()
    };
  }

  function createInventory() {
    return {
      items: [],
      overflow: [],
      displayLimit: config.INVENTORY.displayLimit,
      overflowLimit: config.INVENTORY.overflowLimit,
      totalCount: 0
    };
  }

  function createState() {
    return {
      board: createBoard(),
      stonePlacedAt: Array.from({ length: config.ROWS }, function () { return Array(config.COLS).fill(-1); }),
      dyeCooldown: Array.from({ length: config.ROWS }, function () { return Array(config.COLS).fill(0); }),
      particles: [],
      visualEffects: [],
      uiState: {
        selectedItemId: null,
        toastText: "",
        toastRemaining: 0,
        toastKind: "normal",
        hoverCell: null,
        bombPreview: false,
        pointerDown: null,
        isPanning: false,
        modal: null,
        statusText: "能量充能中 · 点击空位落子"
      },
      mode: "classic",
      aiDifficulty: config.AI.defaultDifficulty,
      viewSide: 0,
      elapsed: 0,
      debugFps: 0,
      classicRemaining: config.CLASSIC.durationSeconds,
      overtimeRemaining: 0,
      ended: false,
      winner: null,
      endReason: "",
      players: [createPlayer(), createPlayer()],
      camera: { x: 0, y: 0, zoom: 1 },
      viewport: { width: 0, height: 0 },
      activeEffects: [],
      patternCooldowns: [new Map(), new Map()],
      rareDropAwarded: false,
      rareItemsUsed: 0,
      inventory: createInventory(),
      aiInventory: createInventory(),
      globalItemCooldownRemaining: 0,
      infinite: {
        aiDecisionRemaining: 0,
        aiIntent: null,
        aiRecentMoves: [],
        shrinkLayer: 0,
        nextShrinkAt: config.INFINITE.shrinkEverySeconds,
        nextForecastAt: config.INFINITE.forecastEverySeconds,
        forecast: null,
        areaLeadSide: null,
        areaLeadElapsed: 0,
        aiActions: 0
      },
      match: {
        totalStones: 0,
        itemUses: 0,
        patternEvents: [],
        startedAt: 0,
        finishedAt: 0
      },
      scores: {
        classic: [createScore(), createScore()],
        infinite: [createScore(), createScore()]
      },
      lastFrameTime: 0
    };
  }

  root.NeonGame.State = {
    createBoard: createBoard,
    createScore: createScore,
    createPlayer: createPlayer,
    createInventory: createInventory,
    createState: createState
  };
  root.NeonGame.state = createState();
  root.NeonGame.storageData = {
    classic: { bestScore: 0, games: 0 },
    infinite: { bestScore: 0, games: 0 }
  };
  root.NeonGame.achievements = [];
  root.NeonGame.leaderboardData = { classic: [], infinite: [] };
})(window);
