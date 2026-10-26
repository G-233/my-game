/* Global module order: game-config.js -> game-state.js -> pattern-system.js -> inventory-system.js -> audio-synth.js -> game.js. */
(function (root) {
  "use strict";

  const ENERGY_REGEN = 10;
  const PLACE_COST = 15;
  const ITEM_COST_MINIMUM = 1;

  const quality = {
    "白": { strength: 1, cost: 1, className: "white" },
    "绿": { strength: 1.3, cost: 1.2, className: "green" },
    "蓝": { strength: 1.6, cost: 1.5, className: "blue" },
    "金": { strength: 2, cost: 2, className: "gold" }
  };

  const items = {};
  function scaledDuration(baseSeconds, qualityMultiplier) {
    return Math.floor(baseSeconds * qualityMultiplier * 10) / 10;
  }

  function pointBomb(targetX, targetY, q) {
    const action = this;
    const gameApi = root.NeonGame.Game;
    if (!gameApi.inBounds(targetX, targetY)) return false;
    gameApi.explodeArea(targetX, targetY, 1, action.side);
    gameApi.setDyeCooldown(targetX, targetY, 1, 2);
    root.NeonGame.ART.renderEffect(null, "smallExplode", { x: targetX, y: targetY, r: 1 });
    root.NeonGame.ART.spawnParticles(targetX, targetY, 12, "explode");
    gameApi.shake(0.2, true);
    root.NeonGame.AUDIO.play("explode");
    return true;
  }
  function moveStone(targetX, targetY, q) { /* TODO: Implement move-stone behavior. */ }
  function reverseDye(targetX, targetY, q) { /* TODO: Implement reverse-dye behavior. */ }
  function vision(targetX, targetY, q) {
    const action = this;
    root.NeonGame.Game.addEffect("隐身", scaledDuration(9, q), { owner: action.side });
    root.NeonGame.ART.renderEffect(null, "stealth", { owner: action.side });
    return true;
  }
  function mark(targetX, targetY, q) {
    const action = this;
    const count = q >= 2 ? 3 : q >= 1.6 ? 2 : 1;
    const moved = root.NeonGame.Inventory.stealRandom(action.state, action.side, count);
    if (moved === 0) return false;
    root.NeonGame.ART.renderEffect(null, "steal", { count: moved, from: 1 - action.side, to: action.side });
    root.NeonGame.ART.spawnParticles(targetX, targetY, 8 + moved * 4, "steal");
    root.NeonGame.AUDIO.play("steal");
    return true;
  }
  function bomb(targetX, targetY, q) {
    const action = this;
    const radius = q >= 1.5 ? 2 : 1;
    root.NeonGame.Game.explodeArea(targetX, targetY, radius, action.side);
    root.NeonGame.Game.setDyeCooldown(targetX, targetY, radius, 3);
    root.NeonGame.ART.renderEffect(null, "bigExplode", { x: targetX, y: targetY, r: radius });
    root.NeonGame.ART.spawnParticles(targetX, targetY, 24, "explode");
    root.NeonGame.Game.shake(0.3, false);
    root.NeonGame.AUDIO.play("explode");
    return true;
  }
  function dye(targetX, targetY, q) {
    const action = this;
    const radius = q >= 2 ? 2 : q >= 1.5 ? 1 : 0;
    const cells = root.NeonGame.Game.getPiecesInArea({
      left: targetX - radius, right: targetX + radius,
      top: targetY - radius, bottom: targetY + radius
    }).filter(function (cell) {
      return cell.owner !== action.side && action.state.dyeCooldown[cell.y][cell.x] <= 0;
    });
    if (cells.length === 0) return false;
    cells.forEach(function (cell) {
      if (root.NeonGame.Game.changeOwner(cell.x, cell.y, action.side)) {
        root.NeonGame.Patterns.onStonePlaced(action.state, cell.x, cell.y, action.side);
      }
    });
    root.NeonGame.ART.renderEffect(null, "dyeSpread", { x: targetX, y: targetY, r: radius });
    root.NeonGame.ART.spawnParticles(targetX, targetY, 10, "dye");
    root.NeonGame.AUDIO.play("dye");
    return true;
  }
  function crossBomb(targetX, targetY, q) {
    const action = this;
    const arm = Math.floor(2 * q);
    for (let offset = -arm; offset <= arm; offset += 1) {
      root.NeonGame.Game.explodeCell(targetX + offset, targetY, action.side);
      if (offset !== 0) root.NeonGame.Game.explodeCell(targetX, targetY + offset, action.side);
    }
    root.NeonGame.Game.setDyeCooldown(targetX, targetY, arm, 2, true);
    root.NeonGame.ART.renderEffect(null, "crossExplode", { x: targetX, y: targetY, arm: arm });
    root.NeonGame.ART.spawnParticles(targetX, targetY, 20, "explode");
    root.NeonGame.AUDIO.play("explode");
    return true;
  }
  function delayedBomb(targetX, targetY, q) {
    const action = this;
    if (action.state.board[targetY][targetX] !== null) return false;
    root.NeonGame.Game.addEffect("地雷", scaledDuration(7.5, q), { x: targetX, y: targetY, owner: action.side });
    root.NeonGame.ART.renderEffect(null, "mine", { x: targetX, y: targetY, owner: action.side });
    return true;
  }
  function lineDye(targetX, targetY, q) { /* TODO: Implement line-dye behavior. */ }
  function blockade(targetX, targetY, q) { /* TODO: Implement blockade behavior. */ }
  function noPlaceOrder(targetX, targetY, q) {
    const action = this;
    root.NeonGame.Game.addEffect("禁落令", scaledDuration(5.25, q), { owner: action.side, target: 1 - action.side });
    root.NeonGame.ART.renderEffect(null, "lockBoard", { target: 1 - action.side });
    return true;
  }
  function noItems(targetX, targetY, q) {
    const action = this;
    root.NeonGame.Game.addEffect("禁道具", scaledDuration(5.25, q), { owner: action.side, target: 1 - action.side });
    root.NeonGame.ART.renderEffect(null, "freezeUI", { target: 1 - action.side });
    return true;
  }
  function shield(targetX, targetY, q) {
    const action = this;
    const radius = q >= 1.6 ? 2 : 1;
    root.NeonGame.Game.addEffect("护盾", scaledDuration(9, q), {
      owner: action.side, x: targetX, y: targetY, radius: radius
    });
    root.NeonGame.ART.renderEffect(null, "shieldZone", {
      x: targetX, y: targetY, radius: radius, owner: action.side
    });
    root.NeonGame.AUDIO.play("shield");
    return true;
  }
  function swap(targetX, targetY, q) { /* TODO: Implement swap behavior. */ }
  function energySiphon(targetX, targetY, q) { /* TODO: Implement energy-siphon behavior. */ }
  function taunt(targetX, targetY, q) { /* TODO: Implement taunt behavior. */ }
  function lineBomb(targetX, targetY, q) { /* TODO: Implement line-bomb behavior. */ }
  function infectionDye(targetX, targetY, q) { /* TODO: Implement infection-dye behavior. */ }
  function reboundShield(targetX, targetY, q) { /* TODO: Implement rebound-shield behavior. */ }
  function acceleration(targetX, targetY, q) {
    const action = this;
    root.NeonGame.Game.addEffect("加速", scaledDuration(9, q), { owner: action.side, multiplier: 2 });
    root.NeonGame.ART.renderEffect(null, "speedLines", { owner: action.side });
    return true;
  }
  function colorReverse(targetX, targetY, q) {
    const action = this;
    root.NeonGame.Game.addEffect("颜色反转", scaledDuration(7.5, q), { owner: action.side, target: 1 - action.side });
    root.NeonGame.ART.renderEffect(null, "colorInvert", { target: 1 - action.side });
    return true;
  }
  function doublePlace(targetX, targetY, q) {
    const action = this;
    root.NeonGame.Game.addEffect("双重落子", scaledDuration(6, q), {
      owner: action.side, extra: q >= 2 ? 2 : 1
    });
    root.NeonGame.ART.renderEffect(null, "doubleDrop", { owner: action.side });
    return true;
  }
  function pause(targetX, targetY, q) {
    root.NeonGame.Game.addEffect("暂停", scaledDuration(4, q), {});
    root.NeonGame.ART.renderEffect(null, "timeFreeze", {});
    return true;
  }
  function rewind(targetX, targetY, q) { /* TODO: Implement rewind behavior. */ }
  function blackHole(targetX, targetY, q) { /* TODO: Implement black-hole behavior. */ }
  function rowShift(targetX, targetY, q) { /* TODO: Implement row-shift behavior. */ }

  function defineItem(type, name, tier, costRange, effect, rare) {
    items[type] = { type: type, name: name, tier: tier, costRange: costRange, effect: effect, rare: rare === true };
  }

  defineItem("pointBomb", "小炸弹", 1, [30, 40], pointBomb);
  defineItem("mark", "偷道具", 1, [20, 30], mark);
  defineItem("moveStone", "挪子", 1, [30, 40], moveStone);
  defineItem("reverseDye", "反向染", 1, [30, 30], reverseDye);
  defineItem("vision", "隐身", 1, [30, 30], vision);
  defineItem("bomb", "炸弹", 2, [40, 50], bomb);
  defineItem("dye", "染色", 2, [30, 35], dye);
  defineItem("crossBomb", "十字炸", 2, [50, 60], crossBomb);
  defineItem("delayedBomb", "地雷", 2, [50, 60], delayedBomb);
  defineItem("lineDye", "线染", 2, [50, 60], lineDye);
  defineItem("blockade", "封锁", 2, [50, 50], blockade);
  defineItem("noPlaceOrder", "禁落令", 2, [50, 50], noPlaceOrder);
  defineItem("noItems", "禁道具", 2, [50, 50], noItems);
  defineItem("shield", "护盾", 2, [50, 50], shield);
  defineItem("swap", "换位", 2, [50, 50], swap);
  defineItem("energySiphon", "能量虹吸", 2, [50, 50], energySiphon);
  defineItem("taunt", "嘲讽靶心", 2, [40, 40], taunt);
  defineItem("lineBomb", "线炸", 3, [70, 70], lineBomb);
  defineItem("infectionDye", "传染染", 3, [70, 80], infectionDye);
  defineItem("reboundShield", "反弹盾", 3, [70, 70], reboundShield);
  defineItem("acceleration", "加速", 3, [60, 60], acceleration);
  defineItem("colorReverse", "颜色反转", 3, [60, 70], colorReverse);
  defineItem("doublePlace", "双重落子", 3, [60, 60], doublePlace);
  defineItem("pause", "暂停", 3, [60, 60], pause);
  defineItem("rewind", "回溯", 3, [90, 90], rewind, true);
  defineItem("blackHole", "黑洞", 3, [80, 80], blackHole, true);
  defineItem("rowShift", "整行平移", 3, [80, 80], rowShift, true);

  const patternTemplates = {
    square2: [[0, 0], [1, 0], [0, 1], [1, 1]],
    lShape: [[0, 0], [1, 0], [0, 1]],
    cross: [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]],
    rectangle2x3: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
    ring3: [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
    bigCross: [[0, 0], [0, -1], [0, -2], [0, 1], [0, 2], [-1, 0], [-2, 0], [1, 0], [2, 0]],
    square3: [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
    doubleFiveCross: [[-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [0, -2], [0, -1], [0, 1], [0, 2]]
  };

  root.NeonGame = {
    CONFIG: {
      COLS: 40,
      ROWS: 40,
      CELL: 42,
      BLOCKED: -1,
      ENERGY: {
        start: 0,
        max: 100,
        regenClassic: ENERGY_REGEN,
        regenInfiniteStart: ENERGY_REGEN,
        regenInfiniteFloor: ENERGY_REGEN,
        regenFadeSeconds: 600,
        placeCost: PLACE_COST,
        capBonus: 20
      },
      CLASSIC: {
        durationSeconds: 165,
        areaThreshold: 0.8,
        areaThresholdUnlockSeconds: 10,
        tieDifference: 0.05,
        overtimeSeconds: 15,
        overtimeOnTie: false
      },
      INFINITE: {
        health: 100,
        healthDrainPerSecond: 10,
        areaLeadThreshold: 0.3,
        areaLeadWarmupSeconds: 10,
        aiIntervalGrowthPerStage: 0.1,
        aiGrowthStageSeconds: 45,
        shrinkEverySeconds: 90,
        shrinkLayersPerEvent: 1,
        forecastEverySeconds: 90,
        forecastWarningSeconds: 3,
        forecastSize: 5
      },
      PRACTICE: {
        effectDurationMultiplier: 1
      },
      AI: {
        defaultDifficulty: "normal",
        minimumIntervalSeconds: 0.12,
        candidateSampleCount: 50,
        intentDurationSeconds: 5,
        difficulties: {
          easy: { label: "简单", minInterval: 1.2, maxInterval: 1.6, noise: 9, defenseWeight: 0.4, accuracy: 0.65 },
          normal: { label: "普通", minInterval: 0.8, maxInterval: 1.2, noise: 4, defenseWeight: 0.75, accuracy: 0.85 },
          hard: { label: "困难", minInterval: 0.5, maxInterval: 0.8, noise: 1.2, defenseWeight: 1.2, accuracy: 1.05 },
          hell: { label: "地狱", minInterval: 0.35, maxInterval: 0.5, noise: 0.25, defenseWeight: 1.6, accuracy: 1.2 }
        }
      },
      SCORE: {
        winnerBase: 100,
        drawBase: 50,
        areaScale: 100,
        efficiencyScale: 100,
        bombPenaltyPerStone: 10
      },
      UI: {
        toastSeconds: 1.8,
        patternToastSeconds: 2.1,
        patternFlashSeconds: 1.2,
        dropDurationSeconds: 0.48
      },
      INVENTORY: {
        displayLimit: 5,
        overflowLimit: 10,
        globalCooldownSeconds: 1,
        itemCostDecreasePerSecond: 2,
        itemCostMinimum: ITEM_COST_MINIMUM,
        rareDropChance: 0.04,
        rareUseLimit: 1
      },
      PATTERNS: {
        minimumLineLength: 4,
        cooldownSeconds: 19,
        tierDropChances: null,
        tier1FiveDropChance: 0.6,
        tier2QualityChances: { "绿": 0.7, "蓝": 0.3 },
        tier3QualityChances: { "蓝": 0.7, "金": 0.3 },
        patterns: {
          line4: { name: "四连", tier: 1, energy: 30, score: 20 },
          line3: { name: "三连", tier: 1, energy: 15, score: 10 },
          line5: { name: "五连", tier: 1, energy: 20, score: 25, dropChance: 0.6 },
          square2: { name: "方块阵", tier: 1, duration: 15, score: 15 },
          lShape: { name: "L 形阵", tier: 1, score: 15 },
          line6: { name: "六连", tier: 2, cap: 20, score: 35 },
          cross: { name: "十字阵", tier: 2, energy: 10, guaranteedDrop: true, score: 40 },
          rectangle2x3: { name: "矩形阵", tier: 2, duration: 22.5, pulseEvery: 3, pulseEnergy: 5, score: 35 },
          doubleThree: { name: "双三连", tier: 2, energy: 10, guaranteedDrop: true, score: 40 },
          ring3: { name: "回字阵", tier: 2, duration: 15, score: 35 },
          line7: { name: "七连", tier: 3, energy: 20, guaranteedDrop: true, score: 60 },
          bigCross: { name: "大十字", tier: 3, duration: 4.5, score: 55 },
          square3: { name: "田字阵", tier: 3, permanent: true, score: 65 },
          doubleFiveCross: { name: "双五交叉", tier: 3, fullEnergy: true, guaranteedDrop: true, score: 70 },
          symmetry: { name: "对称阵", tier: 3, randomTier2: true, score: 55 }
        },
        templates: patternTemplates
      },
      QUALITY: quality,
      ITEMS: items,
      ITEM_POOLS: {
        tier1: ["pointBomb", "vision", "mark"],
        tier2: ["bomb", "dye", "crossBomb", "delayedBomb", "lineDye", "blockade", "noPlaceOrder", "noItems", "shield", "swap", "energySiphon", "taunt"],
        tier3: ["lineBomb", "infectionDye", "reboundShield", "acceleration", "colorReverse", "doublePlace", "pause"],
        rare: ["rewind", "blackHole", "rowShift"]
      },
      STORAGE_KEYS: {
        classic: "neon-five-classic-score-v2",
        infinite: "neon-five-infinite-score-v2",
        audio: "neon-five-audio-enabled"
      }
    }
  };
  const config = root.NeonGame.CONFIG;
  const practiceDefaults = {
    regenRate: ENERGY_REGEN,
    energyMax: config.ENERGY.max,
    placeCost: PLACE_COST,
    globalCooldown: config.INVENTORY.globalCooldownSeconds,
    itemCostDecrease: config.INVENTORY.itemCostDecreasePerSecond,
    patternMinimumLineLength: config.PATTERNS.minimumLineLength,
    patternCooldown: config.PATTERNS.cooldownSeconds,
    tier1DropChance: 0.6,
    tier2DropChance: 1,
    tier3DropChance: 1,
    classicDuration: config.CLASSIC.durationSeconds,
    areaThreshold: config.CLASSIC.areaThreshold,
    dropDuration: config.UI.dropDurationSeconds,
    effectDurationMultiplier: 1,
    aiDifficulty: "off",
    aiIntervalOverride: "",
    invincible: false,
    debug: false
  };
  const practiceConfig = Object.assign({}, practiceDefaults);
  function applyPracticeConfig(active) {
    const values = active ? practiceConfig : practiceDefaults;
    config.ENERGY.regenClassic = values.regenRate;
    config.ENERGY.regenInfiniteStart = values.regenRate;
    config.ENERGY.regenInfiniteFloor = values.regenRate;
    config.ENERGY.max = values.energyMax;
    config.ENERGY.placeCost = values.placeCost;
    config.INVENTORY.globalCooldownSeconds = values.globalCooldown;
    config.INVENTORY.itemCostDecreasePerSecond = values.itemCostDecrease;
    config.PATTERNS.minimumLineLength = values.patternMinimumLineLength;
    config.PATTERNS.cooldownSeconds = values.patternCooldown;
    if (active) {
      config.PATTERNS.tierDropChances = config.PATTERNS.tierDropChances || {};
      config.PATTERNS.tierDropChances[1] = values.tier1DropChance;
      config.PATTERNS.tierDropChances[2] = values.tier2DropChance;
      config.PATTERNS.tierDropChances[3] = values.tier3DropChance;
    } else {
      config.PATTERNS.tierDropChances = null;
    }
    config.CLASSIC.durationSeconds = values.classicDuration;
    config.CLASSIC.areaThreshold = values.areaThreshold;
    config.UI.dropDurationSeconds = values.dropDuration;
    config.PRACTICE.effectDurationMultiplier = values.effectDurationMultiplier;
    root.NeonGame.practiceActive = active;
  }
  root.NeonGame.PRACTICE_CONFIG = practiceConfig;
  root.NeonGame.PRACTICE_DEFAULTS = practiceDefaults;
  root.NeonGame.applyPracticeConfig = applyPracticeConfig;
  applyPracticeConfig(false);
})(window);
