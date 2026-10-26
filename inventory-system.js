/* Global module order: game-config.js -> game-state.js -> pattern-system.js -> inventory-system.js -> audio-synth.js -> game.js. */
(function (root) {
  "use strict";

  const game = root.NeonGame;
  const config = game.CONFIG;
  let nextItemId = 0;
  const slotShiftAnimations = new WeakMap();

  function getInventory(state, side) {
    return side === 1 ? state.aiInventory : state.inventory;
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function getQualityStats(item) {
    return config.QUALITY[item.quality];
  }

  function rollQuality(weightedQualities) {
    const roll = Math.random();
    let cursor = 0;
    for (const entry of weightedQualities) {
      cursor += entry.chance;
      if (roll <= cursor) return entry.quality;
    }
    return weightedQualities[weightedQualities.length - 1].quality;
  }

  function qualityForTier(tier) {
    if (tier === 1) return "白";
    if (tier === 2) {
      return rollQuality([
        { quality: "绿", chance: config.PATTERNS.tier2QualityChances["绿"] },
        { quality: "蓝", chance: config.PATTERNS.tier2QualityChances["蓝"] }
      ]);
    }

    return rollQuality([
      { quality: "蓝", chance: config.PATTERNS.tier3QualityChances["蓝"] },
      { quality: "金", chance: config.PATTERNS.tier3QualityChances["金"] }
    ]);
  }

  function createItem(state, type, quality, inventory) {
    const definition = config.ITEMS[type];
    const baseCost = randomInt(definition.costRange[0], definition.costRange[1]);
    const item = {
      id: `item-${++nextItemId}`,
      type: definition.type,
      quality: quality,
      state: inventory.items.length < inventory.displayLimit ? "shown" : "overflow",
      age: 0,
      currentCost: baseCost * config.QUALITY[quality].cost,
      effect: definition.effect,
      tier: definition.tier,
      rare: definition.rare,
      baseCost: baseCost
    };
    enqueueItem(item, inventory);
    return item;
  }

  function enqueueItem(item, inventory) {
    if (inventory.items.length < inventory.displayLimit) {
      item.state = "shown";
      inventory.items.push(item);
      game.AUDIO.play("drop");
      inventory.totalCount += 1;
      return;
    }
    item.state = "overflow";
    if (inventory.overflow.length >= inventory.overflowLimit) {
      inventory.overflow.shift();
    } else {
      inventory.totalCount += 1;
    }
    inventory.overflow.push(item);
  }

  function randomType(pool) {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function addItem(state, type, quality, side) {
    const inventory = getInventory(state, side || 0);
    return createItem(state, type, quality, inventory);
  }

  function dropForTier(state, tier, side) {
    const inventory = getInventory(state, side || 0);
    const pool = tier === 1 ? config.ITEM_POOLS.tier1 : tier === 2 ? config.ITEM_POOLS.tier2 : config.ITEM_POOLS.tier3;
    let type;
    if (tier === 3 && !state.rareDropAwarded && Math.random() < config.INVENTORY.rareDropChance) {
      type = randomType(config.ITEM_POOLS.rare);
      state.rareDropAwarded = true;
      return createItem(state, type, "金", inventory);
    }
    type = randomType(pool);
    return createItem(state, type, qualityForTier(tier), inventory);
  }

  function promoteOverflow(state, inventory) {
    while (inventory.items.length < inventory.displayLimit && inventory.overflow.length > 0) {
      const item = inventory.overflow.shift();
      item.state = "shown";
      inventory.items.push(item);
      game.AUDIO.play("drop");
    }
  }

  function removeItem(state, item, side) {
    const inventory = getInventory(state, side);
    const shownIndex = inventory.items.findIndex(function (candidate) { return candidate.id === item.id; });
    if (shownIndex >= 0) {
      inventory.items.splice(shownIndex, 1);
    } else {
      const overflowIndex = inventory.overflow.findIndex(function (candidate) { return candidate.id === item.id; });
      if (overflowIndex < 0) return false;
      inventory.overflow.splice(overflowIndex, 1);
    }
    inventory.totalCount = Math.max(0, inventory.totalCount - 1);
    if (game.state.uiState.selectedItemId === item.id) game.Game.clearSelectedItem();
    promoteOverflow(state, inventory);
    return true;
  }

  function costForItem(item) {
    const quality = getQualityStats(item);
    const startingCost = item.baseCost * quality.cost;
    return Math.max(config.INVENTORY.itemCostMinimum, startingCost - item.age * config.INVENTORY.itemCostDecreasePerSecond);
  }

  function durationForItem(item, baseDuration) {
    return baseDuration * getQualityStats(item).strength;
  }

  function quantityForItem(item, baseQuantity) {
    return Math.max(baseQuantity, Math.ceil(baseQuantity * getQualityStats(item).strength));
  }

  function rangeForItem(item, baseRange) {
    return baseRange + Math.ceil(getQualityStats(item).strength - 1);
  }

  function clearSelectedIfRemoved(item) {
    if (game.state.uiState.selectedItemId === item.id) game.Game.clearSelectedItem();
  }

  function useItem(item, targetX, targetY) {
    const state = game.Game.state;
    if (!item || !item.id || !game.Game.inBounds(targetX, targetY)) {
      game.Game.showToast("请在棋盘范围内操作", true);
      return false;
    }
    const side = state.inventory.items.some(function (candidate) { return candidate.id === item.id; }) ? 0 : 1;
    const inventory = getInventory(state, side);
    const storedItem = inventory.items.find(function (candidate) { return candidate.id === item.id; });
    if (!storedItem) {
      game.Game.showToast("该道具已不在背包中", true);
      clearSelectedIfRemoved(item);
      return false;
    }
    item = storedItem;
    const target = { x: targetX, y: targetY };
    if (state.globalItemCooldownRemaining > 0) {
      game.Game.showToast(`道具冷却中 ${state.globalItemCooldownRemaining.toFixed(1)} 秒`, true);
      return false;
    }
    if (hasEffectForSide(state, "禁道具", side)) {
      game.Game.showToast("道具被冻结", true);
      return false;
    }
    if (game.Game.isPaused(state)) {
      game.Game.showToast("时间暂停中，暂时不能使用道具", true);
      return false;
    }
    if (item.rare && state.rareItemsUsed >= config.INVENTORY.rareUseLimit) {
      game.Game.showToast("本局极稀有道具使用次数已达上限", true);
      return false;
    }
    const player = state.players[side];
    const freePracticeUse = state.mode === "practice" && side === 0 && game.PRACTICE_CONFIG.invincible;
    if (!freePracticeUse && player.energy + 0.0001 < item.currentCost) {
      game.Game.showToast(`能量不足，需要 ${Math.ceil(item.currentCost)} 点`, true);
      return false;
    }

    if (!freePracticeUse) player.energy = Math.max(0, player.energy - item.currentCost);
    const succeeded = item.effect.call({
      state: state,
      side: side,
      item: item,
      target: target
    }, target.x, target.y, getQualityStats(item).strength);
    if (succeeded === false) {
      if (!freePracticeUse) player.energy = Math.min(player.energyCapacity, player.energy + item.currentCost);
      game.Game.updateDerivedUI();
      return false;
    }
    state.globalItemCooldownRemaining = config.INVENTORY.globalCooldownSeconds;
    if (item.rare) state.rareItemsUsed += 1;
    if (state.mode === "practice") state.match.itemUses += 1;
    removeItem(state, item, side);
    if (state.mode === "practice" && game.PRACTICE_CONFIG.debug) {
      console.debug(`[练习调试] 使用道具: ${config.ITEMS[item.type].name}`);
    }
    game.Game.showToast(`${config.ITEMS[item.type].name}已使用`);
    game.Game.updateDerivedUI();
    return true;
  }

  function addEffect(state, type, duration, params) {
    params = params || {};
    if (state.mode === "practice") duration *= config.PRACTICE.effectDurationMultiplier;
    const owner = params.owner === undefined ? params.side : params.owner;
    const existing = state.activeEffects.find(function (effect) {
      if (effect.type !== type) return false;
      if (type === "地雷") {
        return effect.params.x === params.x && effect.params.y === params.y;
      }
      const existingOwner = effect.params.owner === undefined ? effect.params.side : effect.params.owner;
      const incomingOwner = params.owner === undefined ? params.side : params.owner;
      return existingOwner === incomingOwner && effect.params.target === params.target;
    });
    if (existing) {
      existing.remaining = duration;
      existing.duration = duration;
      if (type === "permanent") {
        const cells = new Map((existing.params.cells || []).concat(params.cells || []).map(function (cell) {
          return [`${cell.x},${cell.y}`, cell];
        }));
        existing.params = { side: params.side, cells: Array.from(cells.values()) };
      } else {
        existing.params = params;
      }
      existing.owner = owner;
      if (state.mode === "practice" && game.PRACTICE_CONFIG.debug) console.debug(`[练习调试] 效果刷新: ${type}`);
      if (type === "rectangleShield") existing.params.pulseRemaining = existing.params.pulseEvery;
      return existing;
    }
    const effect = { type: type, duration: duration, remaining: duration, params: params, owner: owner, startedAt: state.elapsed };
    state.activeEffects.push(effect);
    if (state.mode === "practice" && game.PRACTICE_CONFIG.debug) console.debug(`[练习调试] 效果施加: ${type}`);
    return effect;
  }

  function hasEffectForSide(state, type, side) {
    return state.activeEffects.some(function (effect) {
      return effect.type === type && effect.params.target === side;
    });
  }

  function stealRandom(state, side, count) {
    const opponentInventory = getInventory(state, 1 - side);
    const ownInventory = getInventory(state, side);
    const available = opponentInventory.items.concat(opponentInventory.overflow);
    let moved = 0;
    while (available.length > 0 && moved < count) {
      const stolen = available.splice(Math.floor(Math.random() * available.length), 1)[0];
      const shownIndex = opponentInventory.items.findIndex(function (item) { return item.id === stolen.id; });
      if (shownIndex >= 0) opponentInventory.items.splice(shownIndex, 1);
      else {
        const overflowIndex = opponentInventory.overflow.findIndex(function (item) { return item.id === stolen.id; });
        if (overflowIndex < 0) continue;
        opponentInventory.overflow.splice(overflowIndex, 1);
      }
      opponentInventory.totalCount = Math.max(0, opponentInventory.totalCount - 1);
      clearSelectedIfRemoved(stolen);
      promoteOverflow(state, opponentInventory);
      stolen.age = 0;
      stolen.currentCost = costForItem(stolen);
      enqueueItem(stolen, ownInventory);
      moved += 1;
    }
    game.Game.updateDerivedUI();
    return moved;
  }

  function containsCell(effect, col, row) {
    return Array.isArray(effect.params.cells) && effect.params.cells.some(function (cell) {
      return cell.x === col && cell.y === row;
    });
  }

  function isCellProtected(state, col, row, side) {
    return state.activeEffects.some(function (effect) {
      if ((effect.type === "harden" || effect.type === "rectangleShield" || effect.type === "permanent")
        && effect.params.side === side && containsCell(effect, col, row)) return true;
      if (effect.type === "护盾" && effect.params.owner === side) {
        return Math.abs(effect.params.x - col) <= effect.params.radius
          && Math.abs(effect.params.y - row) <= effect.params.radius;
      }
      return false;
    });
  }

  function isCellLocked(state, col, row, side) {
    return state.activeEffects.some(function (effect) {
      return effect.type === "ringLock" && effect.params.side !== side && containsCell(effect, col, row);
    });
  }

  function isStoneDisabled(state, col, row, side) {
    return state.activeEffects.some(function (effect) {
      if (effect.type !== "disabledStones" || effect.params.side === side) return false;
      return effect.params.allEnemy === true || containsCell(effect, col, row);
    });
  }

  function clearCellEffects(state, col, row) {
    state.activeEffects = state.activeEffects.filter(function (effect) {
      if (effect.type === "permanent" || effect.params.allEnemy === true) return true;
      if (effect.type === "地雷" && effect.params.x === col && effect.params.y === row) return false;
      return !containsCell(effect, col, row);
    });
  }

  function tickEffects(state, dt, worldPaused) {
    const retained = [];
    state.activeEffects.forEach(function (effect) {
      if (worldPaused && effect.type !== "暂停") {
        retained.push(effect);
        return;
      }
      if (effect.type === "rectangleShield" && Number.isFinite(effect.params.pulseRemaining)) {
        effect.params.pulseRemaining -= dt;
        while (effect.params.pulseRemaining <= 0) {
          const player = state.players[effect.params.side];
          player.energy = Math.min(player.energyCapacity, player.energy + effect.params.pulseEnergy);
          effect.params.pulseRemaining += effect.params.pulseEvery;
        }
      }
      if (Number.isFinite(effect.remaining)) effect.remaining -= dt;
      if (effect.remaining > 0 || effect.remaining === Number.POSITIVE_INFINITY) {
        retained.push(effect);
      } else if (state.mode === "practice" && game.PRACTICE_CONFIG.debug) {
        console.debug(`[练习调试] 效果到期: ${effect.type}`);
      }
    });
    state.activeEffects = retained;
  }

  function tick(state, dt, worldPaused) {
    state.globalItemCooldownRemaining = Math.max(0, state.globalItemCooldownRemaining - dt);
    [state.inventory, state.aiInventory].forEach(function (inventory) {
      inventory.items.concat(inventory.overflow).forEach(function (item) {
        item.age += dt;
        item.currentCost = costForItem(item);
      });
    });
    if (!worldPaused) {
      for (let row = 0; row < config.ROWS; row += 1) {
        for (let col = 0; col < config.COLS; col += 1) {
          state.dyeCooldown[row][col] = Math.max(0, state.dyeCooldown[row][col] - dt);
        }
      }
    }
    tickEffects(state, dt, worldPaused);
  }

  function clearAll(state) {
    [state.inventory, state.aiInventory].forEach(function (inventory) {
      inventory.items.length = 0;
      inventory.overflow.length = 0;
      inventory.totalCount = 0;
    });
    state.globalItemCooldownRemaining = 0;
    state.uiState.selectedItemId = null;
  }

  function renderInventory(state) {
    const slots = document.getElementById("inventorySlots");
    const inventory = state.inventory;
    const currentIds = new Set(inventory.items.map(function (item) { return item.id; }));
    Array.from(slots.querySelectorAll(".item-slot")).forEach(function (element) {
      if (!currentIds.has(element.dataset.itemId)) element.remove();
    });

    if (inventory.items.length === 0) {
      if (!slots.querySelector(".inventory-empty")) {
        slots.innerHTML = '<div class="inventory-empty">战利品正在掉落 · 画出图案获取道具</div>';
      }
    } else {
      const empty = slots.querySelector(".inventory-empty");
      if (empty) empty.remove();
    }

    inventory.items.forEach(function (item, index) {
      let element = Array.from(slots.querySelectorAll(".item-slot")).find(function (node) {
        return node.dataset.itemId === item.id;
      });
      const definition = config.ITEMS[item.type];
      const quality = getQualityStats(item);
      if (!element) {
        element = document.createElement("button");
        element.type = "button";
        element.className = "item-slot";
        element.classList.add("is-new");
        element.dataset.itemId = item.id;
        element.innerHTML = '<span class="item-name"></span><span class="item-meta"><span class="item-quality"></span><span class="item-cost"></span></span>';
        element.addEventListener("animationend", function (event) {
          if (event.animationName === "item-drop") element.classList.remove("is-new");
        });
        element.addEventListener("click", function () {
          game.Game.selectItem(item.id);
        });
        slots.appendChild(element);
      }
      const previousLayoutLeft = Number(element.dataset.layoutLeft);
      let icon = element.querySelector(".item-icon");
      if (!icon) {
        icon = document.createElement("canvas");
        icon.className = "item-icon";
        icon.width = 36;
        icon.height = 36;
        element.insertBefore(icon, element.firstChild);
      }
      const iconKey = `${item.type}:${item.quality}:${game.currentSkinId || "default"}`;
      if (icon.dataset.iconKey !== iconKey) {
        game.ART.renderItemIcon(icon.getContext("2d"), item.type, item.quality, game.currentSkinId || "default");
        icon.dataset.iconKey = iconKey;
      }
      element.style.setProperty("--quality-color", game.ART.qualityColor[item.quality]);
      element.style.gridColumn = String(index + 1);
      const layoutLeft = element.offsetLeft;
      if (Number.isFinite(previousLayoutLeft) && Math.abs(previousLayoutLeft - layoutLeft) > 1
        && typeof element.animate === "function") {
        const previousAnimation = slotShiftAnimations.get(element);
        if (previousAnimation && previousAnimation.playState !== "finished") previousAnimation.cancel();
        const animation = element.animate([
          { translate: `${previousLayoutLeft - layoutLeft}px 0px` },
          { translate: "0px 0px" }
        ], { duration: 220, easing: "cubic-bezier(.2,.75,.25,1)" });
        slotShiftAnimations.set(element, animation);
      }
      element.dataset.layoutLeft = String(layoutLeft);
      element.classList.toggle("is-selected", state.uiState.selectedItemId === item.id);
      element.querySelector(".item-name").textContent = definition.name;
      element.querySelector(".item-quality").textContent = `${item.quality} · ${quality.strength.toFixed(1)}×`;
      element.querySelector(".item-cost").textContent = `${Math.ceil(item.currentCost)} 能量`;
      const cannotUse = state.globalItemCooldownRemaining > 0
        || game.Game.isPaused(state)
        || hasEffectForSide(state, "禁道具", 0)
        || state.players[0].energy < item.currentCost
        || (item.rare && state.rareItemsUsed >= config.INVENTORY.rareUseLimit);
      element.setAttribute("aria-label", `${definition.name}，${item.quality}品质，消耗${Math.ceil(item.currentCost)}能量`);
      element.setAttribute("aria-pressed", String(state.uiState.selectedItemId === item.id));
      element.style.opacity = cannotUse ? ".65" : "1";

    });

    const overflowCount = inventory.overflow.length;
    document.getElementById("inventoryCount").textContent = overflowCount > 0
      ? `${inventory.items.length} / ${inventory.displayLimit} · 溢出 ${overflowCount}`
      : `${inventory.items.length} / ${inventory.displayLimit}`;
  }

  function isOverBomb(state, col, row) {
    const cell = state.uiState.hoverCell;
    return Boolean(cell && Math.abs(cell.x - col) <= 1 && Math.abs(cell.y - row) <= 1);
  }

  game.Inventory = {
    addItem: addItem,
    dropForTier: dropForTier,
    createStartingLoot: function (state) {
      dropForTier(state, 1, 0);
      dropForTier(state, 1, 1);
    },
    useItem: useItem,
    clearAll: clearAll,
    addEffect: addEffect,
    hasEffectForSide: hasEffectForSide,
    stealRandom: stealRandom,
    tick: tick,
    render: renderInventory,
    getInventory: getInventory,
    getQualityStats: getQualityStats,
    costForItem: costForItem,
    durationForItem: durationForItem,
    quantityForItem: quantityForItem,
    rangeForItem: rangeForItem,
    isCellProtected: isCellProtected,
    isCellLocked: isCellLocked,
    isStoneDisabled: isStoneDisabled,
    clearCellEffects: clearCellEffects,
    isOverBomb: isOverBomb
  };
})(window);
