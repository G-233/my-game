/* Global module order: game-config.js -> game-state.js -> pattern-system.js -> inventory-system.js -> audio-synth.js -> game.js. */
(function (root) {
  "use strict";

  const game = root.NeonGame;
  const config = game.CONFIG;
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];

  function inBounds(col, row) {
    return col >= 0 && col < config.COLS && row >= 0 && row < config.ROWS;
  }

  function isSide(state, col, row, side) {
    return inBounds(col, row) && state.board[row][col] === side;
  }

  function lineLength(state, col, row, side, dx, dy) {
    let total = 1;
    for (const sign of [-1, 1]) {
      let x = col + dx * sign;
      let y = row + dy * sign;
      while (isSide(state, x, y, side)) {
        total += 1;
        x += dx * sign;
        y += dy * sign;
      }
    }
    return total;
  }

  function matchesTemplateAt(state, col, row, side, template, requireEmptyCenter) {
    for (const [offsetX, offsetY] of template) {
      if (!isSide(state, col + offsetX, row + offsetY, side)) return false;
    }
    if (requireEmptyCenter && state.board[row][col] !== null) return false;
    return true;
  }

  function findTemplateOrigins(state, col, row, side, template, requireEmptyCenter) {
    const origins = [];
    template.forEach(function (offset) {
      const originX = col - offset[0];
      const originY = row - offset[1];
      if (!inBounds(originX, originY) || !matchesTemplateAt(state, originX, originY, side, template, requireEmptyCenter)) return;
      if (!origins.some(function (origin) { return origin.x === originX && origin.y === originY; })) {
        origins.push({ x: originX, y: originY });
      }
    });
    return origins;
  }

  function detectDoubleThree(state, col, row, side) {
    return dirs.filter(function (direction) {
      return lineLength(state, col, row, side, direction[0], direction[1]) >= config.PATTERNS.minimumLineLength;
    }).length >= 2;
  }

  function detectSymmetry(state, col, row, side) {
    const radius = 1;
    const cells = [];
    for (let y = -radius; y <= radius; y += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        if (isSide(state, col + x, row + y, side)) cells.push([x, y]);
      }
    }
    if (cells.length < 5 || state.board[row][col] !== side) return false;
    const own = new Set(cells.map(function (cell) { return `${cell[0]},${cell[1]}`; }));
    const horizontal = cells.every(function (cell) { return own.has(`${-cell[0]},${cell[1]}`); });
    const vertical = cells.every(function (cell) { return own.has(`${cell[0]},${-cell[1]}`); });
    return horizontal || vertical;
  }

  function detectAt(state, col, row, side) {
    const found = [];
    if (!isSide(state, col, row, side)) return found;

    dirs.forEach(function (direction) {
      const count = lineLength(state, col, row, side, direction[0], direction[1]);
      if (count >= config.PATTERNS.minimumLineLength && count <= 5) found.push({ key: `line${count}`, anchor: { x: col, y: row } });
      else if (count === 6) found.push({ key: "line6", anchor: { x: col, y: row } });
      else if (count >= 7) found.push({ key: "line7", anchor: { x: col, y: row } });
    });

    const templates = config.PATTERNS.templates;
    ["square2", "lShape", "cross", "rectangle2x3", "square3", "bigCross", "doubleFiveCross"].forEach(function (key) {
      const origins = findTemplateOrigins(state, col, row, side, templates[key], false);
      origins.forEach(function (origin) {
        found.push({ key: key, anchor: origin });
      });
    });

    const rings = findTemplateOrigins(state, col, row, side, templates.ring3, true);
    rings.forEach(function (origin) { found.push({ key: "ring3", anchor: origin }); });

    if (detectDoubleThree(state, col, row, side)) found.push({ key: "doubleThree", anchor: { x: col, y: row } });
    if (detectSymmetry(state, col, row, side)) found.push({ key: "symmetry", anchor: { x: col, y: row } });

    const unique = new Map();
    found.forEach(function (match) {
      const id = `${match.key}:${match.anchor.x}:${match.anchor.y}`;
      if (!unique.has(id)) unique.set(id, match);
    });
    return Array.from(unique.values());
  }

  function choosePattern(state, matches, side) {
    const cooldowns = state.patternCooldowns[side];
    const orderedMatches = matches.slice();
    orderedMatches.sort(function (a, b) {
      const tierDiff = config.PATTERNS.patterns[b.key].tier - config.PATTERNS.patterns[a.key].tier;
      if (tierDiff !== 0) return tierDiff;
      return config.PATTERNS.patterns[b.key].score - config.PATTERNS.patterns[a.key].score;
    });
    const highest = orderedMatches[0];
    if (!highest) return null;
    if (cooldowns.has(highest.key) && state.elapsed - cooldowns.get(highest.key) < config.PATTERNS.cooldownSeconds) return null;
    return highest;
  }

  function addEnergy(state, side, amount) {
    const player = state.players[side];
    player.energy = Math.min(player.energyCapacity, player.energy + amount);
  }

  function countTier2Reward(state, side, anchor) {
    const keys = Object.keys(config.PATTERNS.patterns).filter(function (key) {
      return config.PATTERNS.patterns[key].tier === 2;
    });
    const chosen = keys[Math.floor(Math.random() * keys.length)];
    applyReward(state, { key: chosen, anchor: anchor }, side, true);
  }

  function cellsFor(anchor, template) {
    return template.map(function (offset) {
      return { x: anchor.x + offset[0], y: anchor.y + offset[1] };
    }).filter(function (cell) {
      return cell.x >= 0 && cell.x < config.COLS && cell.y >= 0 && cell.y < config.ROWS;
    });
  }

  function applyReward(state, match, side, skipPatternLock) {
    const spec = config.PATTERNS.patterns[match.key];
    if (!spec) return;

    if (spec.energy) addEnergy(state, side, spec.energy);
    if (spec.cap) {
      state.players[side].energyCapacity += spec.cap;
    }
    if (spec.fullEnergy) state.players[side].energy = state.players[side].energyCapacity;

    if (match.key === "square2") {
      game.Inventory.addEffect(state, "harden", spec.duration, { side: side, cells: cellsFor(match.anchor, config.PATTERNS.templates.square2) });
    } else if (match.key === "lShape") {
      const center = match.anchor;
      for (let y = center.y - 1; y <= center.y + 1; y += 1) {
        for (let x = center.x - 1; x <= center.x + 1; x += 1) {
          if (x >= 0 && x < config.COLS && y >= 0 && y < config.ROWS && state.board[y][x] === 1 - side) {
            if (game.Game.changeOwner(x, y, side)) {
              x = center.x + 2;
              y = center.y + 2;
            }
          }
        }
      }
    } else if (match.key === "rectangle2x3") {
      game.Inventory.addEffect(state, "rectangleShield", spec.duration, {
        side: side,
        cells: cellsFor(match.anchor, config.PATTERNS.templates.rectangle2x3),
        pulseRemaining: config.PATTERNS.patterns.rectangle2x3.pulseEvery,
        pulseEvery: config.PATTERNS.patterns.rectangle2x3.pulseEvery,
        pulseEnergy: config.PATTERNS.patterns.rectangle2x3.pulseEnergy
      });
    } else if (match.key === "ring3") {
      game.Inventory.addEffect(state, "ringLock", spec.duration, {
        side: side,
        cells: [{ x: match.anchor.x, y: match.anchor.y }]
      });
    } else if (match.key === "bigCross") {
      game.Inventory.addEffect(state, "disabledStones", spec.duration, { side: side, allEnemy: true });
    } else if (match.key === "square3") {
      const permanentCells = cellsFor(match.anchor, config.PATTERNS.templates.square3);
      permanentCells.forEach(function (cell) {
        state.board[cell.y][cell.x] = side;
        game.Inventory.clearCellEffects(state, cell.x, cell.y);
      });
      game.Inventory.addEffect(state, "permanent", Number.POSITIVE_INFINITY, { side: side, cells: permanentCells });
    }

    const practiceDropChances = config.PATTERNS.tierDropChances;
    if (spec.dropChance && Math.random() < (practiceDropChances ? practiceDropChances[1] : spec.dropChance)) {
      game.Inventory.dropForTier(state, 1, side);
    }
    if (spec.guaranteedDrop && (!practiceDropChances || Math.random() < practiceDropChances[spec.tier])) {
      game.Inventory.dropForTier(state, spec.tier, side);
    }
    if (match.key === "symmetry") countTier2Reward(state, side, match.anchor);

    if (skipPatternLock) return;

    state.players[side].patternScore += spec.score;
    state.match.patternEvents.push({ key: match.key, side: side, at: state.elapsed });
    state.patternCooldowns[side].set(match.key, state.elapsed);

    game.Game.emitPattern(match.key, side, match.anchor);
    game.Game.updateDerivedUI();
  }

  function onStonePlaced(state, col, row, side) {
    const matches = detectAt(state, col, row, side);
    if (matches.length === 0) return null;
    const chosen = choosePattern(state, matches, side);
    if (!chosen) return null;
    applyReward(state, chosen, side, false);
    return chosen;
  }

  game.Patterns = {
    detectAt: detectAt,
    onStonePlaced: onStonePlaced,
    applyReward: applyReward
  };
})(window);
