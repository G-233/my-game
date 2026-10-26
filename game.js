/* Global module order: game-config.js -> game-state.js -> pattern-system.js -> inventory-system.js -> audio-synth.js -> game.js. */
(function (root) {
  "use strict";

  const game = root.NeonGame;
  const config = game.CONFIG;
  const canvas = document.getElementById("gameCanvas");
  const context = canvas.getContext("2d");
  const shell = document.querySelector(".game-shell");
  const mobileDevice = window.matchMedia("(pointer: coarse)").matches;
  const $ = function (id) { return document.getElementById(id); };
  let state = game.state;
  let storageEnabled = true;
  let uiRefreshAccumulator = 0;
  let ruleCheckAccumulator = 0;
  const activePointers = new Map();
  let pinchGesture = null;
  const SKINS = {
    default: { id: "default", name: "默认", unlocked: true }
  };
  let currentSkinId = "default";
  const ART = {
    theme: {
      red: "#ff2d6f",
      blue: "#00d4ff",
      grid: "rgba(0,212,255,0.15)",
      glow: "#00f0ff",
      gold: "#ffd700",
      danger: "#ff3355",
      shield: "#00f0ff",
      stealth: "rgba(255,255,255,0.15)",
      background: "#080d18",
      darkBlue: "#0878dc",
      darkRed: "#db174e",
      particle: "#fff1bf",
      disabled: "#8993a3",
      disabledBright: "#b1b6c1",
      disabledDark: "#434957",
      blocked: "rgba(7, 10, 19, .96)",
      blockedLine: "rgba(255, 71, 126, .12)",
      lock: "#c084ff",
      harden: "#8bffe1",
      forecast: "#ff506f",
      white: "#f3fdff",
      disabledMid: "#969eaa",
      disabledLine: "rgba(226, 232, 242, .75)",
      boardGlowCenter: "rgba(23, 56, 84, 0.12)",
      boardGlowEdge: "rgba(7, 13, 24, 0.01)",
      gridGlow: "rgba(49, 217, 255, 0.16)",
      lockFill: "rgba(140, 93, 198, .13)",
      bombFill: "rgba(255, 71, 126, .16)",
      bombOutline: "rgba(255, 94, 122, .82)",
      forecastRgb: "255, 65, 103",
      forecastText: "#ffe4e9",
      dangerRgb: "255, 84, 99",
      goldRgb: "255, 197, 80"
    },
    qualityColor: { "白": "#e0e0e0", "绿": "#3ddc84", "蓝": "#3da5ff", "金": "#ffd700" },
    renderPiece: function (ctx, x, y, owner, skinId = "default", options) {
      options = options || {};
      const radius = config.CELL * 0.32;
      const pieceScale = options.scale || 1;
      const drawY = y;
      const main = owner === 0 ? this.theme.blue : this.theme.red;
      const dark = owner === 0 ? this.theme.darkBlue : this.theme.darkRed;
      const disabled = options.disabled === true;
      const scaledRadius = radius * pieceScale;
      const gradient = ctx.createRadialGradient(x - scaledRadius * 0.35, drawY - scaledRadius * 0.42, 1, x, drawY, scaledRadius);
      gradient.addColorStop(0, disabled ? this.theme.disabledBright : this.theme.white);
      gradient.addColorStop(0.2, disabled ? this.theme.disabledMid : main);
      gradient.addColorStop(1, disabled ? this.theme.disabledDark : dark);
      ctx.beginPath();
      ctx.fillStyle = gradient;
      ctx.shadowColor = disabled ? this.theme.disabled : main;
      ctx.shadowBlur = disabled ? 0 : mobileDevice ? 5 : 15;
      ctx.arc(x, drawY, scaledRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (disabled) {
        ctx.strokeStyle = this.theme.disabledLine;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - scaledRadius * 0.55, drawY - scaledRadius * 0.55);
        ctx.lineTo(x + scaledRadius * 0.55, drawY + scaledRadius * 0.55);
        ctx.moveTo(x + scaledRadius * 0.55, drawY - scaledRadius * 0.55);
        ctx.lineTo(x - scaledRadius * 0.55, drawY + scaledRadius * 0.55);
        ctx.stroke();
      }
      if (options.pulse) {
        ctx.globalAlpha = 0.4 + Math.sin(options.time * 2) * 0.1;
        ctx.beginPath();
        ctx.fillStyle = main;
        ctx.arc(x, drawY, 2.2 * pieceScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    },
    renderBoard: function (ctx, skinId = "default", bounds, boardState) {
      bounds = bounds || { left: 0, right: config.COLS - 1, top: 0, bottom: config.ROWS - 1 };
      boardState = boardState || state;
      const leftX = Math.max(0, bounds.left) * config.CELL;
      const rightX = Math.min(config.COLS, bounds.right + 1) * config.CELL;
      const topY = Math.max(0, bounds.top) * config.CELL;
      const bottomY = Math.min(config.ROWS, bounds.bottom + 1) * config.CELL;
      const glow = ctx.createRadialGradient(config.COLS * config.CELL / 2, config.ROWS * config.CELL / 2, 30, config.COLS * config.CELL / 2, config.ROWS * config.CELL / 2, config.COLS * config.CELL * 0.7);
      glow.addColorStop(0, this.theme.boardGlowCenter);
      glow.addColorStop(1, this.theme.boardGlowEdge);
      ctx.fillStyle = glow;
      ctx.fillRect(leftX, topY, rightX - leftX, bottomY - topY);
      ctx.beginPath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = this.theme.grid;
      ctx.shadowColor = this.theme.gridGlow;
      ctx.shadowBlur = mobileDevice ? 0 : 4;
      for (let col = bounds.left; col <= bounds.right + 1; col += 1) {
        ctx.moveTo(col * config.CELL, topY);
        ctx.lineTo(col * config.CELL, bottomY);
      }
      for (let row = bounds.top; row <= bounds.bottom + 1; row += 1) {
        ctx.moveTo(leftX, row * config.CELL);
        ctx.lineTo(rightX, row * config.CELL);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      for (let row = bounds.top; row <= bounds.bottom; row += 1) {
        for (let col = bounds.left; col <= bounds.right; col += 1) {
          if (boardState.board[row][col] === config.BLOCKED) {
            this.renderEffect(ctx, "blockedCell", { x: col, y: row }, skinId);
          }
        }
      }
    },
    renderEffect: function (ctx, effectType, params, skinId = "default") {
      if (!ctx) {
        state.visualEffects.push({
          type: effectType,
          params: params || {},
          remaining: 0.9,
          duration: 0.9
        });
        return;
      }
      const p = params || {};
      const cell = config.CELL;
      const centerX = Number.isFinite(p.x) ? (p.x + 0.5) * cell : config.COLS * cell / 2;
      const centerY = Number.isFinite(p.y) ? (p.y + 0.5) * cell : config.ROWS * cell / 2;
      const renderers = {
        blockedCell: function () {
          const x = p.x * cell;
          const y = p.y * cell;
          ctx.fillStyle = ART.theme.blocked;
          ctx.fillRect(x, y, cell, cell);
          ctx.strokeStyle = ART.theme.blockedLine;
          ctx.beginPath();
          ctx.moveTo(x + 4, y + 4);
          ctx.lineTo(x + cell - 4, y + cell - 4);
          ctx.moveTo(x + cell - 4, y + 4);
          ctx.lineTo(x + 4, y + cell - 4);
          ctx.stroke();
        },
        activeCell: function () {
          const colors = {
            harden: ART.theme.harden,
            rectangleShield: ART.theme.gold,
            ringLock: ART.theme.lock,
            permanent: ART.theme.glow,
            shield: ART.theme.shield
          };
          const color = colors[p.type];
          if (!color) return;
          ctx.strokeStyle = color;
          ctx.lineWidth = p.type === "permanent" ? 2 : 1.4;
          ctx.shadowColor = color;
          ctx.shadowBlur = 10;
          ctx.strokeRect(p.x * cell + 4, p.y * cell + 4, cell - 8, cell - 8);
          ctx.shadowBlur = 0;
          if (p.type === "ringLock") {
            ctx.fillStyle = ART.theme.lockFill;
            ctx.fillRect(p.x * cell, p.y * cell, cell, cell);
          }
        },
        bombPreview: function () {
          const radius = p.radius || 0;
          const x = (p.x - radius) * cell;
          const y = (p.y - radius) * cell;
          const size = cell * (radius * 2 + 1);
          ctx.fillStyle = ART.theme.bombFill;
          ctx.strokeStyle = ART.theme.bombOutline;
          ctx.lineWidth = 2;
          ctx.shadowColor = ART.theme.danger;
          ctx.shadowBlur = 13;
          ctx.fillRect(x, y, size, size);
          ctx.strokeRect(x, y, size, size);
          ctx.shadowBlur = 0;
        },
        forecast: function () {
          const half = Math.floor(p.size / 2);
          const x = (p.x - half) * cell;
          const y = (p.y - half) * cell;
          const size = p.size * cell;
          const alpha = 0.12 + p.progress * 0.17;
          ctx.fillStyle = `rgba(${ART.theme.forecastRgb}, ${alpha})`;
          ctx.fillRect(x, y, size, size);
          ctx.strokeStyle = ART.theme.forecast;
          ctx.lineWidth = 2;
          ctx.shadowColor = ART.theme.forecast;
          ctx.shadowBlur = 15;
          ctx.strokeRect(x, y, size, size);
          ctx.shadowBlur = 0;
          ctx.fillStyle = ART.theme.forecastText;
          ctx.font = `bold ${cell * 0.4}px monospace`;
          ctx.textAlign = "center";
          ctx.fillText(String(p.seconds), centerX, centerY + 5);
        },
        particle: function () {
          const color = ART.semanticColor(p.color);
          const alpha = clamp(p.life / p.maxLife, 0, 1);
          ctx.globalAlpha = alpha;
          if (p.kind === "spark") {
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 9;
            ctx.fillRect(p.x, p.y, p.size, p.size);
            ctx.shadowBlur = 0;
          } else if (p.kind === "ripple") {
            ctx.strokeStyle = `${p.side === 0 ? ART.theme.blue : ART.theme.red}${Math.floor(alpha * 220).toString(16).padStart(2, "0")}`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, cell * (0.2 + (1 - alpha) * 0.65), 0, Math.PI * 2);
            ctx.stroke();
          } else if (p.kind === "blast") {
            ctx.strokeStyle = `rgba(${ART.theme.dangerRgb}, ${alpha})`;
            ctx.lineWidth = alpha * 8 + 1;
            ctx.shadowColor = ART.theme.danger;
            ctx.shadowBlur = alpha * 20;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius * (0.3 + (1 - alpha)), 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
          ctx.globalAlpha = 1;
        },
        patternFlash: function () {
          const progress = clamp(p.progress, 0, 1);
          ctx.beginPath();
          ctx.strokeStyle = `rgba(${ART.theme.goldRgb}, ${1 - progress})`;
          ctx.lineWidth = 2;
          ctx.shadowColor = ART.theme.gold;
          ctx.shadowBlur = 20;
          ctx.arc(centerX, centerY, cell * (0.4 + progress * 1.2), 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
        },
        smallExplode: function () { ART.drawBlast(ctx, centerX, centerY, cell * 1.6, ART.theme.gold, p.progress); },
        bigExplode: function () { ART.drawBlast(ctx, centerX, centerY, cell * (2.2 + (p.r || 1) * 0.45), ART.theme.danger, p.progress); },
        crossExplode: function () {
          const arm = (p.arm || 2) * cell;
          ctx.strokeStyle = ART.theme.danger;
          ctx.lineWidth = Math.max(4, cell * 0.15);
          ctx.shadowColor = ART.theme.danger;
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.moveTo(centerX - arm, centerY);
          ctx.lineTo(centerX + arm, centerY);
          ctx.moveTo(centerX, centerY - arm);
          ctx.lineTo(centerX, centerY + arm);
          ctx.stroke();
          ctx.shadowBlur = 0;
        },
        dyeSpread: function () {
          ctx.strokeStyle = ART.theme.blue;
          ctx.lineWidth = 3;
          ctx.shadowColor = ART.theme.blue;
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.arc(centerX, centerY, cell * (0.5 + (p.r || 0) * 0.8), 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
        },
        mine: function () {
          ctx.fillStyle = ART.theme.gold;
          ctx.shadowColor = ART.theme.danger;
          ctx.shadowBlur = 13;
          ctx.beginPath();
          ctx.arc(centerX, centerY, cell * 0.18, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        },
        stealth: function () { ART.drawStatusLabel(ctx, "隐身", ART.theme.stealth); },
        steal: function () { ART.drawStatusLabel(ctx, `偷取 ×${p.count || 1}`, ART.theme.gold); },
        lockBoard: function () { ART.drawStatusLabel(ctx, "禁落", ART.theme.danger); },
        freezeUI: function () { ART.drawStatusLabel(ctx, "道具冻结", ART.theme.stealth); },
        shieldZone: function () {
          const radius = (p.radius || 1) * cell + cell * 0.4;
          ctx.strokeStyle = ART.theme.shield;
          ctx.lineWidth = 3;
          ctx.shadowColor = ART.theme.shield;
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
        },
        speedLines: function () { ART.drawStatusLabel(ctx, "加速", ART.theme.glow); },
        colorInvert: function () { ART.drawStatusLabel(ctx, "颜色反转", ART.theme.red); },
        doubleDrop: function () { ART.drawStatusLabel(ctx, "双重落子", ART.theme.glow); },
        timeFreeze: function () { ART.drawStatusLabel(ctx, "时间暂停", ART.theme.blue); },
        hiddenPiece: function () {}
      };
      if (renderers[effectType]) renderers[effectType]();
    },
    renderItemIcon: function (ctx, itemType, quality, skinId = "default") {
      const color = this.qualityColor[quality] || this.theme.white;
      const glyphs = {
        pointBomb: "✹", vision: "◌", mark: "⇥", bomb: "✹", dye: "◉",
        crossBomb: "✚", delayedBomb: "⌖", noPlaceOrder: "⊘", noItems: "▣",
        shield: "⬡", acceleration: "»", colorReverse: "↔", doublePlace: "×2", pause: "Ⅱ"
      };
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(glyphs[itemType] || "✦", ctx.canvas.width / 2, ctx.canvas.height / 2);
      ctx.shadowBlur = 0;
    },
    spawnParticles: function (x, y, count, semanticColor) {
      game.Game.spawnParticles(x, y, count, semanticColor);
    },
    semanticColor: function (semanticColor) {
      const colors = {
        explode: this.theme.danger, dye: this.theme.blue, shield: this.theme.shield,
        steal: this.theme.gold, speed: this.theme.glow, stealth: this.theme.stealth,
        pattern: this.theme.gold, forecast: this.theme.forecast, default: this.theme.white
      };
      return colors[semanticColor] || colors.default;
    },
    drawBlast: function (ctx, x, y, radius, color, progress) {
      const alpha = 1 - clamp(progress || 0, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3 + 7 * alpha;
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(x, y, radius * (0.3 + (1 - alpha) * 0.7), 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    },
    drawStatusLabel: function (ctx, text, color) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.font = `bold ${config.CELL * 0.38}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(text, config.COLS * config.CELL / 2, config.CELL * 0.8);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  };
  game.ART = ART;
  game.SKINS = SKINS;
  Object.defineProperty(game, "currentSkinId", {
    get: function () { return currentSkinId; }
  });

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function createNewMatch(mode) {
    shell.classList.remove("shake", "shake-sm");
    uiRefreshAccumulator = 0;
    ruleCheckAccumulator = 0;
    game.applyPracticeConfig(mode === "practice");
    $("resultModal").hidden = true;
    $("scoreGrid").hidden = false;
    $("practiceResultStats").hidden = true;
    state = game.State.createState();
    state.mode = mode;
    state.aiDifficulty = mode === "practice" ? game.PRACTICE_CONFIG.aiDifficulty : $("aiDifficulty").value;
    state.infinite.aiDecisionRemaining = getAIDecisionInterval();
    state.match.startedAt = 0;
    game.state = state;
    game.Inventory.createStartingLoot(state);
    setCameraForViewport();
    updateCanvasCursor();
    syncModeUI();
    updateDerivedUI();
    showToast(mode === "practice" ? "练习模式开始 · 数据不计入正式记录" : mode === "classic" ? "经典对局开始" : "无限生存开始");
  }

  function loadSavedScores() {
    if (!storageEnabled) return;
    ["classic", "infinite"].forEach(function (mode) {
      const key = config.STORAGE_KEYS[mode];
      let raw;
      try {
        raw = window.localStorage.getItem(key);
      } catch (error) {
        if (!(error instanceof DOMException)) throw error;
        storageEnabled = false;
        showToast("浏览器限制本地存储，本局分数仅保留在内存中", true);
        return;
      }
      if (!raw) return;
      let saved;
      try {
        saved = JSON.parse(raw);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        showToast(`${mode === "classic" ? "经典" : "无限"}模式存档格式异常，已忽略损坏记录`, true);
        return;
      }
      if (saved && Number.isFinite(saved.bestScore) && Number.isFinite(saved.games)) {
        game.storageData[mode] = { bestScore: saved.bestScore, games: saved.games };
      }
    });
  }

  function saveModeScore(mode, score) {
    const previous = game.storageData[mode];
    const next = {
      bestScore: Math.max(previous.bestScore, score),
      games: previous.games + 1,
      lastScore: score
    };
    game.storageData[mode] = next;
    if (!storageEnabled) return;
    try {
      window.localStorage.setItem(config.STORAGE_KEYS[mode], JSON.stringify(next));
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      storageEnabled = false;
      showToast("无法写入本地存储，本局分数已保留在内存中", true);
    }
  }

  function showToast(message, isError) {
    state.uiState.toastText = message;
    state.uiState.toastRemaining = config.UI.toastSeconds;
    state.uiState.toastKind = isError ? "error" : "normal";
    renderToast();
  }

  function renderToast() {
    const toast = $("toast");
    toast.textContent = state.uiState.toastText;
    toast.classList.toggle("is-visible", state.uiState.toastRemaining > 0);
    toast.classList.toggle("is-pattern", state.uiState.toastKind === "pattern");
    toast.classList.toggle("is-error", state.uiState.toastKind === "error");
  }

  function setStatus(message) {
    state.uiState.statusText = message;
    $("statusText").textContent = message;
  }

  function sideName(side) {
    return side === 0 ? "蓝方" : "红方";
  }

  function formatClock(seconds) {
    const safe = Math.max(0, Math.ceil(seconds));
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
  }

  function getAreaShares(state) {
    const counts = [0, 0];
    for (let row = 0; row < config.ROWS; row += 1) {
      for (let col = 0; col < config.COLS; col += 1) {
        const side = state.board[row][col];
        if ((side === 0 || side === 1) && !game.Inventory.isStoneDisabled(state, col, row, side)) counts[side] += 1;
      }
    }
    const total = counts[0] + counts[1];
    return {
      counts: counts,
      total: total,
      shares: total > 0 ? [counts[0] / total, counts[1] / total] : [0, 0]
    };
  }

  function updateDerivedUI() {
    const areas = getAreaShares(state);
    const ids = ["blue", "red"];
    for (let side = 0; side < 2; side += 1) {
      const player = state.players[side];
      const percent = areas.shares[side] * 100;
      const fill = $(`${ids[side]}EnergyFill`);
      fill.style.width = `${clamp(player.energy / player.energyCapacity * 100, 0, 100)}%`;
      fill.classList.toggle("is-full", player.energy >= player.energyCapacity - 0.001);
      $(`${ids[side]}EnergyText`).textContent = `${Math.floor(player.energy)} / ${Math.floor(player.energyCapacity)}`;
      $(`${ids[side]}Area`).textContent = `${Math.round(percent)}%`;
      $(`${ids[side]}Stones`).textContent = `${areas.counts[side]} 子`;
      $(`${ids[side]}AreaCompare`).style.width = `${percent}%`;

      const healthTrack = $(`${ids[side]}HealthTrack`);
      healthTrack.hidden = state.mode !== "infinite";
      healthTrack.querySelector(".health-fill").style.width = `${clamp(player.health / config.INFINITE.health * 100, 0, 100)}%`;
    }

    const infinite = state.mode === "infinite";
    $("survivalPanel").hidden = !infinite || state.ended;
    const practice = state.mode === "practice";
    document.querySelector(".player-red .player-label").lastChild.textContent =
      practice && state.aiDifficulty === "off" ? "红方 · 沙盒" : "红方 · AI";
    $("modeLabel").textContent = practice ? "练习模式" : infinite ? "无限生存" : "经典模式";
    $("matchTime").textContent = infinite ? `∞ ${formatClock(state.elapsed)}` : formatClock(state.classicRemaining);
    $("matchProgress").style.transform = `scaleX(${infinite ? 1 : clamp(state.classicRemaining / config.CLASSIC.durationSeconds, 0, 1)})`;
    $("matchMessage").textContent = practice
      ? "练习模式，数据不计入正式记录"
      : infinite
      ? `回能 +${getRegenRate(state).toFixed(1)}/s · 面积落后 30% 持续 10 秒开始掉血`
      : state.elapsed < config.CLASSIC.areaThresholdUnlockSeconds
        ? `开局 ${config.CLASSIC.areaThresholdUnlockSeconds} 秒后启用 ${Math.round(config.CLASSIC.areaThreshold * 100)}% 提前结算`
        : `任意一方占比达到 ${Math.round(config.CLASSIC.areaThreshold * 100)}% 可提前结算`;

    const stages = infinite ? Math.floor(state.elapsed / config.INFINITE.aiGrowthStageSeconds) : 0;
    const aiSpeed = Math.round((1 - Math.pow(1 - config.INFINITE.aiIntervalGrowthPerStage, stages)) * 100);
    const difficulty = config.AI.difficulties[state.aiDifficulty] || { label: "关闭" };
    $("survivalText").textContent = `AI ${difficulty.label} · 间隔 −${aiSpeed}% · 回能 ${getRegenRate(state).toFixed(1)}/s`;
    $("aiDifficulty").value = config.AI.difficulties[state.aiDifficulty] ? state.aiDifficulty : config.AI.defaultDifficulty;
    $("aiDifficulty").closest(".difficulty-picker").hidden = practice;
    $("practicePanel").hidden = !practice;
    $("practiceDebug").hidden = !practice || !game.PRACTICE_CONFIG.debug;
    if (practice && game.PRACTICE_CONFIG.debug) {
      $("practiceDebug").textContent = [
        `FPS: ${state.debugFps || 0}`,
        `道具总量: ${state.inventory.totalCount}`,
        `activeEffects: ${state.activeEffects.map(function (effect) { return `${effect.type}(${effect.remaining === Infinity ? "∞" : effect.remaining.toFixed(1)}s)`; }).join(", ") || "无"}`
      ].join("\n");
    }
    $("audioToggle").textContent = game.AUDIO.enabled ? "音效开" : "音效关";
    $("audioToggle").setAttribute("aria-label", game.AUDIO.enabled ? "关闭音效" : "开启音效");
    const leadName = state.infinite.areaLeadSide === null ? "等待面积领先" : `${sideName(1 - state.infinite.areaLeadSide)}掉血准备中`;
    $("healthText").textContent = `${leadName} · 蓝 ${Math.ceil(state.players[0].health)} / 红 ${Math.ceil(state.players[1].health)}`;
    $("bombPreviewLabel").hidden = !state.uiState.bombPreview;
    $("inventoryCount").setAttribute("aria-label", `道具总数 ${state.inventory.totalCount}`);

    if (!state.ended) {
      setStatus(state.uiState.selectedItemId
        ? selectedItemStatus()
        : `蓝方行动中 · 能量 ${Math.floor(state.players[0].energy)} · 空位落子`);
    }
    document.querySelector(".status-pill").classList.toggle("is-red", state.infinite.areaLeadSide === 0);
  }

  function selectedItemStatus() {
    const item = state.inventory.items.find(function (candidate) {
      return candidate.id === state.uiState.selectedItemId;
    });
    if (!item) return "点击空位落子";
    return `${config.ITEMS[item.type].name} · ${item.quality}品质 · 消耗 ${Math.ceil(item.currentCost)} 能量`;
  }

  function getRegenRate(currentState, side) {
    const baseRate = currentState.mode === "classic" || currentState.mode === "practice"
      ? config.ENERGY.regenClassic
      : config.ENERGY.regenInfiniteStart
        + (config.ENERGY.regenInfiniteFloor - config.ENERGY.regenInfiniteStart)
          * clamp(currentState.elapsed / config.ENERGY.regenFadeSeconds, 0, 1);
    const effectSide = side === undefined ? 0 : side;
    const accelerated = currentState.activeEffects.some(function (effect) {
      return effect.type === "加速" && effect.params.owner === effectSide;
    });
    return baseRate * (accelerated ? 2 : 1);
  }

  function isPaused(currentState) {
    return currentState.activeEffects.some(function (effect) { return effect.type === "暂停"; });
  }

  function findEffect(currentState, type, side) {
    return currentState.activeEffects.find(function (effect) {
      return effect.type === type && effect.params.target === side;
    }) || null;
  }

  function getPlacementCost(col, row, side) {
    if (state.mode === "practice" && side === 0 && game.PRACTICE_CONFIG.invincible) return 0;
    const protectedByOpponent = state.activeEffects.some(function (effect) {
      return effect.type === "护盾" && effect.params.owner !== side
        && Math.abs(effect.params.x - col) <= effect.params.radius
        && Math.abs(effect.params.y - row) <= effect.params.radius;
    });
    return config.ENERGY.placeCost * (protectedByOpponent ? 1.5 : 1);
  }

  function setDyeCooldown(centerX, centerY, radius, duration, cross) {
    for (let row = Math.max(0, centerY - radius); row <= Math.min(config.ROWS - 1, centerY + radius); row += 1) {
      for (let col = Math.max(0, centerX - radius); col <= Math.min(config.COLS - 1, centerX + radius); col += 1) {
        if (!cross || col === centerX || row === centerY) state.dyeCooldown[row][col] = duration;
      }
    }
  }

  function inBounds(col, row) {
    return Number.isInteger(col) && Number.isInteger(row)
      && col >= 0 && col < config.COLS && row >= 0 && row < config.ROWS;
  }

  function placeStone(col, row, side, options) {
    options = options || {};
    if (state.ended) return false;
    if (!inBounds(col, row)) {
      showToast("请在棋盘范围内操作", true);
      return false;
    }
    if (isPaused(state)) {
      if (!options.silent) showToast("时间暂停中，暂时不能落子", true);
      return false;
    }
    if (findEffect(state, "禁落令", side)) {
      if (!options.silent) showToast("被禁落", true);
      return false;
    }

    const mineIndex = state.activeEffects.findIndex(function (effect) {
      return effect.type === "地雷" && effect.params.x === col && effect.params.y === row;
    });
    if (mineIndex >= 0) {
      state.activeEffects.splice(mineIndex, 1);
      explodeCell(col, row, side);
      game.AUDIO.play("explode");
      ART.renderEffect(null, "smallExplode", { x: col, y: row, r: 0 });
      ART.spawnParticles(col, row, 12, "explode");
      updateDerivedUI();
      return false;
    }

    if (state.board[row][col] === config.BLOCKED) {
      if (!options.silent) showToast("棋盘边缘已收缩封锁", true);
      return false;
    }
    if (state.board[row][col] !== null) {
      if (!options.silent) showToast("这里已经有棋子了", true);
      return false;
    }
    if (game.Inventory.isCellLocked(state, col, row, side)) {
      if (!options.silent) showToast("该空位被对方回字阵锁定", true);
      return false;
    }

    const player = state.players[side];
    const actualSide = findEffect(state, "颜色反转", side)
      ? findEffect(state, "颜色反转", side).params.owner
      : side;
    const placementCost = options.free ? 0 : getPlacementCost(col, row, side);
    if (player.energy + 0.0001 < placementCost) {
      if (!options.silent) showToast("能量不足，正在自动充能", true);
      return false;
    }
    player.energy = Math.max(0, player.energy - placementCost);
    state.board[row][col] = actualSide;
    game.AUDIO.play("place");
    state.stonePlacedAt[row][col] = state.elapsed;
    state.match.totalStones += 1;
    state.particles.push({
      kind: "ripple",
      x: (col + 0.5) * config.CELL,
      y: (row + 0.5) * config.CELL,
      side: actualSide,
      life: config.UI.dropDurationSeconds,
      maxLife: config.UI.dropDurationSeconds
    });
    const patternQueue = options.patternQueue;
    if (patternQueue) {
      patternQueue.push({ x: col, y: row, side: actualSide });
    } else {
      const placed = [{ x: col, y: row, side: actualSide }];
      if (!options.noDouble) applyDoubleDrop(col, row, side, placed);
      placed.forEach(function (piece) {
        game.Patterns.onStonePlaced(state, piece.x, piece.y, piece.side);
      });
    }
    updateDerivedUI();
    return true;
  }

  function applyDoubleDrop(col, row, side, patternQueue) {
    const effect = state.activeEffects.find(function (candidate) {
      return candidate.type === "双重落子" && candidate.params.owner === side;
    });
    if (!effect) return;
    const candidates = [];
    for (let y = row - 1; y <= row + 1; y += 1) {
      for (let x = col - 1; x <= col + 1; x += 1) {
        if ((x !== col || y !== row) && inBounds(x, y) && state.board[y][x] === null) {
          candidates.push({ x: x, y: y });
        }
      }
    }
    for (let count = 0; count < effect.params.extra && candidates.length > 0; count += 1) {
      const target = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
      placeStone(target.x, target.y, side, {
        free: true, noDouble: true, silent: true, patternQueue: patternQueue
      });
    }
  }

  function changeOwner(col, row, owner) {
    if (!inBounds(col, row) || (owner !== 0 && owner !== 1)) return false;
    const previousOwner = state.board[row][col];
    if ((previousOwner !== 0 && previousOwner !== 1) || previousOwner === owner || state.dyeCooldown[row][col] > 0) return false;
    state.board[row][col] = owner;
    game.Inventory.clearCellEffects(state, col, row);
    return true;
  }

  function getPiecesInArea(area) {
    const left = Math.max(0, Math.floor(area.left));
    const right = Math.min(config.COLS - 1, Math.floor(area.right));
    const top = Math.max(0, Math.floor(area.top));
    const bottom = Math.min(config.ROWS - 1, Math.floor(area.bottom));
    const pieces = [];
    for (let row = top; row <= bottom; row += 1) {
      for (let col = left; col <= right; col += 1) {
        const owner = state.board[row][col];
        if (owner === 0 || owner === 1) pieces.push({ x: col, y: row, owner: owner });
      }
    }
    return pieces;
  }

  function explodeCellInternal(col, row, attackingSide, triggeredMines) {
    if (!inBounds(col, row)) return 0;
    const mineIndex = state.activeEffects.findIndex(function (effect) {
      return effect.type === "地雷" && effect.params.x === col && effect.params.y === row;
    });
    if (mineIndex >= 0) {
      const key = `${col},${row}`;
      if (triggeredMines.has(key)) return 0;
      state.activeEffects.splice(mineIndex, 1);
      triggeredMines.add(key);
      game.Inventory.clearCellEffects(state, col, row);
      ART.renderEffect(null, "smallExplode", { x: col, y: row, r: 1 });
      ART.spawnParticles(col, row, 12, "explode");
      let removed = 0;
      for (let y = Math.max(0, row - 1); y <= Math.min(config.ROWS - 1, row + 1); y += 1) {
        for (let x = Math.max(0, col - 1); x <= Math.min(config.COLS - 1, col + 1); x += 1) {
          if (x !== col || y !== row) removed += explodeCellInternal(x, y, attackingSide, triggeredMines);
        }
      }
      return removed;
    }
    const side = state.board[row][col];
    if (side !== 0 && side !== 1) {
      game.Inventory.clearCellEffects(state, col, row);
      return 0;
    }
    if (game.Inventory.isCellProtected(state, col, row, side)) return 0;
    state.board[row][col] = null;
    state.stonePlacedAt[row][col] = -1;
    game.Inventory.clearCellEffects(state, col, row);
    state.players[side].bombLosses += 1;
    return 1;
  }

  function explodeCell(col, row, attackingSide) {
    return explodeCellInternal(col, row, attackingSide, new Set()) > 0;
  }

  function explodeArea(centerX, centerY, radius, attackingSide) {
    let removed = 0;
    const triggeredMines = new Set();
    for (let row = Math.max(0, centerY - radius); row <= Math.min(config.ROWS - 1, centerY + radius); row += 1) {
      for (let col = Math.max(0, centerX - radius); col <= Math.min(config.COLS - 1, centerX + radius); col += 1) {
        removed += explodeCellInternal(col, row, attackingSide, triggeredMines);
      }
    }
    updateDerivedUI();
    return removed;
  }

  function shake(duration, small) {
    const className = small ? "shake-sm" : "shake";
    shell.classList.remove(className);
    void shell.offsetWidth;
    shell.classList.add(className);
    state.particles.push({ kind: small ? "shake-small" : "shake", life: duration, maxLife: duration });
  }

  function spawnParticles(col, row, count, semanticColor) {
    const x = (col + 0.5) * config.CELL;
    const centerY = (row + 0.5) * config.CELL;
    const age = Math.max(0, state.elapsed - state.stonePlacedAt[row][col]);
    const dropProgress = clamp(age / config.UI.dropDurationSeconds, 0, 1);
    const easedDrop = 1 - Math.pow(1 - dropProgress, 2);
    const y = centerY - (1 - easedDrop) * config.CELL * 0.85;
    const particleLimit = mobileDevice ? 48 : 520;
    const allowed = Math.max(0, Math.min(count, particleLimit - state.particles.length));
    for (let i = 0; i < allowed; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 48 + Math.random() * 170;
      state.particles.push({
        kind: "spark",
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 1.5 + Math.random() * 3,
        color: semanticColor,
        life: 0.45 + Math.random() * 0.5,
        maxLife: 0.95
      });
    }
  }

  function explodeRegion(centerX, centerY, radiusX, radiusY, forecast) {
    let removed = 0;
    for (let row = Math.max(0, centerY - radiusY); row <= Math.min(config.ROWS - 1, centerY + radiusY); row += 1) {
      for (let col = Math.max(0, centerX - radiusX); col <= Math.min(config.COLS - 1, centerX + radiusX); col += 1) {
        if (explodeCell(col, row, null)) removed += 1;
      }
    }
    game.AUDIO.play("explode");
    const x = (centerX + 0.5) * config.CELL;
    const y = (centerY + 0.5) * config.CELL;
    ART.spawnParticles(centerX, centerY, 34, "forecast");
    state.particles.push({
      kind: "blast",
      x: x,
      y: y,
      radius: Math.max(radiusX, radiusY) * config.CELL,
      life: 0.55,
      maxLife: 0.55,
      color: "forecast"
    });
    if (forecast) {
      shake(0.4, false);
      showToast(`预警爆炸 · 清除 ${removed} 颗棋子`);
    }
    updateDerivedUI();
  }

  function setCameraForViewport() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, mobileDevice ? 1.25 : 2);
    const oldWidth = state.viewport.width;
    const oldHeight = state.viewport.height;
    state.viewport.width = rect.width;
    state.viewport.height = rect.height;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const boardWidth = config.COLS * config.CELL;
    const boardHeight = config.ROWS * config.CELL;
    const centerWorldX = oldWidth > 0
      ? (oldWidth / 2 - state.camera.x) / state.camera.zoom
      : boardWidth / 2;
    const centerWorldY = oldHeight > 0
      ? (oldHeight / 2 - state.camera.y) / state.camera.zoom
      : boardHeight / 2;
    const targetVisibleCells = mobileDevice ? 21 : 18;
    state.camera.zoom = clamp(Math.max(rect.width, rect.height) / (targetVisibleCells * config.CELL), 0.4, 3.5);
    state.camera.x = rect.width / 2 - centerWorldX * state.camera.zoom;
    state.camera.y = rect.height / 2 - centerWorldY * state.camera.zoom;
    clampCamera();
  }

  function clampCamera() {
    const width = config.COLS * config.CELL * state.camera.zoom;
    const height = config.ROWS * config.CELL * state.camera.zoom;
    state.camera.x = width <= state.viewport.width
      ? (state.viewport.width - width) / 2
      : clamp(state.camera.x, state.viewport.width - width, 0);
    state.camera.y = height <= state.viewport.height
      ? (state.viewport.height - height) / 2
      : clamp(state.camera.y, state.viewport.height - height, 0);
  }

  function screenToCell(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - state.camera.x) / state.camera.zoom;
    const y = (clientY - rect.top - state.camera.y) / state.camera.zoom;
    return { x: Math.floor(x / config.CELL), y: Math.floor(y / config.CELL) };
  }

  function handleCell(col, row) {
    if (state.ended) return;
    if (col < 0 || col >= config.COLS || row < 0 || row >= config.ROWS) {
      showToast("请在棋盘范围内操作", true);
      return;
    }
    if (state.uiState.selectedItemId) {
      const item = state.inventory.items.find(function (candidate) {
        return candidate.id === state.uiState.selectedItemId;
      }) || { id: state.uiState.selectedItemId };
      game.Inventory.useItem(item, col, row);
      updateDerivedUI();
      return;
    }
    placeStone(col, row, 0);
  }

  function handleBoardClick(x, y) {
    handleCell(x, y);
  }

  function selectItem(itemId) {
    if (state.ended) return;
    state.uiState.selectedItemId = state.uiState.selectedItemId === itemId ? null : itemId;
    updateCanvasCursor();
    game.Inventory.render(state);
    updateDerivedUI();
  }

  function clearSelectedItem() {
    state.uiState.selectedItemId = null;
    updateCanvasCursor();
    game.Inventory.render(state);
  }

  function updateCanvasCursor() {
    const item = state.inventory.items.find(function (candidate) {
      return candidate.id === state.uiState.selectedItemId;
    });
    canvas.classList.toggle("cursor-bomb", Boolean(item && ["bomb", "pointBomb"].includes(item.type)));
    canvas.classList.toggle("cursor-dye", Boolean(item && item.type === "dye"));
  }

  function destroyForecast() {
    const forecast = state.infinite.forecast;
    if (!forecast) return;
    state.infinite.forecast = null;
    explodeRegion(forecast.x, forecast.y, Math.floor(forecast.size / 2), Math.floor(forecast.size / 2), true);
  }

  function shrinkBoard() {
    const newLayer = state.infinite.shrinkLayer;
    if (newLayer >= Math.floor(config.COLS / 2) - 2) return;
    for (let row = 0; row < config.ROWS; row += 1) {
      for (let col = 0; col < config.COLS; col += 1) {
        const edgeDistance = Math.min(col, row, config.COLS - 1 - col, config.ROWS - 1 - row);
        if (edgeDistance !== newLayer) continue;
        state.board[row][col] = config.BLOCKED;
        game.Inventory.clearCellEffects(state, col, row);
      }
    }
    state.infinite.shrinkLayer += 1;
    showToast(`棋盘收缩 · 外围第 ${state.infinite.shrinkLayer} 圈已永久封锁`);
  }

  function startForecast() {
    const layer = state.infinite.shrinkLayer;
    const halfSize = Math.floor(config.INFINITE.forecastSize / 2);
    const minimum = Math.min(layer + halfSize + 1, Math.floor(config.COLS / 2) - 1);
    const maximum = Math.max(minimum, config.COLS - layer - halfSize - 2);
    const x = randomInt(minimum, maximum);
    const y = randomInt(minimum, maximum);
    state.infinite.forecast = {
      x: x,
      y: y,
      size: config.INFINITE.forecastSize,
      remaining: config.INFINITE.forecastWarningSeconds
    };
    showToast("全屏预警 · 红色区域即将爆炸！");
  }

  function applyClassicRule() {
    if (state.ended) return;
    const areas = getAreaShares(state);
    if (state.elapsed >= config.CLASSIC.areaThresholdUnlockSeconds && areas.total > 0) {
      if (areas.shares[0] >= config.CLASSIC.areaThreshold) {
        finishMatch(0, `蓝方占比达到 ${Math.round(config.CLASSIC.areaThreshold * 100)}%`);
        return;
      }
      if (areas.shares[1] >= config.CLASSIC.areaThreshold) {
        finishMatch(1, `红方占比达到 ${Math.round(config.CLASSIC.areaThreshold * 100)}%`);
        return;
      }
    }

    if (state.classicRemaining <= 0) {
      const difference = Math.abs(areas.shares[0] - areas.shares[1]);
      if (difference < config.CLASSIC.tieDifference || areas.total === 0) {
        finishMatch(null, "时间到 · 占比差距不足 5%，平局");
      } else {
        const winner = areas.shares[0] > areas.shares[1] ? 0 : 1;
        finishMatch(winner, `${Math.round(config.CLASSIC.durationSeconds)} 秒到 · 按棋子占比结算`);
      }
    }
  }

  function updateInfinitePressure(dt) {
    if (state.ended) return;
    const areas = getAreaShares(state);
    const gap = areas.shares[0] - areas.shares[1];
    const threshold = config.INFINITE.areaLeadThreshold;
    let leadingSide = null;
    if (gap >= threshold) leadingSide = 0;
    else if (gap <= -threshold) leadingSide = 1;

    if (leadingSide === null) {
      state.infinite.areaLeadSide = null;
      state.infinite.areaLeadElapsed = 0;
      return;
    }
    if (state.infinite.areaLeadSide !== leadingSide) {
      state.infinite.areaLeadSide = leadingSide;
      state.infinite.areaLeadElapsed = 0;
    }
    state.infinite.areaLeadElapsed += dt;
    if (state.infinite.areaLeadElapsed >= config.INFINITE.areaLeadWarmupSeconds) {
      const loser = 1 - leadingSide;
      state.players[loser].health = Math.max(
        0,
        state.players[loser].health - config.INFINITE.healthDrainPerSecond * dt
      );
      if (state.players[loser].health <= 0) finishMatch(leadingSide, `${sideName(loser)}血量归零`);
    }
  }

  function finishMatch(winner, reason) {
    if (state.ended) return;
    state.ended = true;
    game.AUDIO.play(winner === 0 ? "win" : "lose");
    state.winner = winner;
    state.endReason = reason;
    state.match.finishedAt = state.elapsed;
    state.uiState.selectedItemId = null;
    if (state.mode === "practice") {
      game.Inventory.clearAll(state);
      showPracticeResult();
      shell.classList.add("is-ended");
      updateDerivedUI();
      game.Inventory.render(state);
      return;
    }
    const modeScores = state.scores[state.mode];

    for (let side = 0; side < 2; side += 1) {
      const score = modeScores[side];
      const player = state.players[side];
      const share = getAreaShares(state).shares[side];
      score.baseScore = winner === null ? config.SCORE.drawBase : winner === side ? config.SCORE.winnerBase : 0;
      score.areaScore = Math.round(share * config.SCORE.areaScale);
      score.patternScore = player.patternScore;
      score.efficiencyScore = Math.round(player.energy / player.energyCapacity * config.SCORE.efficiencyScale);
      score.bombPenalty = player.bombLosses * config.SCORE.bombPenaltyPerStone;
      score.totalScore = Math.max(0, score.baseScore + score.areaScore + score.patternScore + score.efficiencyScore - score.bombPenalty);
      player.score = score;
    }

    const bestSide = modeScores[0].totalScore >= modeScores[1].totalScore ? 0 : 1;
    saveModeScore(state.mode, modeScores[bestSide].totalScore);
    game.Inventory.clearAll(state);
    showResultModal(winner, reason, modeScores[bestSide], bestSide);
    shell.classList.add("is-ended");
    updateDerivedUI();
    game.Inventory.render(state);
  }

  function showResultModal(winner, reason, score, scoreSide) {
    $("resultEyebrow").textContent = state.mode === "classic" ? "经典结算" : "无限生存结算";
    $("resultTitle").textContent = winner === null ? "平局" : `${sideName(winner)}获胜`;
    $("resultTitle").style.color = winner === null ? ART.theme.white : winner === 0 ? ART.theme.blue : ART.theme.red;
    $("resultSummary").textContent = `${reason} · 蓝方 ${Math.round(getAreaShares(state).shares[0] * 100)}% / 红方 ${Math.round(getAreaShares(state).shares[1] * 100)}%`;
    $("scoreSideLabel").textContent = `本次积分 · ${sideName(scoreSide)}`;
    $("scoreBase").textContent = String(score.baseScore);
    $("scoreArea").textContent = String(score.areaScore);
    $("scorePattern").textContent = String(score.patternScore);
    $("scoreEfficiency").textContent = String(score.efficiencyScore);
    $("scoreBombPenalty").textContent = `-${score.bombPenalty}`;
    $("scoreTotal").textContent = String(score.totalScore);
    $("resultModal").hidden = false;
  }

  function showPracticeResult() {
    $("resultEyebrow").textContent = "练习模式结算";
    $("resultTitle").textContent = "本局调试数据";
    $("resultTitle").style.color = ART.theme.blue;
    $("resultSummary").textContent = "练习模式，数据不计入正式记录";
    $("scoreGrid").hidden = true;
    $("practiceResultStats").hidden = false;
    $("practiceResultDuration").textContent = `${state.elapsed.toFixed(1)} 秒`;
    $("practiceResultMoves").textContent = String(state.match.totalStones);
    $("practiceResultPatterns").textContent = String(state.match.patternEvents.length);
    $("practiceResultItems").textContent = String(state.match.itemUses);
    $("resultModal").hidden = false;
  }

  function restartMatch() {
    shell.classList.remove("is-ended", "shake");
    $("resultModal").hidden = true;
    $("scoreGrid").hidden = false;
    $("practiceResultStats").hidden = true;
    const mode = state.mode;
    createNewMatch(mode);
  }

  function processMilestones() {
    if (state.mode !== "infinite" || state.ended) return;
    while (state.elapsed >= state.infinite.nextShrinkAt) {
      shrinkBoard();
      state.infinite.nextShrinkAt += config.INFINITE.shrinkEverySeconds;
    }
    while (state.elapsed >= state.infinite.nextForecastAt) {
      startForecast();
      state.infinite.nextForecastAt += config.INFINITE.forecastEverySeconds;
    }
  }

  function chooseAIMove() {
    const empty = [];
    for (let row = 0; row < config.ROWS; row += 1) {
      for (let col = 0; col < config.COLS; col += 1) {
        if (state.board[row][col] === null && !game.Inventory.isCellLocked(state, col, row, 1)) {
          empty.push({ x: col, y: row });
        }
      }
    }
    return sampleAICandidates(empty);
  }

  function sampleAICandidates(candidates) {
    const sampled = candidates.slice();
    const sampleSize = Math.min(sampled.length, config.AI.candidateSampleCount);
    for (let index = 0; index < sampleSize; index += 1) {
      const swapIndex = index + Math.floor(Math.random() * (sampled.length - index));
      const current = sampled[index];
      sampled[index] = sampled[swapIndex];
      sampled[swapIndex] = current;
    }
    sampled.length = sampleSize;
    return sampled;
  }

  function lineCountAt(col, row, side, dx, dy) {
    let count = 0;
    for (let direction = -1; direction <= 1; direction += 2) {
      for (let distance = 1; distance <= 4; distance += 1) {
        const x = col + dx * distance * direction;
        const y = row + dy * distance * direction;
        if (!inBounds(x, y) || state.board[y][x] !== side) break;
        count += 1;
      }
    }
    return count;
  }

  function findThreats(side) {
    const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
    const threats = [];
    for (let y = 0; y < config.ROWS; y += 1) {
      for (let x = 0; x < config.COLS; x += 1) {
        if (state.board[y][x] !== side) continue;
        directions.forEach(function (direction) {
          const dx = direction[0];
          const dy = direction[1];
          const beforeX = x - dx;
          const beforeY = y - dy;
          if (inBounds(beforeX, beforeY) && state.board[beforeY][beforeX] === side) return;
          const cells = [];
          let endX = x;
          let endY = y;
          while (inBounds(endX, endY) && state.board[endY][endX] === side) {
            cells.push({ x: endX, y: endY });
            endX += dx;
            endY += dy;
          }
          if (cells.length < 4) return;
          const targets = [];
          const leftX = x - dx;
          const leftY = y - dy;
          if (inBounds(leftX, leftY) && state.board[leftY][leftX] === null) targets.push({ x: leftX, y: leftY });
          if (inBounds(endX, endY) && state.board[endY][endX] === null) targets.push({ x: endX, y: endY });
          if (targets.length > 0) threats.push({ side: side, cells: cells, targets: targets });
        });
      }
    }
    return threats;
  }

  function getMoveLineInfo(move) {
    const axes = [[1, 0], [0, 1], [1, 1], [1, -1]];
    let ownRun = 0;
    let bestDirection = { x: 1, y: 0 };
    let enemyRun = 0;
    let formsLine = false;
    axes.forEach(function (axis) {
      const own = lineCountAt(move.x, move.y, 1, axis[0], axis[1]);
      const enemy = lineCountAt(move.x, move.y, 0, axis[0], axis[1]);
      if (own > ownRun) {
        ownRun = own;
        bestDirection = { x: axis[0], y: axis[1] };
      }
      enemyRun = Math.max(enemyRun, enemy);
      if (own >= config.PATTERNS.minimumLineLength - 1) formsLine = true;
    });
    let formsShape = false;
    for (let top = move.y - 1; top <= move.y; top += 1) {
      for (let left = move.x - 1; left <= move.x; left += 1) {
        if (left < 0 || top < 0 || left + 1 >= config.COLS || top + 1 >= config.ROWS) continue;
        let ownCorners = 1;
        [[left, top], [left + 1, top], [left, top + 1], [left + 1, top + 1]].forEach(function (cell) {
          if ((cell[0] !== move.x || cell[1] !== move.y) && state.board[cell[1]][cell[0]] === 1) ownCorners += 1;
        });
        if (ownCorners >= 4) formsShape = true;
      }
    }
    const cross = [[move.x, move.y - 1], [move.x, move.y + 1], [move.x - 1, move.y], [move.x + 1, move.y]];
    if (cross.every(function (cell) { return inBounds(cell[0], cell[1]) && state.board[cell[1]][cell[0]] === 1; })) formsShape = true;
    return {
      ownRun: ownRun,
      enemyRun: enemyRun,
      formsPattern: formsLine || formsShape,
      direction: bestDirection
    };
  }

  function scoreAIMove(move, threats, difficulty) {
    let localScore = 0;
    let nearestFriendly = Infinity;
    for (let row = 0; row < config.ROWS; row += 1) {
      for (let col = 0; col < config.COLS; col += 1) {
        const owner = state.board[row][col];
        if (owner !== 0 && owner !== 1) continue;
        const dx = move.x - col;
        const dy = move.y - row;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        if (owner === 1) nearestFriendly = Math.min(nearestFriendly, distance);
        if (distance <= 2) localScore += (owner === 1 ? 1.5 : 1.1) / (distance + 0.5);
      }
    }
    const lineInfo = getMoveLineInfo(move);
    localScore += lineInfo.ownRun * lineInfo.ownRun * 3;
    localScore += lineInfo.enemyRun * lineInfo.enemyRun * 3.4;
    const patternBonus = lineInfo.formsPattern
      ? (95 + lineInfo.ownRun * 8) * difficulty.accuracy
      : lineInfo.enemyRun >= 3 ? 34 : 0;
    const distancePenalty = Number.isFinite(nearestFriendly)
      ? 1 / (1 + Math.max(0, nearestFriendly - 1) * 0.3)
      : 1 / (1 + Math.max(Math.abs(move.x - 19.5), Math.abs(move.y - 19.5)) * 0.08);
    let score = localScore * (lineInfo.formsPattern ? 1 : distancePenalty) + patternBonus;
    const recent = state.infinite.aiRecentMoves;
    if (!lineInfo.formsPattern && recent.length >= 2) {
      const previousDirection = {
        x: recent[recent.length - 1].x - recent[recent.length - 2].x,
        y: recent[recent.length - 1].y - recent[recent.length - 2].y
      };
      const nextDirection = {
        x: move.x - recent[recent.length - 1].x,
        y: move.y - recent[recent.length - 1].y
      };
      const previousLength = Math.hypot(previousDirection.x, previousDirection.y);
      const nextLength = Math.hypot(nextDirection.x, nextDirection.y);
      if (previousLength > 0 && nextLength > 0) {
        const alignment = (previousDirection.x * nextDirection.x + previousDirection.y * nextDirection.y)
          / (previousLength * nextLength);
        if (alignment >= 0.72) score -= 2.2;
      }
    }
    const blocksThreat = threats.some(function (threat) {
      return threat.side === 0 && threat.targets.some(function (target) {
        return target.x === move.x && target.y === move.y;
      });
    });
    if (blocksThreat) score += 180 * difficulty.defenseWeight;
    return {
      score: score,
      formsPattern: lineInfo.formsPattern,
      direction: lineInfo.direction,
      ownRun: lineInfo.ownRun,
      blocksThreat: blocksThreat
    };
  }

  function scoreAIItem(item, target, difficulty) {
    const radius = game.Inventory.getQualityStats(item).strength >= 1.5 ? 2 : 1;
    const enemyThreats = difficulty.threats.filter(function (threat) { return threat.side === 0; });
    const friendlyThreats = difficulty.threats.filter(function (threat) { return threat.side === 1; });
    function inBombArea(x, y) {
      if (item.type === "crossBomb") {
        const arm = Math.floor(2 * game.Inventory.getQualityStats(item).strength);
        return (x === target.x && Math.abs(y - target.y) <= arm)
          || (y === target.y && Math.abs(x - target.x) <= arm);
      }
      const blastRadius = item.type === "pointBomb" ? 1 : radius;
      return Math.abs(x - target.x) <= blastRadius && Math.abs(y - target.y) <= blastRadius;
    }
    function inArea(x, y, areaRadius) {
      return Math.abs(x - target.x) <= areaRadius && Math.abs(y - target.y) <= areaRadius;
    }
    if (["bomb", "pointBomb", "crossBomb"].includes(item.type)) {
      let removableEnemy = 0;
      let ownLoss = 0;
      const bombRadius = item.type === "crossBomb" ? Math.floor(2 * game.Inventory.getQualityStats(item).strength) : item.type === "pointBomb" ? 1 : radius;
      for (let y = Math.max(0, target.y - bombRadius); y <= Math.min(config.ROWS - 1, target.y + bombRadius); y += 1) {
        for (let x = Math.max(0, target.x - bombRadius); x <= Math.min(config.COLS - 1, target.x + bombRadius); x += 1) {
          if (!inBombArea(x, y)) continue;
          if (state.board[y][x] === 0 && !game.Inventory.isCellProtected(state, x, y, 0)) removableEnemy += 1;
          if (state.board[y][x] === 1 && !game.Inventory.isCellProtected(state, x, y, 1)) ownLoss += 1;
        }
      }
      const breaksThreat = enemyThreats.some(function (threat) {
        return threat.cells.some(function (cell) { return inBombArea(cell.x, cell.y); });
      });
      if (removableEnemy < 3 && !breaksThreat) return null;
      const interruptedThreats = enemyThreats.filter(function (threat) {
        return threat.cells.some(function (cell) { return inBombArea(cell.x, cell.y); });
      });
      return {
        score: (removableEnemy >= 3 ? 150 + removableEnemy * 12 : 0)
          + (breaksThreat ? 260 * difficulty.defenseWeight : 0) - ownLoss * 18,
        intent: breaksThreat ? {
          type: "defend",
          cells: interruptedThreats.flatMap(function (threat) { return threat.cells; }),
          targets: interruptedThreats.flatMap(function (threat) { return threat.targets; })
        } : null,
        qualifies: true
      };
    }
    if (item.type === "dye") {
      const dyeRadius = game.Inventory.getQualityStats(item).strength >= 2 ? 2 : game.Inventory.getQualityStats(item).strength >= 1.5 ? 1 : 0;
      let stolenPieces = 0;
      for (let y = Math.max(0, target.y - dyeRadius); y <= Math.min(config.ROWS - 1, target.y + dyeRadius); y += 1) {
        for (let x = Math.max(0, target.x - dyeRadius); x <= Math.min(config.COLS - 1, target.x + dyeRadius); x += 1) {
          if (state.board[y][x] === 0 && state.dyeCooldown[y][x] <= 0) stolenPieces += 1;
        }
      }
      const breaksThreat = enemyThreats.some(function (threat) {
        return threat.cells.some(function (cell) {
          return inArea(cell.x, cell.y, dyeRadius) && state.dyeCooldown[cell.y][cell.x] <= 0;
        });
      });
      if (!breaksThreat) return null;
      const interruptedThreats = enemyThreats.filter(function (threat) {
        return threat.cells.some(function (cell) {
          return inArea(cell.x, cell.y, dyeRadius) && state.dyeCooldown[cell.y][cell.x] <= 0;
        });
      });
      return {
        score: stolenPieces * 24 + 280 * difficulty.defenseWeight,
        intent: {
          type: "defend",
          cells: interruptedThreats.flatMap(function (threat) { return threat.cells; }),
          targets: interruptedThreats.flatMap(function (threat) { return threat.targets; })
        },
        qualifies: true
      };
    }
    if (item.type === "shield") {
      const protectsThreat = friendlyThreats.some(function (threat) {
        return threat.cells.some(function (cell) {
          const inNewShield = inArea(cell.x, cell.y, radius);
          const alreadyProtected = game.Inventory.isCellProtected(state, cell.x, cell.y, 1);
          return inNewShield && !alreadyProtected;
        });
      });
      if (!protectsThreat) return null;
      return {
        score: 170 + difficulty.defenseWeight * 45,
        intent: { type: "build", x: target.x, y: target.y, dx: 1, dy: 0 },
        qualifies: true
      };
    }
    return null;
  }

  function getAIDecisionInterval() {
    if (state.mode === "practice" && game.PRACTICE_CONFIG.aiIntervalOverride !== "") {
      const override = Number(game.PRACTICE_CONFIG.aiIntervalOverride);
      if (Number.isFinite(override) && override > 0) return override;
    }
    const difficulty = config.AI.difficulties[state.aiDifficulty] || config.AI.difficulties.normal;
    const base = difficulty.minInterval + Math.random() * (difficulty.maxInterval - difficulty.minInterval);
    const stages = state.mode === "infinite" ? Math.floor(state.elapsed / config.INFINITE.aiGrowthStageSeconds) : 0;
    return Math.max(
      config.AI.minimumIntervalSeconds,
      base * Math.pow(1 - config.INFINITE.aiIntervalGrowthPerStage, stages)
    );
  }

  function collectAIItemTargets(item, threats) {
    const candidates = new Map();
    function add(x, y) {
      if (inBounds(x, y)) candidates.set(`${x},${y}`, { x: x, y: y });
    }
    if (["bomb", "pointBomb", "crossBomb"].includes(item.type)) {
      threats.filter(function (threat) { return threat.side === 0; }).forEach(function (threat) {
        threat.cells.forEach(function (cell) { add(cell.x, cell.y); });
      });
      const enemyCells = [];
      for (let y = 0; y < config.ROWS; y += 1) {
        for (let x = 0; x < config.COLS; x += 1) {
          if (state.board[y][x] === 0) enemyCells.push({ x: x, y: y });
        }
      }
      sampleAICandidates(enemyCells).forEach(function (cell) { add(cell.x, cell.y); });
    } else if (item.type === "dye") {
      threats.filter(function (threat) { return threat.side === 0; }).forEach(function (threat) {
        threat.cells.forEach(function (cell) { add(cell.x, cell.y); });
      });
      const enemyCells = [];
      for (let y = 0; y < config.ROWS; y += 1) {
        for (let x = 0; x < config.COLS; x += 1) {
          if (state.board[y][x] === 0) enemyCells.push({ x: x, y: y });
        }
      }
      sampleAICandidates(enemyCells).forEach(function (cell) { add(cell.x, cell.y); });
    } else if (item.type === "shield") {
      threats.filter(function (threat) { return threat.side === 1; }).forEach(function (threat) {
        threat.cells.forEach(function (cell) { add(cell.x, cell.y); });
      });
    }
    return Array.from(candidates.values()).slice(0, config.AI.candidateSampleCount);
  }

  function actionTouchesIntent(action, intent) {
    if (action.kind === "place") {
      return (intent.targets || []).some(function (cell) {
        return cell.x === action.target.x && cell.y === action.target.y;
      });
    }
    const item = action.item;
    const strength = game.Inventory.getQualityStats(item).strength;
    return intent.cells.some(function (cell) {
      if (["bomb", "pointBomb", "crossBomb"].includes(item.type)) {
        if (item.type === "crossBomb") {
          const arm = Math.floor(2 * strength);
          return (cell.x === action.target.x && Math.abs(cell.y - action.target.y) <= arm)
            || (cell.y === action.target.y && Math.abs(cell.x - action.target.x) <= arm);
        }
        const radius = item.type === "pointBomb" ? 1 : strength >= 1.5 ? 2 : 1;
        return Math.abs(cell.x - action.target.x) <= radius && Math.abs(cell.y - action.target.y) <= radius;
      }
      if (item.type === "dye") {
        const radius = strength >= 2 ? 2 : strength >= 1.5 ? 1 : 0;
        return Math.abs(cell.x - action.target.x) <= radius && Math.abs(cell.y - action.target.y) <= radius;
      }
      return false;
    });
  }

  function actionMatchesIntent(action, intent) {
    if (intent.type === "defend") return actionTouchesIntent(action, intent);
    if (intent.type !== "build" || action.kind !== "place") return false;
    const dx = action.target.x - intent.x;
    const dy = action.target.y - intent.y;
    const along = dx * intent.dx + dy * intent.dy;
    const across = Math.abs(dx * intent.dy - dy * intent.dx);
    return along > 0 && along <= 6 && across <= 1;
  }

  function createAIIntent(action, threats) {
    if (action.intent) return Object.assign({ remaining: config.AI.intentDurationSeconds }, action.intent);
    if (action.blocksThreat) {
      const enemyThreats = threats.filter(function (threat) { return threat.side === 0; });
      if (enemyThreats.length > 0) {
        return {
          type: "defend",
          cells: enemyThreats.flatMap(function (threat) { return threat.cells; }),
          targets: enemyThreats.flatMap(function (threat) { return threat.targets; }),
          remaining: config.AI.intentDurationSeconds
        };
      }
    }
    if (action.kind !== "place") return null;
    let dx = action.direction.x;
    let dy = action.direction.y;
    const recent = state.infinite.aiRecentMoves;
    if (action.ownRun === 0 && recent.length >= 1) {
      const last = recent[recent.length - 1];
      dx = Math.sign(action.target.x - last.x);
      dy = Math.sign(action.target.y - last.y);
      if (dx === 0 && dy === 0) dx = 1;
    }
    return {
      type: "build",
      x: action.target.x,
      y: action.target.y,
      dx: dx || 1,
      dy: dy,
      remaining: config.AI.intentDurationSeconds
    };
  }

  function chooseAIAction(difficulty) {
    const candidates = chooseAIMove();
    const threats = findThreats(0).concat(findThreats(1));
    const decisionDifficulty = Object.assign({}, difficulty, { threats: threats });
    const canPlace = !game.Inventory.hasEffectForSide(state, "禁落令", 1);
    const placements = canPlace ? candidates.filter(function (target) {
      return state.players[1].energy + 0.0001 >= getPlacementCost(target.x, target.y, 1);
    }) : [];
    const actions = placements.map(function (target) {
      const scored = scoreAIMove(target, threats, difficulty);
      return {
        kind: "place",
        target: target,
        score: scored.score,
        formsPattern: scored.formsPattern,
        direction: scored.direction,
        ownRun: scored.ownRun,
        blocksThreat: scored.blocksThreat
      };
    });

    const inventory = game.Inventory.getInventory(state, 1);
    const canUseItems = state.globalItemCooldownRemaining <= 0 && !isPaused(state)
      && !game.Inventory.hasEffectForSide(state, "禁道具", 1);
    if (canUseItems) {
      inventory.items.forEach(function (item) {
        if (!["bomb", "pointBomb", "crossBomb", "dye", "shield"].includes(item.type)) return;
        if (state.players[1].energy + 0.0001 < item.currentCost) return;
        if (item.rare && state.rareItemsUsed >= config.INVENTORY.rareUseLimit) return;
        collectAIItemTargets(item, threats).forEach(function (target) {
          const scored = scoreAIItem(item, target, decisionDifficulty);
          if (!scored || !scored.qualifies) return;
          actions.push({
            kind: "item",
            item: item,
            target: target,
            score: scored.score,
            intent: scored.intent
          });
        });
      });
    }
    if (actions.length === 0) return null;

    let chosen = null;
    const intent = state.infinite.aiIntent;
    if (intent && intent.remaining > 0 && Math.random() < 0.7) {
      const focused = actions.filter(function (action) { return actionMatchesIntent(action, intent); });
      if (focused.length > 0) {
        chosen = focused.reduce(function (best, action) {
          const noisy = action.score + (Math.random() * 2 - 1) * difficulty.noise;
          return !best || noisy > best.noisy ? { action: action, noisy: noisy } : best;
        }, null).action;
      }
    }
    if (!chosen) {
      chosen = actions.reduce(function (best, action) {
        const noisy = action.score + (Math.random() * 2 - 1) * difficulty.noise;
        return !best || noisy > best.noisy ? { action: action, noisy: noisy } : best;
      }, null).action;
      state.infinite.aiIntent = createAIIntent(chosen, threats);
    }
    return chosen;
  }

  function updateAI(dt) {
    if (state.ended) return;
    if (state.mode === "practice" && state.aiDifficulty === "off") return;
    if (state.infinite.aiIntent) {
      state.infinite.aiIntent.remaining -= dt;
      if (state.infinite.aiIntent.remaining <= 0) state.infinite.aiIntent = null;
    }
    state.infinite.aiDecisionRemaining -= dt;
    if (state.infinite.aiDecisionRemaining > 0) return;
    state.infinite.aiDecisionRemaining = getAIDecisionInterval();
    const difficulty = config.AI.difficulties[state.aiDifficulty] || config.AI.difficulties.normal;
    const action = chooseAIAction(difficulty);
    if (!action) return;
    if (action.kind === "item") {
      if (game.Inventory.useItem(action.item, action.target.x, action.target.y)) state.infinite.aiActions += 1;
    } else if (placeStone(action.target.x, action.target.y, 1)) {
      state.infinite.aiRecentMoves.push({ x: action.target.x, y: action.target.y });
      if (state.infinite.aiRecentMoves.length > 2) state.infinite.aiRecentMoves.shift();
      state.infinite.aiActions += 1;
    }
  }

  function updateSimulation(dt) {
    if (state.mode === "practice") game.applyPracticeConfig(true);
    if (!state.ended) {
      state.elapsed += dt;
      if (state.mode !== "infinite") state.classicRemaining = Math.max(0, state.classicRemaining - dt);
      state.players.forEach(function (player, side) {
        player.energy = Math.min(player.energyCapacity, player.energy + getRegenRate(state, side) * dt);
      });
      const paused = isPaused(state);
      game.Inventory.tick(state, dt, paused);
      if (!paused) {
        processMilestones();
        updateAI(dt);
        if (state.infinite.forecast) {
          state.infinite.forecast.remaining -= dt;
          if (state.infinite.forecast.remaining <= 0) destroyForecast();
        }
        if (mobileDevice) {
          ruleCheckAccumulator += dt;
          if (ruleCheckAccumulator >= 0.1) {
            if (state.mode === "infinite") updateInfinitePressure(ruleCheckAccumulator);
            else applyClassicRule();
            ruleCheckAccumulator = 0;
          }
        } else if (state.mode === "infinite") updateInfinitePressure(dt);
        else applyClassicRule();
      }
    } else {
      game.Inventory.tick(state, dt);
    }

    if (state.uiState.toastRemaining > 0) {
      state.uiState.toastRemaining = Math.max(0, state.uiState.toastRemaining - dt);
      renderToast();
    }
    if (state.uiState.patternFlash) {
      state.uiState.patternFlash.remaining -= dt;
      if (state.uiState.patternFlash.remaining <= 0) state.uiState.patternFlash = null;
    }
    updateParticles(dt);
  }

  function updateParticles(dt) {
    state.particles = state.particles.filter(function (particle) {
      particle.life -= dt;
      if (particle.kind === "spark") {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= 0.965;
        particle.vy = particle.vy * 0.965 + 60 * dt;
      }
      if (particle.kind === "shake" && particle.life <= 0) shell.classList.remove("shake");
      if (particle.kind === "shake-small" && particle.life <= 0) shell.classList.remove("shake-sm");
      return particle.life > 0;
    });
    state.visualEffects = state.visualEffects.filter(function (effect) {
      effect.remaining -= dt;
      return effect.remaining > 0;
    });
  }

  function visibleWorld() {
    const left = clamp((-state.camera.x / state.camera.zoom) / config.CELL - 1, 0, config.COLS - 1);
    const right = clamp(((state.viewport.width - state.camera.x) / state.camera.zoom) / config.CELL + 1, 0, config.COLS - 1);
    const top = clamp((-state.camera.y / state.camera.zoom) / config.CELL - 1, 0, config.ROWS - 1);
    const bottom = clamp(((state.viewport.height - state.camera.y) / state.camera.zoom) / config.CELL + 1, 0, config.ROWS - 1);
    return {
      left: Math.floor(left),
      right: Math.ceil(right),
      top: Math.floor(top),
      bottom: Math.ceil(bottom)
    };
  }

  function drawBoard() {
    context.clearRect(0, 0, state.viewport.width, state.viewport.height);
    context.save();
    context.translate(state.camera.x, state.camera.y);
    context.scale(state.camera.zoom, state.camera.zoom);
    const bounds = visibleWorld();
    ART.renderBoard(context, currentSkinId, bounds, state);
    drawActiveEffects(bounds);
    drawStones(bounds);
    drawBombPreview();
    drawForecast(bounds);
    drawParticles();
    drawPatternFlash();
    context.restore();
  }

  function drawActiveEffects(bounds) {
    state.activeEffects.forEach(function (effect) {
      const cells = effect.params.cells || [];
      cells.forEach(function (cell) {
        if (cell.x < bounds.left || cell.x > bounds.right || cell.y < bounds.top || cell.y > bounds.bottom) return;
        ART.renderEffect(context, "activeCell", { x: cell.x, y: cell.y, type: effect.type }, currentSkinId);
      });
      if (effect.type === "地雷") {
        ART.renderEffect(context, "mine", effect.params, currentSkinId);
      } else if (effect.type === "护盾") {
        ART.renderEffect(context, "shieldZone", effect.params, currentSkinId);
      } else if (effect.type === "禁落令") {
        ART.renderEffect(context, "lockBoard", effect.params, currentSkinId);
      } else if (effect.type === "禁道具") {
        ART.renderEffect(context, "freezeUI", effect.params, currentSkinId);
      } else if (effect.type === "加速") {
        ART.renderEffect(context, "speedLines", effect.params, currentSkinId);
      } else if (effect.type === "颜色反转") {
        ART.renderEffect(context, "colorInvert", effect.params, currentSkinId);
      } else if (effect.type === "双重落子") {
        ART.renderEffect(context, "doubleDrop", effect.params, currentSkinId);
      } else if (effect.type === "暂停") {
        ART.renderEffect(context, "timeFreeze", effect.params, currentSkinId);
      }
    });
    state.visualEffects.forEach(function (effect) {
      const params = Object.assign({}, effect.params, {
        progress: 1 - effect.remaining / effect.duration
      });
      ART.renderEffect(context, effect.type, params, currentSkinId);
    });
  }

  function drawStones(bounds) {
    const now = performance.now() / 1000;
    for (let row = bounds.top; row <= bounds.bottom; row += 1) {
      for (let col = bounds.left; col <= bounds.right; col += 1) {
        const side = state.board[row][col];
        if (side !== 0 && side !== 1) continue;
        const hidden = state.viewSide !== side && state.stonePlacedAt[row][col] >= 0
          && state.activeEffects.some(function (effect) {
            return effect.type === "隐身" && effect.params.owner === side
              && state.stonePlacedAt[row][col] >= effect.startedAt;
          });
        if (hidden) continue;
        const x = (col + 0.5) * config.CELL;
        const y = (row + 0.5) * config.CELL;
        const disabled = game.Inventory.isStoneDisabled(state, col, row, side);
        const dropProgress = clamp(
          (state.elapsed - state.stonePlacedAt[row][col]) / config.UI.dropDurationSeconds,
          0,
          1
        );
        const easedDrop = 1 - Math.pow(1 - dropProgress, 3);
        ART.renderPiece(context, x, y, side, currentSkinId, {
          disabled: disabled,
          scale: 0.78 + easedDrop * 0.22,
          pulse: Math.floor(x / config.CELL) % 10 === 0 && Math.floor(y / config.CELL) % 10 === 0,
          time: now
        });
      }
    }
  }

  function selectedBomb() {
    const item = state.inventory.items.find(function (candidate) {
      return candidate.id === state.uiState.selectedItemId;
    });
    if (!item || !["bomb", "pointBomb"].includes(item.type)) return null;
    const strength = game.Inventory.getQualityStats(item).strength;
    return {
      type: item.type,
      radius: item.type === "pointBomb" ? 1 : strength >= 1.5 ? 2 : 1
    };
  }

  function drawBombPreview() {
    const cell = state.uiState.hoverCell;
    const bomb = selectedBomb();
    state.uiState.bombPreview = Boolean(cell && bomb);
    if (cell && bomb) {
      const diameter = bomb.radius * 2 + 1;
      $("bombPreviewLabel").textContent = `爆炸范围 ${diameter} × ${diameter}`;
      ART.renderEffect(context, "bombPreview", { x: cell.x, y: cell.y, radius: bomb.radius }, currentSkinId);
    }
  }

  function drawForecast(bounds) {
    const forecast = state.infinite.forecast;
    if (!forecast) return;
    const progress = clamp(1 - forecast.remaining / config.INFINITE.forecastWarningSeconds, 0, 1);
    ART.renderEffect(context, "forecast", {
      x: forecast.x, y: forecast.y, size: forecast.size,
      progress: progress, seconds: Math.max(1, Math.ceil(forecast.remaining))
    }, currentSkinId);
  }

  function drawParticles() {
    state.particles.forEach(function (particle) {
      ART.renderEffect(context, "particle", particle, currentSkinId);
    });
  }

  function drawPatternFlash() {
    const flash = state.uiState.patternFlash;
    if (!flash) return;
    const progress = 1 - flash.remaining / config.UI.patternFlashSeconds;
    ART.renderEffect(context, "patternFlash", {
      x: flash.x, y: flash.y, progress: progress
    }, currentSkinId);
  }

  function emitPattern(patternKey, side, anchor) {
    const definition = config.PATTERNS.patterns[patternKey];
    state.uiState.patternFlash = { x: anchor.x, y: anchor.y, remaining: config.UI.patternFlashSeconds };
    state.uiState.toastText = `✦ ${sideName(side)} · ${definition.name} · 奖励触发`;
    state.uiState.toastRemaining = config.UI.patternToastSeconds;
    state.uiState.toastKind = "pattern";
    ART.spawnParticles(anchor.x, anchor.y, 16, "pattern");
    game.AUDIO.play("pattern");
    renderToast();
  }

  function isPointInBoard(clientX, clientY) {
    const cell = screenToCell(clientX, clientY);
    state.uiState.hoverCell = cell.x >= 0 && cell.x < config.COLS && cell.y >= 0 && cell.y < config.ROWS ? cell : null;
  }

  function getPinchPoints() {
    return Array.from(activePointers.values()).slice(0, 2);
  }

  function updatePinchCamera() {
    const points = getPinchPoints();
    if (points.length < 2 || !pinchGesture) return;
    const rect = canvas.getBoundingClientRect();
    const midpointX = (points[0].x + points[1].x) / 2 - rect.left;
    const midpointY = (points[0].y + points[1].y) / 2 - rect.top;
    const distance = Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y));
    const zoom = clamp(pinchGesture.zoom * distance / pinchGesture.distance, 0.4, 3.5);
    state.camera.zoom = zoom;
    state.camera.x = midpointX - pinchGesture.worldX * zoom;
    state.camera.y = midpointY - pinchGesture.worldY * zoom;
    clampCamera();
  }

  function onPointerDown(event) {
    if (event.button !== 0 || state.ended) return;
    if (event.pointerType === "touch") {
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
      if (activePointers.size >= 2) {
        const points = getPinchPoints();
        const rect = canvas.getBoundingClientRect();
        const midpointX = (points[0].x + points[1].x) / 2 - rect.left;
        const midpointY = (points[0].y + points[1].y) / 2 - rect.top;
        pinchGesture = {
          distance: Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)),
          zoom: state.camera.zoom,
          worldX: (midpointX - state.camera.x) / state.camera.zoom,
          worldY: (midpointY - state.camera.y) / state.camera.zoom
        };
        state.uiState.pointerDown = null;
        state.uiState.isPanning = true;
        canvas.classList.add("is-panning");
        return;
      }
    }
    state.uiState.pointerDown = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false
    };
    if (event.pointerType !== "touch") canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (event.pointerType === "touch" && activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinchGesture) {
        updatePinchCamera();
        return;
      }
    }
    const pointer = state.uiState.pointerDown;
    if (!pointer || pointer.id !== event.pointerId) {
      isPointInBoard(event.clientX, event.clientY);
      return;
    }
    const dx = event.clientX - pointer.lastX;
    const dy = event.clientY - pointer.lastY;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 5) {
      pointer.moved = true;
      state.uiState.isPanning = true;
      canvas.classList.add("is-panning");
    }
    if (pointer.moved) {
      state.camera.x += dx;
      state.camera.y += dy;
      clampCamera();
    }
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    isPointInBoard(event.clientX, event.clientY);
  }

  function onPointerUp(event) {
    if (event.pointerType === "touch") {
      activePointers.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (pinchGesture) {
        if (activePointers.size < 2) {
          pinchGesture = null;
          state.uiState.pointerDown = null;
          state.uiState.isPanning = false;
          canvas.classList.remove("is-panning");
        }
        return;
      }
    }
    const pointer = state.uiState.pointerDown;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!pointer.moved) {
      const cell = screenToCell(event.clientX, event.clientY);
      handleBoardClick(cell.x, cell.y);
    }
    state.uiState.pointerDown = null;
    state.uiState.isPanning = false;
    canvas.classList.remove("is-panning");
  }

  function onPointerCancel(event) {
    if (event.pointerType === "touch") activePointers.delete(event.pointerId);
    if (pinchGesture) {
      if (activePointers.size < 2) {
        pinchGesture = null;
        state.uiState.pointerDown = null;
        state.uiState.isPanning = false;
        canvas.classList.remove("is-panning");
      }
      return;
    }
    if (!state.uiState.pointerDown || state.uiState.pointerDown.id !== event.pointerId) return;
    state.uiState.pointerDown = null;
    state.uiState.isPanning = false;
    canvas.classList.remove("is-panning");
  }

  function onWheel(event) {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const worldX = (x - state.camera.x) / state.camera.zoom;
    const worldY = (y - state.camera.y) / state.camera.zoom;
    const zoom = clamp(state.camera.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), 0.4, 3.5);
    state.camera.zoom = zoom;
    state.camera.x = x - worldX * zoom;
    state.camera.y = y - worldY * zoom;
    clampCamera();
  }

  function onCanvasLeave() {
    if (state.uiState.pointerDown) return;
    state.uiState.hoverCell = null;
  }

  function onModeClick(event) {
    const mode = event.currentTarget.dataset.mode;
    if (mode === state.mode || state.ended) return;
    shell.classList.remove("is-ended");
    createNewMatch(mode);
  }

  function onRestartClick() {
    restartMatch();
  }

  function onDifficultyChange(event) {
    state.aiDifficulty = event.currentTarget.value;
    state.infinite.aiDecisionRemaining = getAIDecisionInterval();
    updateDerivedUI();
  }

  function practiceValueFromInput(input) {
    if (input.type === "checkbox") return input.checked;
    if (input.tagName === "SELECT") {
      return input.dataset.practiceType === "integer" ? Math.round(Number(input.value)) : input.value;
    }
    if (input.value === "" && input.dataset.practiceType === "optional-number") return "";
    const value = Number(input.value);
    return input.dataset.practiceType === "integer" ? Math.round(value) : value;
  }

  function refreshPracticePanel() {
    document.querySelectorAll("[data-practice-key]").forEach(function (input) {
      const value = game.PRACTICE_CONFIG[input.dataset.practiceKey];
      if (input.type === "checkbox") input.checked = Boolean(value);
      else input.value = String(value);
      const output = input.closest(".practice-control").querySelector("output");
      if (output) output.value = formatPracticeValue(input.dataset.practiceKey, value, input);
    });
    $("practiceSnapshot").value = "";
  }

  function formatPracticeValue(key, value, input) {
    if (input.type === "checkbox") return value ? "开" : "关";
    if (input.dataset.practiceType === "optional-number" && value === "") return "默认";
    if (key === "patternMinimumLineLength") return `${value} 连`;
    if (["tier1DropChance", "tier2DropChance", "tier3DropChance", "areaThreshold"].includes(key)) {
      return `${Math.round(value * 100)}%`;
    }
    return `${value}${input.dataset.unit || ""}`;
  }

  function onPracticeInput(event) {
    const input = event.target;
    const key = input.dataset.practiceKey;
    if (!key) return;
    game.PRACTICE_CONFIG[key] = practiceValueFromInput(input);
    game.applyPracticeConfig(true);
    if (state.mode !== "practice") return;
    if (key === "energyMax") {
      state.players.forEach(function (player) {
        player.energyCapacity = game.PRACTICE_CONFIG.energyMax;
        player.energy = Math.min(player.energy, player.energyCapacity);
      });
    } else if (key === "classicDuration") {
      state.classicRemaining = Math.max(0, game.PRACTICE_CONFIG.classicDuration - state.elapsed);
    } else if (key === "aiDifficulty") {
      state.aiDifficulty = game.PRACTICE_CONFIG.aiDifficulty;
      state.infinite.aiDecisionRemaining = getAIDecisionInterval();
    } else if (key === "aiIntervalOverride") {
      state.infinite.aiDecisionRemaining = getAIDecisionInterval();
    } else if (key === "globalCooldown") {
      state.globalItemCooldownRemaining = Math.min(
        state.globalItemCooldownRemaining,
        game.PRACTICE_CONFIG.globalCooldown
      );
    }
    const output = input.closest(".practice-control").querySelector("output");
    if (output) output.value = formatPracticeValue(key, game.PRACTICE_CONFIG[key], input);
    updateDerivedUI();
  }

  function onPracticeReset() {
    Object.assign(game.PRACTICE_CONFIG, game.PRACTICE_DEFAULTS);
    game.applyPracticeConfig(true);
    refreshPracticePanel();
    if (state.mode === "practice") {
      state.aiDifficulty = game.PRACTICE_CONFIG.aiDifficulty;
      state.players.forEach(function (player) {
        player.energyCapacity = game.PRACTICE_CONFIG.energyMax;
        player.energy = Math.min(player.energy, player.energyCapacity);
      });
      state.classicRemaining = Math.max(0, game.PRACTICE_CONFIG.classicDuration - state.elapsed);
      state.infinite.aiDecisionRemaining = getAIDecisionInterval();
      updateDerivedUI();
    }
  }

  function onPracticeExport() {
    $("practiceSnapshot").value = JSON.stringify(game.PRACTICE_CONFIG, null, 2);
    $("practiceSnapshot").focus();
    $("practiceSnapshot").select();
  }

  function onPracticeRestart() {
    if (state.mode !== "practice") return;
    restartMatch();
  }

  function onAudioToggle() {
    game.AUDIO.setEnabled(!game.AUDIO.enabled);
    updateDerivedUI();
  }

  function openPlaceholder(title) {
    $("placeholderTitle").textContent = title;
    $("placeholderModal").hidden = false;
  }

  function closePlaceholder() {
    $("placeholderModal").hidden = true;
  }

  function onKeyDown(event) {
    if (event.target instanceof HTMLButtonElement) return;
    if (event.key.toLowerCase() === "r" && state.ended) restartMatch();
    if (event.key === "Escape") closePlaceholder();
  }

  function initEvents() {
    document.addEventListener("pointerdown", function () { game.AUDIO.unlock(); });
    canvas.addEventListener("pointerdown", function (event) { onPointerDown(event); });
    canvas.addEventListener("pointermove", function (event) { onPointerMove(event); });
    canvas.addEventListener("pointerup", function (event) { onPointerUp(event); });
    canvas.addEventListener("pointercancel", function (event) { onPointerCancel(event); });
    canvas.addEventListener("pointerleave", function () { onCanvasLeave(); });
    canvas.addEventListener("wheel", function (event) { onWheel(event); }, { passive: false });
    window.addEventListener("resize", function () { setCameraForViewport(); });
    window.addEventListener("keydown", function (event) { onKeyDown(event); });
    document.querySelectorAll(".mode-button").forEach(function (button) {
      button.addEventListener("click", function (event) { onModeClick(event); });
    });
    $("restartButton").addEventListener("click", function () { onRestartClick(); });
    $("aiDifficulty").addEventListener("change", function (event) { onDifficultyChange(event); });
    $("audioToggle").addEventListener("click", function () { onAudioToggle(); });
    $("practicePanel").addEventListener("input", function (event) { onPracticeInput(event); });
    $("practiceRestart").addEventListener("click", function () { onPracticeRestart(); });
    $("practiceReset").addEventListener("click", function () { onPracticeReset(); });
    $("practiceExport").addEventListener("click", function () { onPracticeExport(); });
    $("leaderboardButton").addEventListener("click", function () { openPlaceholder("排行榜"); });
    $("achievementButton").addEventListener("click", function () { openPlaceholder("成就"); });
    $("closePlaceholder").addEventListener("click", function () { closePlaceholder(); });
    $("placeholderModal").addEventListener("click", function (event) {
      if (event.target === $("placeholderModal")) closePlaceholder();
    });
  }

  function syncModeUI() {
    document.querySelectorAll(".mode-button").forEach(function (button) {
      const selected = button.dataset.mode === state.mode;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function updateFrame(timestamp) {
    const dt = state.lastFrameTime ? Math.min(0.1, (timestamp - state.lastFrameTime) / 1000) : 0;
    state.lastFrameTime = timestamp;
    state.debugFps = dt > 0 ? Math.round(1 / dt) : 0;
    updateSimulation(dt);
    drawBoard();
    uiRefreshAccumulator += dt;
    if (!mobileDevice || uiRefreshAccumulator >= 0.1) {
      updateDerivedUI();
      game.Inventory.render(state);
      uiRefreshAccumulator = 0;
    }
    scheduleFrame();
  }

  function scheduleFrame() {
    window.requestAnimationFrame(updateFrame);
  }

  function getLeaderboardData() {
    return;
  }

  function getAchievementData() {
    return;
  }

  game.Game = {
    get state() { return state; },
    showToast: showToast,
    updateDerivedUI: updateDerivedUI,
    emitPattern: emitPattern,
    selectItem: selectItem,
    clearSelectedItem: clearSelectedItem,
    placeStone: placeStone,
    inBounds: inBounds,
    explodeCell: explodeCell,
    explodeArea: explodeArea,
    changeOwner: changeOwner,
    addEffect: function (type, duration, params) { return game.Inventory.addEffect(state, type, duration, params); },
    getPiecesInArea: getPiecesInArea,
    setDyeCooldown: setDyeCooldown,
    spawnParticles: spawnParticles,
    shake: shake,
    isPaused: isPaused,
    getPlacementCost: getPlacementCost,
    getRegenRate: getRegenRate,
    getAreaShares: getAreaShares,
    getLeaderboardData: getLeaderboardData,
    getAchievementData: getAchievementData
  };

  loadSavedScores();
  initEvents();
  refreshPracticePanel();
  createNewMatch("classic");
  setCameraForViewport();
  scheduleFrame();
})(window);
