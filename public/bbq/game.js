/**
 * 疯狂烧烤摊 — 核心逻辑 v4
 *
 * 玩法：拖拽烤盘上的食材到另一个烤盘
 *   1. 游戏开始：碟子食材自动填满所有烤盘（每个3个）
 *   2. 玩家拖拽烤盘槽位上的食材 → 移到另一个烤盘
 *   3. 目标烤盘已满(3个) → 拒绝，食材回原位
 *   4. 凑齐3个相同 → 自动消除，从碟子补充食材
 *   5. 所有食材消完 → 通关
 */

'use strict';

// ==================== 食材表 ====================

const INGREDIENTS = [
  { id: 'pepper',   emoji: '🌶️', name: '烤辣椒', unlock: 1,  asset: 'assets/ingredients/pepper.svg'   },
  { id: 'corn',     emoji: '🌽', name: '烤玉米', unlock: 1,  asset: 'assets/ingredients/corn.svg'     },
  { id: 'meat',     emoji: '🍖', name: '烤肉串', unlock: 1,  asset: 'assets/ingredients/meat.svg'     },
  { id: 'shrimp',   emoji: '🦐', name: '烤大虾', unlock: 3,  asset: 'assets/ingredients/shrimp.svg'   },
  { id: 'chicken',  emoji: '🍗', name: '烤鸡腿', unlock: 5,  asset: 'assets/ingredients/chicken.svg'  },
  { id: 'mushroom', emoji: '🍄', name: '烤香菇', unlock: 8,  asset: 'assets/ingredients/mushroom.svg' },
  { id: 'squid',    emoji: '🦑', name: '烤鱿鱼', unlock: 12, asset: 'assets/ingredients/squid.svg'    },
  { id: 'yam',      emoji: '🍠', name: '烤红薯', unlock: 16, asset: 'assets/ingredients/yam.svg'      },
  { id: 'broccoli', emoji: '🥦', name: '西兰花', unlock: 20, asset: 'assets/ingredients/broccoli.svg' },
  { id: 'onion',    emoji: '🧅', name: '烤洋葱', unlock: 25, asset: 'assets/ingredients/onion.svg'    },
  { id: 'eggplant', emoji: '🍆', name: '烤茄子', unlock: 30, asset: 'assets/ingredients/eggplant.svg' },
  { id: 'fish',     emoji: '🐟', name: '烤鱼',   unlock: 35, asset: 'assets/ingredients/fish.svg'     },
];

const BOARD_CELL_COUNT = 12;
const BOARD_COLS = 3;
const GRILL_COUNT  = BOARD_CELL_COUNT;
const PAN_CAPACITY = 3;
const TOOL_INIT    = { undo: 3, shuffle: 1, remove: 1, addtime: 1 };
const COMBO_TEXTS  = ['', '', 'Nice!', 'Great!', 'Awesome!', 'Combo!', 'Master!'];
const ORDER_UNLOCK_LEVEL = 12;
const RAIL_UNLOCK_LEVEL = 6;
const PREP_RACK_UNLOCK_LEVEL = 12;
const TOOL_LABELS = {
  undo: '撤回',
  shuffle: '洗牌',
  remove: '清盘',
  addtime: '加时',
};
const INGREDIENT_MAP = Object.fromEntries(INGREDIENTS.map(ingredient => [ingredient.id, ingredient]));

// ==================== 工具函数 ====================

let _uid = 0;
const nextUid = () => ++_uid;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ceil3 = n => Math.ceil(n / 3) * 3;

function cloneItem(item) {
  return item ? { ...item } : null;
}

function pickRailEmptyCells(levelNum, count) {
  const railPool = [10, 7, 4, 1, 9, 6];
  return Array.from({ length: count }, (_, idx) => railPool[(levelNum + idx) % railPool.length]);
}

function getGrill(grillId) {
  return G.data && G.data.grills ? G.data.grills[grillId] || null : null;
}

function isRailLevel() {
  return !!(G.data && G.data.cfg && G.data.cfg.railEnabled);
}

function isPrepRackEnabled() {
  return !!(G.data && G.data.cfg && G.data.cfg.prepRackSize > 0);
}

function getCellRow(cellIndex) {
  return Math.floor(cellIndex / BOARD_COLS);
}

function getCellCol(cellIndex) {
  return cellIndex % BOARD_COLS;
}

function areCellsAdjacent(a, b) {
  return Math.abs(getCellRow(a) - getCellRow(b)) + Math.abs(getCellCol(a) - getCellCol(b)) === 1;
}

function canTransferBetweenGrills(fromGrillId, toGrillId) {
  if (!isRailLevel()) return true;
  const fromGrill = getGrill(fromGrillId);
  const toGrill = getGrill(toGrillId);
  return !!(fromGrill && toGrill) && areCellsAdjacent(fromGrill.cellIndex, toGrill.cellIndex);
}

function canSlideGrillToCell(grillId, cellIndex) {
  const grill = getGrill(grillId);
  return !!(grill &&
    isRailLevel() &&
    grill.movable &&
    G.data.board[cellIndex] === null &&
    areCellsAdjacent(grill.cellIndex, cellIndex));
}

function rackHasEmptySlot() {
  return Array.isArray(G.prepRack) && G.prepRack.some(slot => slot === null);
}

function getIngredient(typeId) {
  return INGREDIENT_MAP[typeId] || null;
}

function collectPanItems() {
  const items = [];
  G.data.grills.forEach(grill => {
    grill.pan.forEach(item => {
      if (item) items.push(item);
    });
  });
  return items;
}

function countVisiblePanItemsByType() {
  const counts = {};
  collectPanItems().forEach(item => {
    counts[item.typeId] = (counts[item.typeId] || 0) + 1;
  });
  return counts;
}

function hasVisibleOddRemainder() {
  return Object.values(countVisiblePanItemsByType()).some(count => count % PAN_CAPACITY !== 0);
}

function buildTypeBuckets(items) {
  const buckets = new Map();
  shuffle(items).forEach(item => {
    if (!buckets.has(item.typeId)) buckets.set(item.typeId, []);
    buckets.get(item.typeId).push(item);
  });
  return buckets;
}

function flattenBuckets(buckets) {
  const flat = [];
  buckets.forEach(bucket => {
    flat.push(...bucket);
  });
  return flat;
}

function takeAnyItems(buckets, count) {
  const pool = shuffle(flattenBuckets(buckets));
  const picked = pool.slice(0, count);
  const wanted = new Set(picked.map(item => item.uid));
  buckets.forEach((bucket, typeId) => {
    buckets.set(typeId, bucket.filter(item => !wanted.has(item.uid)));
  });
  return picked;
}

function buildSeededPanPairs(allItems, chosen, grillCount) {
  const buckets = buildTypeBuckets(allItems);
  const starterTypes = shuffle(Array.from({ length: grillCount }, (_, idx) => chosen[idx % chosen.length].id));
  const pairs = [];

  starterTypes.forEach(typeId => {
    const bucket = buckets.get(typeId) || [];
    if (bucket.length >= 2) {
      pairs.push([bucket.pop(), bucket.pop()]);
    } else {
      const fallback = takeAnyItems(buckets, 2);
      pairs.push([fallback[0] || null, fallback[1] || null].filter(Boolean));
    }
  });

  const remaining = shuffle(flattenBuckets(buckets));
  return { pairs, remaining };
}

function buildResolvablePanLayouts(items, grillCount) {
  const buckets = buildTypeBuckets(items);
  const layouts = Array.from({ length: grillCount }, () => []);
  let tripleCursor = 0;

  let progressed = true;
  while (progressed) {
    progressed = false;
    Array.from(buckets.keys()).forEach(typeId => {
      const bucket = buckets.get(typeId) || [];
      while (bucket.length >= PAN_CAPACITY && tripleCursor < grillCount) {
        layouts[tripleCursor].push(bucket.pop(), bucket.pop(), bucket.pop());
        tripleCursor++;
        progressed = true;
      }
    });
  }

  const leftovers = shuffle(flattenBuckets(buckets));
  leftovers.forEach(item => {
    const targetIndex = layouts.findIndex(slots => slots.length < PAN_CAPACITY);
    if (targetIndex !== -1) layouts[targetIndex].push(item);
  });

  return layouts.map(slots => {
    while (slots.length < PAN_CAPACITY) slots.push(null);
    return slots;
  });
}

function showSystemTip(text) {
  const tip = document.createElement('div');
  tip.className = 'order-done-tip';
  tip.textContent = text;
  tip.style.left = '50%';
  tip.style.top = '40%';
  tip.style.transform = 'translateX(-50%)';
  document.body.appendChild(tip);
  setTimeout(() => tip.remove(), 1100);
}

function ingredientHTML(item, variant = 'slot') {
  const ingredient = getIngredient(item.typeId) || item;
  const asset = item.asset || ingredient.asset || '';
  const name = item.name || ingredient.name || '';
  if (!asset) {
    return `<span class="ingredient-fallback ingredient-fallback-${variant}">${item.emoji || ingredient.emoji || '?'}</span>`;
  }
  return `<span class="ingredient-icon ingredient-icon-${variant}" data-type-id="${item.typeId}">
    <img src="${asset}" alt="${name}" draggable="false">
  </span>`;
}

function createIngredientNode(item, variant = 'slot') {
  const wrapper = document.createElement('span');
  wrapper.innerHTML = ingredientHTML(item, variant).trim();
  return wrapper.firstElementChild;
}

// ==================== 关卡配置 ====================

function getLevelCfg(lv) {
  let base;
  if (lv <= 5) base = { numTypes: 3, itemsPerDish: 1, time: 360, spicyRatio: 0, orderInterval: 0, orderTime: 0, maxOrders: 0 };
  else if (lv <= 10) base = { numTypes: 4, itemsPerDish: 2, time: 320, spicyRatio: 0.15, orderInterval: 0, orderTime: 0, maxOrders: 0 };
  else if (lv <= 15) base = { numTypes: 5, itemsPerDish: 3, time: 280, spicyRatio: 0.25, orderInterval: 60, orderTime: 50, maxOrders: 1 };
  else if (lv <= 20) base = { numTypes: 6, itemsPerDish: 5, time: 220, spicyRatio: 0.4, orderInterval: 40, orderTime: 35, maxOrders: 1 };
  else if (lv <= 25) base = { numTypes: 7, itemsPerDish: 6, time: 210, spicyRatio: 0.45, orderInterval: 35, orderTime: 32, maxOrders: 2 };
  else if (lv <= 30) base = { numTypes: 8, itemsPerDish: 6, time: 200, spicyRatio: 0.45, orderInterval: 30, orderTime: 28, maxOrders: 2 };
  else if (lv <= 40) base = { numTypes: 9, itemsPerDish: 7, time: 190, spicyRatio: 0.5, orderInterval: 25, orderTime: 25, maxOrders: 2 };
  else {
    base = {
      numTypes: Math.min(12, 10 + Math.floor((lv - 40) / 3)),
      itemsPerDish: 8,
      time: Math.max(150, 190 - (lv - 40) * 2),
      spicyRatio: 0.5,
      orderInterval: 20,
      orderTime: 22,
      maxOrders: 2,
    };
  }

  const railEnabled = lv >= RAIL_UNLOCK_LEVEL;
  const prepRackSize = lv >= PREP_RACK_UNLOCK_LEVEL ? (lv >= 22 ? 4 : 3) : 0;

  return {
    ...base,
    time: base.time + (railEnabled ? 20 : 0) + (prepRackSize > 0 ? 10 : 0),
    railEnabled,
    railEmptyCells: railEnabled ? 1 : 0,
    prepRackSize,
  };
}

// ==================== 关卡生成 ====================

/**
 * 数据结构：
 *   grills[i] = {
 *     id:    number (0~11),
 *     spicy: boolean,
 *     pan:   [item|null, item|null, item|null],  // 烤盘3个槽位
 *     dish:  [item, ...],                         // 碟子中的食材（栈，最后一个是顶部）
 *   }
 *   item = { uid, typeId, emoji, name }
 *
 * 游戏开始时：从碟子取食材填满所有烤盘
 * 消除后：从碟子补充
 */
function generateLevel(levelNum) {
  const cfg = getLevelCfg(levelNum);
  const activeGrillCount = BOARD_CELL_COUNT - cfg.railEmptyCells;

  const pool = INGREDIENTS.filter(ing => ing.unlock <= levelNum);
  const numTypes = Math.min(cfg.numTypes, pool.length);
  const chosen = shuffle(pool).slice(0, numTypes);

  // ---- 碟子模型：每碟3个食材，cfg.itemsPerDish = 碟子数量 ----
  const dishPlates = cfg.itemsPerDish; // 每个烤盘下方的碟子数
  const itemsPerPan = 2; // 烤盘初始放2个食材，留1个空位

  // 总食材 = 烤盘初始(每盘2个) + 碟子(每盘 dishPlates碟 × 3个/碟)
  const initialPanCount = activeGrillCount * itemsPerPan;
  const totalDishItems  = activeGrillCount * dishPlates * PAN_CAPACITY;
  const rawTotal = initialPanCount + totalDishItems;

  // 每种类型数量取3的倍数
  const perType     = ceil3(Math.ceil(rawTotal / numTypes));
  const actualTotal = perType * numTypes;

  // 生成所有食材
  const allItems = [];
  chosen.forEach(ing => {
    for (let i = 0; i < perType; i++) {
      allItems.push({ uid: nextUid(), typeId: ing.id, emoji: ing.emoji, name: ing.name, asset: ing.asset });
    }
  });

  const { pairs: seededPairs, remaining: dishItems } = buildSeededPanPairs(allItems, chosen, activeGrillCount);

  // 把 dishItems 分成碟子（每碟3个食材），均匀分配到12个烤盘
  // dishes[i] = [[item,item,item], [item,item,item], ...] 碟子栈
  const dishes = Array.from({ length: activeGrillCount }, () => []);
  let cursor = 0;
  // 先每个烤盘分配 dishPlates 碟
  for (let gi = 0; gi < activeGrillCount; gi++) {
    for (let d = 0; d < dishPlates && cursor + 3 <= dishItems.length; d++) {
      dishes[gi].push([dishItems[cursor], dishItems[cursor+1], dishItems[cursor+2]]);
      cursor += 3;
    }
  }
  // 剩余食材继续按3个一组分配
  let extraDishIndex = 0;
  while (cursor + 3 <= dishItems.length) {
    dishes[extraDishIndex % activeGrillCount].push([dishItems[cursor], dishItems[cursor+1], dishItems[cursor+2]]);
    cursor += 3;
    extraDishIndex++;
  }

  // 辣盘分配
  const spicyCount   = Math.round(activeGrillCount * cfg.spicyRatio);
  const spicyIndices = new Set(
    shuffle(Array.from({ length: activeGrillCount }, (_, i) => i)).slice(0, spicyCount)
  );

  const emptyCells = cfg.railEmptyCells > 0 ? pickRailEmptyCells(levelNum, cfg.railEmptyCells) : [];
  const filledCells = Array.from({ length: BOARD_CELL_COUNT }, (_, i) => i).filter(i => !emptyCells.includes(i));

  // 构造烤盘：每盘放2个食材 + 1个空位
  const grills = Array.from({ length: activeGrillCount }, (_, i) => {
    const [a, b] = seededPairs[i] || [];
    const emptyPos = Math.floor(Math.random() * 3);
    let pan;
    if (emptyPos === 0)      pan = [null, a, b];
    else if (emptyPos === 1) pan = [a, null, b];
    else                     pan = [a, b, null];

    return {
      id:    i,
      spicy: spicyIndices.has(i),
      pan,
      dish:  dishes[i], // 碟子栈：[[item,item,item], ...]
      cellIndex: filledCells[i],
      movable: cfg.railEnabled,
    };
  });

  const board = Array.from({ length: BOARD_CELL_COUNT }, () => null);
  grills.forEach(grill => {
    board[grill.cellIndex] = grill.id;
  });

  return { levelNum, grills, board, totalItems: actualTotal, cfg };
}

// ==================== 存档 ====================

const SAVE_KEY_PREFIX = 'bbq_crazy_v5';
let saveStateCache = null;

function getSaveKey() {
  const user = typeof Auth !== 'undefined' && Auth.getUser ? Auth.getUser() : null;
  const scope = user && (user.id || user.phone) ? (user.id || user.phone) : 'guest';
  return `${SAVE_KEY_PREFIX}:${scope}`;
}

function normalizeSave(data) {
  const raw = data && typeof data === 'object' ? data : {};
  const rawResources = raw.resources && typeof raw.resources === 'object' ? raw.resources : {};
  return {
    maxLevel: 1,
    levelStars: {},
    totalScore: 0,
    lastPlayed: null,
    resources: {
      coins: 0,
    },
    ...raw,
    levelStars: { ...(raw.levelStars || {}) },
    resources: {
      coins: 0,
      ...rawResources,
    },
  };
}

function readLocalSave() {
  try {
    return normalizeSave(JSON.parse(localStorage.getItem(getSaveKey()) || 'null'));
  } catch (_) {
    return normalizeSave();
  }
}

function writeSave(data) {
  saveStateCache = normalizeSave(data);
  localStorage.setItem(getSaveKey(), JSON.stringify(saveStateCache));
  return saveStateCache;
}

function getSaveSnapshot() {
  if (!saveStateCache) saveStateCache = readLocalSave();
  return saveStateCache;
}

async function loadSave() {
  if (saveStateCache) return saveStateCache;

  const local = readLocalSave();
  saveStateCache = local;

  if (typeof API !== 'undefined' && API.bbq && API.isLoggedIn && API.isLoggedIn()) {
    try {
      const cloud = await API.bbq.getProgress();
      if (cloud) return writeSave(cloud);
    } catch (_) {}
  }

  return local;
}

async function syncToCloud(level, stars, score) {
  if (typeof API !== 'undefined' && API.bbq && API.isLoggedIn && API.isLoggedIn()) {
    try {
      const cloud = await API.bbq.save(level, stars, score);
      if (cloud) return writeSave(cloud);
    } catch (_) {}
  }
  return null;
}

function calcCoinReward(stars) {
  return Math.max(0, stars) * 20;
}

// ==================== 游戏状态 ====================

const G = {
  level:       1,
  data:        null,       // { levelNum, grills, totalItems, cfg }
  score:       0,
  combo:       0,
  tools:       { ...TOOL_INIT },
  history:     [],         // 撤回快照
  cleared:     0,          // 已消除食材数
  busy:        false,
  over:        false,
  won:         false,
  timerSec:    0,
  timerHandle: null,
  removeMode:  false,
  orders:          [],
  orderIdCounter:  0,
  orderSpawnTimer: null,
  selectedRailGrillId: null,
  prepRack: [],
  lastRefilledSlots: [],   // 上次补充的槽位 [{grillId, slotIdx}]
};

// ==================== 外卖订单 ====================

function startOrderSystem() {
  const cfg = G.data.cfg;
  if (!cfg.orderInterval) return;

  G.orderSpawnTimer = setTimeout(function spawnLoop() {
    if (G.over || G.won) return;
    if (G.orders.length < cfg.maxOrders) spawnOrder();
    G.orderSpawnTimer = setTimeout(spawnLoop, cfg.orderInterval * 1000);
  }, cfg.orderInterval * 1000);
}

function stopOrderSystem() {
  if (G.orderSpawnTimer) { clearTimeout(G.orderSpawnTimer); G.orderSpawnTimer = null; }
  G.orders.forEach(o => { if (o.handle) clearInterval(o.handle); });
  G.orders = [];
}

function spawnOrder() {
  const cfg = G.data.cfg;
  if (maybeEnsureCleanupOrder()) return;

  const availableTypes = new Set();
  G.data.grills.forEach(g => {
    // dish 是碟子栈：[[item,item,item], ...]
    g.dish.forEach(plate => plate.forEach(it => availableTypes.add(it.typeId)));
    g.pan.forEach(it => { if (it) availableTypes.add(it.typeId); });
  });
  G.prepRack.forEach(it => { if (it) availableTypes.add(it.typeId); });
  const typeArr = Array.from(availableTypes);
  if (typeArr.length < 1) return;

  // 随机1-3种食材
  const maxOrderCount = isPrepRackEnabled() ? 3 : 2;
  const orderCount = Math.min(typeArr.length, 1 + Math.floor(Math.random() * maxOrderCount));
  const chosenTypes = shuffle(typeArr).slice(0, orderCount);
  const hasSpicy  = G.data.grills.some(g => g.spicy);
  const hasNormal = G.data.grills.some(g => !g.spicy);
  let orderSpicy  = false;
  if (hasSpicy && hasNormal) orderSpicy = Math.random() < 0.5;
  else if (hasSpicy) orderSpicy = true;

  const order = {
    id:       ++G.orderIdCounter,
    spicy:    orderSpicy,
    items:    chosenTypes.map(tid => {
      const ingredient = getIngredient(tid) || {};
      return {
        typeId: tid,
        emoji: ingredient.emoji || '?',
        name: ingredient.name || tid,
        asset: ingredient.asset || '',
        done: false,
      };
    }),
    timerSec: cfg.orderTime,
    handle:   null,
  };
  order.handle = setInterval(() => {
    order.timerSec--;
    // 只更新倒计时数字，不重建整个DOM
    const timerEl = document.getElementById('order-timer-' + order.id);
    if (timerEl) {
      timerEl.textContent = order.timerSec + 's';
      timerEl.classList.toggle('low', order.timerSec <= 10);
    }
    // 低于10秒时给卡片加urgent样式（只加一次）
    if (order.timerSec <= 10) {
      const cardEl = document.getElementById('order-card-' + order.id);
      if (cardEl) cardEl.classList.add('urgent-order');
    }
    if (order.timerSec <= 0) {
      clearInterval(order.handle);
      if (!G.over && !G.won) triggerFail('order_timeout');
    }
  }, 1000);
  G.orders.push(order);
  renderOrders();
  // 新订单生成后立即检查是否已有匹配的烤盘
  setTimeout(() => resolveBoard(), 100);
}

function addTimeToOrders(sec) {
  G.orders.forEach(o => { o.timerSec += sec; });
  renderOrders();
}

function syncOrdersLayout() {
  const area = document.getElementById('orders-area');
  const gameArea = document.getElementById('game-area');
  if (!area || !gameArea) return;

  const shouldShow = G.level >= ORDER_UNLOCK_LEVEL && G.orders.length > 0;
  area.style.display = shouldShow ? 'flex' : 'none';
  const offset = shouldShow ? Math.ceil(area.getBoundingClientRect().height) + 8 : 0;
  gameArea.style.setProperty('--orders-offset', `${offset}px`);
}

function renderOrders() {
  const area = document.getElementById('orders-area');
  if (!area) return;
  area.innerHTML = '';
  G.orders.forEach(o => {
    const card = document.createElement('div');
    card.id = 'order-card-' + o.id;
    card.className = 'order-card' +
      (o.completed ? ' completed-order' : '') +
      (!o.completed && o.timerSec <= 10 ? ' urgent-order' : '');
    const flavorText = o.spicy ? '辣味' : '原味';
    const timerClass = o.timerSec <= 10 ? 'order-timer low' : 'order-timer';
    card.innerHTML = `
      <span class="order-icon">单</span>
      <div class="order-info">
        <div class="order-flavor">${flavorText}订单</div>
        <div class="order-items">${o.items.map(it =>
          `<span class="order-item${it.done ? ' done' : ''}">${ingredientHTML(it, 'order')}</span>`
        ).join('')}</div>
      </div>
      <div id="order-timer-${o.id}" class="${timerClass}">${o.completed ? '✓' : o.timerSec + 's'}</div>`;
    area.appendChild(card);
  });
  syncOrdersLayout();
}

function maybeEnsureCleanupOrder() {
  const cfg = G.data.cfg;
  const remainingItems = Math.max(0, G.data.totalItems - G.cleared);
  const shouldUseCleanupOrder = remainingItems > 0 && (
    remainingItems <= 6 ||
    (remainingItems <= 9 && hasVisibleOddRemainder())
  );

  if (G.level < ORDER_UNLOCK_LEVEL || !cfg.maxOrders || !shouldUseCleanupOrder) return false;

  const rescueCandidates = G.data.grills
    .map(grill => ({ grill, items: grill.pan.filter(Boolean) }))
    .filter(entry => entry.items.length > 0)
    .sort((a, b) => a.items.length - b.items.length || a.grill.dish.length - b.grill.dish.length);

  if (!rescueCandidates.length) return false;

  const target = rescueCandidates[0];
  const signature = `${target.grill.spicy ? 'spicy' : 'normal'}:${target.items.map(item => item.typeId).join(',')}`;
  const currentSignature = G.orders.length === 1
    ? `${G.orders[0].spicy ? 'spicy' : 'normal'}:${G.orders[0].items.map(item => item.typeId).join(',')}`
    : '';

  if (currentSignature === signature) return false;

  const order = {
    id: ++G.orderIdCounter,
    spicy: target.grill.spicy,
    items: target.items.map(item => ({
      typeId: item.typeId,
      emoji: item.emoji,
      name: item.name,
      asset: item.asset,
      done: false,
    })),
    timerSec: Math.max(cfg.orderTime, 45),
    handle: null,
  };

  order.handle = setInterval(() => {
    order.timerSec--;
    const timerEl = document.getElementById('order-timer-' + order.id);
    if (timerEl) {
      timerEl.textContent = order.timerSec + 's';
      timerEl.classList.toggle('low', order.timerSec <= 10);
    }
    if (order.timerSec <= 10) {
      const cardEl = document.getElementById('order-card-' + order.id);
      if (cardEl) cardEl.classList.add('urgent-order');
    }
    if (order.timerSec <= 0) {
      clearInterval(order.handle);
      if (!G.over && !G.won) triggerFail('order_timeout');
    }
  }, 1000);

  G.orders.forEach(existing => {
    if (existing.handle) clearInterval(existing.handle);
  });
  G.orders = [order];
  renderOrders();
  showSystemTip('收尾订单到啦');
  setTimeout(() => resolveBoard(), 100);
  return true;
}

// ==================== 渲染 ====================

function renderAll() {
  renderGrid();
  renderProgress();
  renderTools();
  renderSystems();
  G.lastRefilledSlots = []; // 渲染后清除，避免动画残留
}

function renderGrid() {
  const grid = document.getElementById('grill-grid');
  if (!grid) return;
  grid.innerHTML = '';
  G.data.board.forEach((grillId, cellIndex) => {
    if (grillId === null) {
      grid.appendChild(buildRailCell(cellIndex));
      return;
    }
    const grill = getGrill(grillId);
    grid.appendChild(grill ? buildGrillUnit(grill, cellIndex) : buildRailCell(cellIndex));
  });
}

function buildGrillUnit(g, cellIndex = g.cellIndex) {
  const unit = document.createElement('div');
  unit.className = 'grill-unit';
  unit.dataset.grillId = g.id;
  unit.dataset.cellIndex = cellIndex;

  // 烤盘
  const pan = document.createElement('div');
  pan.className = 'grill-pan' + (g.spicy ? ' spicy' : '');
  pan.dataset.grillId = g.id;
  pan.dataset.cellIndex = cellIndex;
  if (G.removeMode) pan.classList.add('remove-mode');
  if (G.selectedRailGrillId === g.id) pan.classList.add('rail-selected');

  if (isRailLevel() && g.movable) {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'rail-handle';
    handle.textContent = '移';
    handle.disabled = G.busy || G.over || G.won || G.removeMode;
    handle.setAttribute('aria-label', `移动第${g.id + 1}个烤盘`);
    handle.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      toggleRailSelection(g.id);
    });
    handle.addEventListener('touchend', e => {
      e.preventDefault();
      e.stopPropagation();
      toggleRailSelection(g.id);
    }, { passive: false });
    pan.appendChild(handle);
  }

  // 辣标签
  if (g.spicy) {
    const tag = document.createElement('span');
    tag.className = 'spicy-tag';
    tag.textContent = '辣味';
    pan.appendChild(tag);
  }

  // 槽位容器
  const slotsEl = document.createElement('div');
  slotsEl.className = 'pan-slots';

  g.pan.forEach((item, slotIdx) => {
    const slot = document.createElement('div');
    const isRefilled = G.lastRefilledSlots.some(r => r.grillId === g.id && r.slotIdx === slotIdx);
    slot.className = 'pan-slot' + (item ? ' has' : ' empty-slot') + (isRefilled ? ' just-refilled' : '');
    slot.dataset.grillId = g.id;
    slot.dataset.slotIdx = slotIdx;
    if (item) {
      slot.dataset.typeId = item.typeId;
      slot.dataset.uid = item.uid;
      slot.appendChild(createIngredientNode(item, 'slot'));
      // 绑定拖拽事件
      bindSlotDrag(slot, g.id, slotIdx);
    }
    slotsEl.appendChild(slot);
  });

  pan.appendChild(slotsEl);

  // 点击清盘模式
  if (G.removeMode) {
    pan.addEventListener('click', () => activateRemovePan(g.id));
    pan.addEventListener('touchend', e => { e.preventDefault(); activateRemovePan(g.id); }, { passive: false });
  }

  unit.appendChild(pan);

  // 碟子区域
  const dishArea = document.createElement('div');
  dishArea.className = 'dish-area';
  dishArea.appendChild(buildDishStack(g));
  unit.appendChild(dishArea);

  return unit;
}

function buildDishStack(g) {
  const stack = document.createElement('div');
  stack.className = 'dish-stack';

  const count = g.dish.length;

  if (count > 1) {
    const s1 = document.createElement('div');
    s1.className = 'dish-shadow s1';
    stack.appendChild(s1);
  }
  if (count > 2) {
    const s2 = document.createElement('div');
    s2.className = 'dish-shadow s2';
    stack.appendChild(s2);
  }

  const main = document.createElement('div');
  main.className = 'dish-main' + (count === 0 ? ' empty' : '');

  if (count > 0) {
    // 显示最顶部碟子的食材
    const topPlate = g.dish[count - 1];
    topPlate.forEach(it => {
      main.appendChild(createIngredientNode(it, 'dish'));
    });

    // 角标显示碟子数量
    const badge = document.createElement('span');
    badge.className = 'dish-count-badge';
    badge.textContent = count;
    main.appendChild(badge);
  } else {
    main.textContent = '待补';
  }

  stack.appendChild(main);
  return stack;
}

function renderProgress() {
  const total   = G.data.totalItems;
  const cleared = G.cleared;
  const pct     = total > 0 ? Math.round(cleared / total * 100) : 0;
  const remain  = total - cleared;
  document.getElementById('prog-text').textContent    = `${cleared}/${total}`;
  document.getElementById('prog-fill').style.width    = pct + '%';
  document.getElementById('prog-remain').textContent  = `还剩${remain}个`;
}

function renderTools() {
  ['undo', 'shuffle', 'remove', 'addtime'].forEach(k => {
    const cnt = G.tools[k];
    const el  = document.getElementById('tool-' + k);
    const cEl = document.getElementById('cnt-' + k);
    if (cEl) cEl.textContent = cnt;
    if (el) {
      el.classList.toggle('off', cnt <= 0);
      el.disabled = cnt <= 0;
      if (k === 'remove') el.classList.toggle('active-mode', G.removeMode);
      const modeSuffix = k === 'remove' && G.removeMode ? '，已开启' : '';
      el.setAttribute('aria-label', `${TOOL_LABELS[k]}，剩余${cnt}次${modeSuffix}`);
    }
  });
}

function buildRailCell(cellIndex) {
  const cell = document.createElement('button');
  cell.type = 'button';
  cell.className = 'rail-cell';
  cell.dataset.cellIndex = cellIndex;
  cell.disabled = true;

  let text = '空轨';
  if (G.selectedRailGrillId !== null) {
    const canMove = canSlideGrillToCell(G.selectedRailGrillId, cellIndex);
    cell.classList.add(canMove ? 'available' : 'blocked');
    cell.disabled = !canMove;
    text = canMove ? '滑入' : '不相邻';
    if (canMove) {
      cell.addEventListener('click', () => moveSelectedRailGrillTo(cellIndex));
      cell.addEventListener('touchend', e => {
        e.preventDefault();
        moveSelectedRailGrillTo(cellIndex);
      }, { passive: false });
    }
  }

  cell.textContent = text;
  return cell;
}

function toggleRailSelection(grillId) {
  if (!isRailLevel() || G.busy || G.over || G.won || G.removeMode) return;
  G.selectedRailGrillId = G.selectedRailGrillId === grillId ? null : grillId;
  renderAll();
}

function moveSelectedRailGrillTo(cellIndex) {
  if (G.selectedRailGrillId === null || !canSlideGrillToCell(G.selectedRailGrillId, cellIndex)) return;

  const grill = getGrill(G.selectedRailGrillId);
  if (!grill) return;

  saveSnapshot();
  G.data.board[grill.cellIndex] = null;
  G.data.board[cellIndex] = grill.id;
  grill.cellIndex = cellIndex;
  G.selectedRailGrillId = null;
  G.combo = 0;
  renderAll();
}

function renderSystems() {
  const row = document.getElementById('systems-row');
  const railTip = document.getElementById('rail-tip');
  if (!row || !railTip) return;

  const railEnabled = isRailLevel();
  const rackEnabled = isPrepRackEnabled();
  row.classList.toggle('active', railEnabled || rackEnabled);
  railTip.classList.toggle('active', railEnabled);

  if (railEnabled) {
    const selectedGrill = G.selectedRailGrillId !== null ? getGrill(G.selectedRailGrillId) : null;
    railTip.textContent = selectedGrill
      ? `已选中${selectedGrill.spicy ? '辣味' : '原味'}烤盘，点击相邻空轨位滑动。`
      : '滑轨已开启，点烤盘右上角“移”，再点空轨位。';
  } else {
    railTip.textContent = '';
  }

  renderPrepRack();
}

function renderPrepRack() {
  const wrap = document.getElementById('prep-rack-wrap');
  const rack = document.getElementById('prep-rack');
  const countEl = document.getElementById('prep-rack-count');
  if (!wrap || !rack || !countEl) return;

  if (!isPrepRackEnabled()) {
    wrap.classList.remove('enabled');
    rack.innerHTML = '';
    countEl.textContent = '0/0';
    return;
  }

  wrap.classList.add('enabled');
  rack.innerHTML = '';

  G.prepRack.forEach((item, rackIndex) => {
    const slot = document.createElement('div');
    slot.className = 'prep-slot' + (item ? ' filled' : '');
    slot.dataset.rackIndex = rackIndex;
    slot.setAttribute('aria-label', `备菜位 ${rackIndex + 1}`);
    if (item) {
      slot.dataset.typeId = item.typeId;
      slot.dataset.uid = item.uid;
      slot.appendChild(createIngredientNode(item, 'rack'));
      bindRackDrag(slot, rackIndex);
    }
    rack.appendChild(slot);
  });

  const filled = G.prepRack.filter(Boolean).length;
  countEl.textContent = `${filled}/${G.prepRack.length}`;
}

// ==================== 拖拽系统 ====================

let dragState = null;
/*
  dragState = {
    sourceType: 'grill' | 'rack',
    grillId?:   number,
    slotIdx?:   number,
    rackIndex?: number,
    item:      { uid, typeId, emoji, name },
    sourceEl:  HTMLElement,     // 源槽位 DOM
  }
*/

const ghost = document.getElementById('drag-ghost');

function bindSlotDrag(slotEl, grillId, slotIdx) {
  // 鼠标
  slotEl.addEventListener('mousedown', e => {
    e.preventDefault();
    startDrag(grillId, slotIdx, e.clientX, e.clientY, slotEl);
  });
  // 触摸
  slotEl.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    startDrag(grillId, slotIdx, t.clientX, t.clientY, slotEl);
  }, { passive: false });
}

function bindRackDrag(slotEl, rackIndex) {
  slotEl.addEventListener('mousedown', e => {
    e.preventDefault();
    startRackDrag(rackIndex, e.clientX, e.clientY, slotEl);
  });
  slotEl.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    startRackDrag(rackIndex, t.clientX, t.clientY, slotEl);
  }, { passive: false });
}

function startDrag(grillId, slotIdx, x, y, slotEl) {
  if (G.busy || G.over || G.won || G.removeMode) return;

  const grill = getGrill(grillId);
  const item  = grill.pan[slotIdx];
  if (!item) return;

  dragState = { sourceType: 'grill', grillId, slotIdx, item, sourceEl: slotEl };

  // 源槽位半透明
  slotEl.classList.add('dragging-source');

  // 显示幽灵
  ghost.innerHTML = ingredientHTML(item, 'ghost');
  ghost.style.display = 'flex';
  moveGhost(x, y);
}

function startRackDrag(rackIndex, x, y, slotEl) {
  if (G.busy || G.over || G.won || G.removeMode) return;

  const item = G.prepRack[rackIndex];
  if (!item) return;

  dragState = { sourceType: 'rack', rackIndex, item, sourceEl: slotEl };
  slotEl.classList.add('dragging-source');
  ghost.innerHTML = ingredientHTML(item, 'ghost');
  ghost.style.display = 'flex';
  moveGhost(x, y);
}

function moveGhost(x, y) {
  ghost.style.left = x + 'px';
  ghost.style.top  = y + 'px';
}

function endDrag(x, y) {
  if (!dragState) return;

  ghost.style.display = 'none';
  dragState.sourceEl.classList.remove('dragging-source');

  // 清除所有高亮
  clearDragHighlights();

  const targetRackIndex = hitTestPrepRack(x, y);
  const targetGrillId = hitTestGrill(x, y);

  if (targetRackIndex !== null) {
    if (dragState.sourceType === 'grill') {
      tryMoveToPrepRack(dragState.grillId, dragState.slotIdx, targetRackIndex);
    } else if (targetRackIndex !== dragState.rackIndex) {
      tryMoveRackToRack(dragState.rackIndex, targetRackIndex);
    }
  } else if (targetGrillId !== null) {
    if (dragState.sourceType === 'grill') {
      if (targetGrillId !== dragState.grillId) {
        tryMoveTo(dragState.grillId, dragState.slotIdx, targetGrillId);
      }
    } else {
      tryMoveFromRackToGrill(dragState.rackIndex, targetGrillId);
    }
  }

  dragState = null;
}

/**
 * 命中测试：获取坐标所在的烤盘 ID
 */
function hitTestGrill(x, y) {
  // 遍历所有烤盘单元，检测坐标是否在其中
  const units = document.querySelectorAll('.grill-pan');
  for (const el of units) {
    const rect = el.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      const id = parseInt(el.dataset.grillId, 10);
      if (!isNaN(id)) return id;
    }
  }
  return null;
}

function hitTestPrepRack(x, y) {
  const slots = document.querySelectorAll('.prep-slot');
  for (const el of slots) {
    const rect = el.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      const id = parseInt(el.dataset.rackIndex, 10);
      if (!isNaN(id)) return id;
    }
  }
  return null;
}

/**
 * 拖拽移动中：高亮目标烤盘
 */
function onDragMove(x, y) {
  if (!dragState) return;
  moveGhost(x, y);
  clearDragHighlights();

  const targetRackIndex = hitTestPrepRack(x, y);
  if (targetRackIndex !== null) {
    const sameRack = dragState.sourceType === 'rack' && targetRackIndex === dragState.rackIndex;
    if (!sameRack) {
      const rackEl = document.querySelector(`.prep-slot[data-rack-index="${targetRackIndex}"]`);
      if (rackEl) rackEl.classList.add(G.prepRack[targetRackIndex] ? 'drag-over-full' : 'drag-over');
    }
    return;
  }

  const targetId = hitTestGrill(x, y);
  const sameGrill = dragState.sourceType === 'grill' && targetId === dragState.grillId;
  if (targetId !== null && !sameGrill) {
    const targetGrill = getGrill(targetId);
    const isFull = targetGrill.pan.filter(s => s !== null).length >= PAN_CAPACITY;
    const isBlocked = dragState.sourceType === 'grill' && !canTransferBetweenGrills(dragState.grillId, targetId);
    const panEl  = document.querySelector(`.grill-pan[data-grill-id="${targetId}"]`);
    if (panEl) {
      panEl.classList.add(isBlocked ? 'drag-over-blocked' : isFull ? 'drag-over-full' : 'drag-over');
    }
  }
}

function clearDragHighlights() {
  document.querySelectorAll('.drag-over, .drag-over-full, .drag-over-blocked').forEach(el => {
    el.classList.remove('drag-over', 'drag-over-full', 'drag-over-blocked');
  });
}

// 全局鼠标/触摸监听
document.addEventListener('mousemove', e => {
  if (dragState) onDragMove(e.clientX, e.clientY);
});
document.addEventListener('mouseup', e => {
  if (dragState) endDrag(e.clientX, e.clientY);
});
document.addEventListener('touchmove', e => {
  if (dragState) {
    e.preventDefault();
    const t = e.changedTouches[0];
    onDragMove(t.clientX, t.clientY);
  }
}, { passive: false });
document.addEventListener('touchend', e => {
  if (dragState) {
    const t = e.changedTouches[0];
    endDrag(t.clientX, t.clientY);
  }
});
document.addEventListener('touchcancel', () => {
  if (dragState) {
    ghost.style.display = 'none';
    dragState.sourceEl.classList.remove('dragging-source');
    clearDragHighlights();
    dragState = null;
  }
});
window.addEventListener('resize', syncOrdersLayout);

// ==================== 游戏逻辑 ====================

/**
 * 把食材从 fromGrillId[fromSlotIdx] 移到 toGrillId 的第一个空槽
 */
function tryMoveTo(fromGrillId, fromSlotIdx, toGrillId) {
  if (G.busy || G.over || G.won) return;

  const fromGrill = getGrill(fromGrillId);
  const toGrill   = getGrill(toGrillId);
  const item      = fromGrill.pan[fromSlotIdx];
  if (!item) return;
  if (!canTransferBetweenGrills(fromGrillId, toGrillId)) {
    shakeGrill(toGrillId);
    return;
  }

  // 找到目标烤盘的第一个空槽
  const emptySlot = toGrill.pan.indexOf(null);
  if (emptySlot === -1) {
    // 目标已满，拒绝：抖动提示
    shakeGrill(toGrillId);
    return;
  }

  // 保存撤回快照
  saveSnapshot();
  G.selectedRailGrillId = null;

  // 执行移动
  fromGrill.pan[fromSlotIdx] = null;
  toGrill.pan[emptySlot]     = item;

  G.combo = 0; // 移动重置连击（消除会重新计）

  renderAll();

  // 拖拽后：统一处理消除→补充→订单→连锁
  setTimeout(() => resolveBoard(), 60);
}

function tryMoveToPrepRack(fromGrillId, fromSlotIdx, rackIndex) {
  if (G.busy || G.over || G.won || !isPrepRackEnabled()) return;

  const fromGrill = getGrill(fromGrillId);
  const item = fromGrill && fromGrill.pan[fromSlotIdx];
  if (!item) return;

  if (G.prepRack[rackIndex]) {
    shakePrepRack(rackIndex);
    return;
  }

  saveSnapshot();
  G.selectedRailGrillId = null;
  fromGrill.pan[fromSlotIdx] = null;
  G.prepRack[rackIndex] = item;
  G.combo = 0;
  renderAll();
  setTimeout(() => resolveBoard(), 60);
}

function tryMoveFromRackToGrill(rackIndex, toGrillId) {
  if (G.busy || G.over || G.won || !isPrepRackEnabled()) return;

  const item = G.prepRack[rackIndex];
  const toGrill = getGrill(toGrillId);
  if (!item || !toGrill) return;

  const emptySlot = toGrill.pan.indexOf(null);
  if (emptySlot === -1) {
    shakeGrill(toGrillId);
    return;
  }

  saveSnapshot();
  G.selectedRailGrillId = null;
  G.prepRack[rackIndex] = null;
  toGrill.pan[emptySlot] = item;
  G.combo = 0;
  renderAll();
  setTimeout(() => resolveBoard(), 60);
}

function tryMoveRackToRack(fromIndex, toIndex) {
  if (G.busy || G.over || G.won || !isPrepRackEnabled() || fromIndex === toIndex) return;

  if (!G.prepRack[fromIndex]) return;
  if (G.prepRack[toIndex]) {
    shakePrepRack(toIndex);
    return;
  }

  saveSnapshot();
  G.selectedRailGrillId = null;
  G.prepRack[toIndex] = G.prepRack[fromIndex];
  G.prepRack[fromIndex] = null;
  renderAll();
}

// ==================== 统一棋盘稳定化 ====================

/**
 * 统一处理循环：检测消除→补充被消除的烤盘→检查订单
 * 循环执行直到棋盘稳定
 * 注意：只有消除后才补充，拖拽产生的空位不补充
 */
function resolveBoard() {
  if (G.over || G.won) return;

  // 收集本次补充的槽位信息，用于动画
  G.lastRefilledSlots = [];

  // 0. 补充所有完全空的烤盘（拖空或消除后都触发）
  let didRefill = false;
  G.data.grills.forEach(g => {
    if (g.pan.every(s => s === null) && g.dish.length > 0) {
      const filled = refillGrill(g.id);
      filled.forEach(slotIdx => G.lastRefilledSlots.push({ grillId: g.id, slotIdx }));
      didRefill = true;
    }
  });
  if (didRefill) { renderAll(); renderProgress(); }

  // 1. 查找可消除的烤盘（3个相同）
  const elimGrill = findEliminableGrill();
  if (elimGrill !== null) {
    doEliminate(elimGrill, () => {
      // 消除后补充该烤盘，然后继续循环
      const filled = refillGrill(elimGrill);
      filled.forEach(slotIdx => G.lastRefilledSlots.push({ grillId: elimGrill, slotIdx }));
      renderAll();
      renderProgress();
      resolveBoard();
    });
    return;
  }

  // 2. 检查订单匹配
  const orderDone = tryFulfillOrder();
  if (orderDone) {
    setTimeout(() => resolveBoard(), 300);
    return;
  }

  if (maybeEnsureCleanupOrder()) {
    return;
  }

  // 3. 棋盘稳定，检查通关/死局
  if (checkWin()) { triggerWin(); return; }
  checkDeadlock();
}

/** 消除后从碟子栈取出一碟（3个食材）填满烤盘，返回新填充的槽位索引 */
function refillGrill(grillId) {
  const grill = G.data.grills[grillId];
  if (grill.dish.length === 0) return []; // 没有碟子了

  // 取出最顶部的一碟（数组最后一个）
  const plate = grill.dish.pop();
  // 填入烤盘空位
  const filledSlots = [];
  let pi = 0;
  for (let i = 0; i < PAN_CAPACITY && pi < plate.length; i++) {
    if (grill.pan[i] === null) {
      grill.pan[i] = plate[pi++];
      filledSlots.push(i);
    }
  }
  return filledSlots;
}

/** 查找第一个可消除的烤盘（3个相同食材）*/
function findEliminableGrill() {
  for (const grill of G.data.grills) {
    const items = grill.pan.filter(Boolean);
    if (items.length === PAN_CAPACITY && items.every(it => it.typeId === items[0].typeId)) {
      return grill.id;
    }
  }
  return null;
}

/** 执行消除动画 */
function doEliminate(grillId, cb) {
  G.busy = true;
  const panEl = document.querySelector(`.grill-pan[data-grill-id="${grillId}"]`);
  if (panEl) panEl.classList.add('glow-match');

  const slotEls = document.querySelectorAll(`.pan-slot[data-grill-id="${grillId}"]`);
  slotEls.forEach(el => { if (el.textContent.trim()) el.classList.add('pop'); });

  setTimeout(() => {
    if (panEl) panEl.classList.remove('glow-match');
    const grill = G.data.grills[grillId];
    grill.pan = [null, null, null];
    G.cleared += PAN_CAPACITY;
    G.score   += 100 * (1 + G.combo);
    G.combo++;
    if (G.combo >= 2) showComboTip(G.combo, panEl);
    G.busy = false;
    renderAll();
    renderProgress();
    if (cb) cb();
  }, 420);
}

/**
 * 尝试完成一个订单：扫描所有烤盘，看是否有烤盘包含订单所需食材
 * 如果匹配 → 取走食材，标记订单完成
 * 返回 true 表示有订单被完成
 */
function tryFulfillOrder() {
  for (let oi = 0; oi < G.orders.length; oi++) {
    const o = G.orders[oi];
    if (o.completed) continue;
    const needed = o.items.filter(it => !it.done).map(it => it.typeId);
    if (needed.length === 0) continue;

    for (const grill of G.data.grills) {
      if (o.spicy !== grill.spicy) continue;
      const panTypes = grill.pan.filter(Boolean).map(it => it.typeId);
      if (panTypes.length < needed.length) continue;

      // 检查烤盘是否包含订单所需的所有食材
      const available = [...panTypes];
      let allFound = true;
      for (const need of needed) {
        const idx = available.indexOf(need);
        if (idx === -1) { allFound = false; break; }
        available.splice(idx, 1);
      }

      if (allFound) {
        // 从烤盘取走订单食材（外卖小哥取走，没有顺序要求）
        for (const need of needed) {
          const si = grill.pan.findIndex(it => it && it.typeId === need);
          if (si !== -1) { grill.pan[si] = null; G.cleared++; }
        }
        // 不在这里补充食材，让 resolveBoard 的自动补充流程处理
        // 完成订单
        o.items.forEach(it => { it.done = true; });
        clearInterval(o.handle);
        G.score += 500;
        o.completed = true;
        renderAll();
        renderProgress();
        renderOrders();
        showOrderDoneTip();
        const orderId = o.id;
        setTimeout(() => {
          G.orders = G.orders.filter(oo => oo.id !== orderId);
          renderOrders();
        }, 1200);
        return true;
      }
    }
  }
  return false;
}

/**
 * 死局检测：所有烤盘都满且无法通过任意拖拽产生消除
 * 简化版：检测是否有任意两个烤盘有相同食材类型可以汇聚
 */
function checkDeadlock() {
  if (G.busy || G.over || G.won) return;

  const grills = G.data.grills;

  // 是否还有空位
  const hasEmpty = grills.some(g => g.pan.some(s => s === null));
  if (hasEmpty) return; // 有空位就不是死局
  if (isPrepRackEnabled() && rackHasEmptySlot()) return;

  // 所有碟子也都空了
  const allDishEmpty = grills.every(g => g.dish.length === 0);
  const allPanEmpty  = grills.every(g => g.pan.every(s => s === null));
  if (allDishEmpty && allPanEmpty) return; // 通关

  // 没有空位：检查是否有可能凑成3个相同
  // 统计每种食材总数
  const typeCounts = {};
  grills.forEach(g => {
    g.pan.forEach(it => {
      if (it) typeCounts[it.typeId] = (typeCounts[it.typeId] || 0) + 1;
    });
    g.dish.forEach(plate => plate.forEach(it => {
      typeCounts[it.typeId] = (typeCounts[it.typeId] || 0) + 1;
    }));
  });
  G.prepRack.forEach(it => {
    if (it) typeCounts[it.typeId] = (typeCounts[it.typeId] || 0) + 1;
  });

  // 只看烤盘上的：如果某种食材在烤盘上有3个，理论上可以通过移动消除
  // 更精确：检测是否任意两个烤盘可以交换后产生消除
  // 简化：如果全部满了，且没有任何烤盘有2个同类，认为死局
  let canProgress = false;
  for (const g of grills) {
    const panItems = g.pan.filter(s => s !== null);
    const counts = {};
    panItems.forEach(it => { counts[it.typeId] = (counts[it.typeId] || 0) + 1; });
    if (Object.values(counts).some(c => c >= 2)) {
      canProgress = true;
      break;
    }
  }

  if (!canProgress) {
    // 再检查不同烤盘间是否有同类食材
    const panTypeMap = {}; // typeId -> [grillIds]
    grills.forEach(g => {
      const seen = new Set();
      g.pan.filter(s=>s).forEach(it => {
        if (!seen.has(it.typeId)) {
          seen.add(it.typeId);
          if (!panTypeMap[it.typeId]) panTypeMap[it.typeId] = [];
          panTypeMap[it.typeId].push(g.id);
        }
      });
    });
    for (const [tid, gids] of Object.entries(panTypeMap)) {
      if (gids.length >= 3) { canProgress = true; break; }
    }
  }

  if (!canProgress) {
    const allPanItems = collectPanItems();
    if (allPanItems.length >= PAN_CAPACITY) {
      const layouts = buildResolvablePanLayouts(allPanItems, grills.length);
      G.selectedRailGrillId = null;
      G.removeMode = false;
      G.combo = 0;
      grills.forEach((grill, index) => {
        grill.pan = layouts[index].map(cloneItem);
      });
      renderAll();
      showSystemTip('老板帮你重排了一手');
      setTimeout(() => resolveBoard(), 80);
      return;
    }
    triggerFail('deadlock');
  }
}

function checkWin() {
  const allDishEmpty = G.data.grills.every(g => g.dish.length === 0);
  const allPanEmpty  = G.data.grills.every(g => g.pan.every(s => s === null));
  const rackEmpty = G.prepRack.every(slot => slot === null);
  return allDishEmpty && allPanEmpty && rackEmpty;
}

function shakeGrill(grillId) {
  const panEl = document.querySelector(`.grill-pan[data-grill-id="${grillId}"]`);
  if (!panEl) return;
  panEl.classList.remove('shake');
  void panEl.offsetWidth;
  panEl.classList.add('shake');
  setTimeout(() => panEl.classList.remove('shake'), 350);
}

function shakePrepRack(rackIndex) {
  const slotEl = rackIndex === undefined
    ? document.getElementById('prep-rack-wrap')
    : document.querySelector(`.prep-slot[data-rack-index="${rackIndex}"]`);
  if (!slotEl) return;
  slotEl.classList.remove('shake');
  void slotEl.offsetWidth;
  slotEl.classList.add('shake');
  setTimeout(() => slotEl.classList.remove('shake'), 350);
}

// ==================== 道具 ====================

function saveSnapshot() {
  const snap = G.data.grills.map(g => ({
    cellIndex: g.cellIndex,
    pan:  g.pan.map(cloneItem),
    dish: g.dish.map(plate => plate.map(cloneItem)),
  }));
  G.history.push({
    snap,
    board: [...G.data.board],
    prepRack: G.prepRack.map(cloneItem),
    cleared: G.cleared,
    score: G.score,
    combo: G.combo,
  });
  if (G.history.length > 5) G.history.shift();
}

const Game = {
  useTool(type) {
    if (G.over || G.won || G.busy) return;
    if (G.tools[type] <= 0) return;

    if (type === 'undo') {
      if (G.history.length === 0) return;
      const { snap, board, prepRack, cleared, score, combo } = G.history.pop();
      G.data.grills.forEach((g, i) => {
        g.cellIndex = snap[i].cellIndex;
        g.pan  = snap[i].pan;
        g.dish = snap[i].dish;
      });
      G.data.board = board ? [...board] : G.data.board;
      G.prepRack = Array.isArray(prepRack) ? prepRack : [];
      G.cleared = cleared;
      G.score   = score;
      G.combo   = combo || 0;
      G.selectedRailGrillId = null;
      G.removeMode = false;
      G.tools.undo--;
      renderAll();
    }

    else if (type === 'shuffle') {
      saveSnapshot();
      const layouts = buildResolvablePanLayouts(collectPanItems(), G.data.grills.length);
      G.data.grills.forEach((grill, index) => {
        grill.pan = layouts[index].map(cloneItem);
      });
      G.tools.shuffle--;
      G.combo = 0;
      G.selectedRailGrillId = null;
      renderAll();
      showSystemTip('烤盘重新排好了');
      setTimeout(() => resolveBoard(), 80);
    }

    else if (type === 'remove') {
      G.selectedRailGrillId = null;
      G.removeMode = !G.removeMode;
      renderAll();
    }

    else if (type === 'addtime') {
      G.timerSec  += 30;
      G.tools.addtime--;
      addTimeToOrders(15);
      renderTools();
      updateTimerDisplay();
    }
  },

  startLevel(lv) {
    showPage('game');
    G.level   = lv;
    G.data    = generateLevel(lv);
    G.score   = 0;
    G.combo   = 0;
    G.cleared = 0;
    G.tools   = { ...TOOL_INIT };
    G.history = [];
    G.busy    = false;
    G.over    = false;
    G.won     = false;
    G.removeMode = false;
    G.selectedRailGrillId = null;
    G.prepRack = Array.from({ length: G.data.cfg.prepRackSize || 0 }, () => null);
    G.lastRefilledSlots = [];

    stopTimer();
    stopOrderSystem();

    G.timerSec = G.data.cfg.time;
    document.getElementById('lv-label').textContent = `第 ${lv} 关`;

    renderAll();
    renderOrders();
    updateTimerDisplay();

    // 延迟一帧后启动
    requestAnimationFrame(() => {
      startTimer();
      if (lv >= ORDER_UNLOCK_LEVEL) startOrderSystem();
    });
  },
};

// ==================== 清盘模式 ====================

function activateRemovePan(grillId) {
  if (!G.removeMode) return;
  if (G.tools.remove <= 0) return;

  const grill = G.data.grills[grillId];
  const hasItems = grill.pan.some(s => s !== null);
  if (!hasItems) return;

  saveSnapshot();
  G.selectedRailGrillId = null;
  grill.pan   = [null, null, null];
  G.tools.remove--;
  G.removeMode = false;
  renderAll();

  setTimeout(() => resolveBoard(), 60);
}

// ==================== 计时器 ====================

function startTimer() {
  if (G.timerHandle) clearInterval(G.timerHandle);
  G.timerHandle = setInterval(() => {
    G.timerSec--;
    updateTimerDisplay();
    if (G.timerSec <= 0) {
      stopTimer();
      if (!G.over && !G.won) triggerFail('timeout');
    }
  }, 1000);
}

function stopTimer() {
  if (G.timerHandle) { clearInterval(G.timerHandle); G.timerHandle = null; }
}

function updateTimerDisplay() {
  const m   = Math.floor(Math.max(0, G.timerSec) / 60);
  const s   = Math.max(0, G.timerSec) % 60;
  const box = document.getElementById('timer-box');
  const val = document.getElementById('timer-val');
  if (!box || !val) return;
  val.textContent = `${m}:${String(s).padStart(2, '0')}`;
  box.classList.toggle('urgent', G.timerSec <= 30);
}

// ==================== 胜败 ====================

function triggerWin() {
  if (G.won || G.over) return;
  G.won = true;
  stopTimer();
  stopOrderSystem();

  const timeBonus  = Math.floor(G.timerSec * 2);
  G.score         += timeBonus;

  const stars = G.timerSec > G.data.cfg.time * 0.6 ? 3
              : G.timerSec > G.data.cfg.time * 0.3 ? 2 : 1;

  const save = getSaveSnapshot();
  const prevStars = save.levelStars[G.level] || 0;
  const coinReward = calcCoinReward(stars);
  if (stars > prevStars) save.levelStars[G.level] = stars;
  if (G.level >= save.maxLevel) save.maxLevel = Math.min(50, G.level + 1);
  save.totalScore = (save.totalScore || 0) + G.score;
  save.lastPlayed = new Date().toISOString();
  save.resources = {
    ...(save.resources || {}),
    coins: ((save.resources && save.resources.coins) || 0) + coinReward,
  };
  writeSave(save);

  // 异步同步到云端
  void syncToCloud(G.level, stars, G.score);

  // 庆祝粒子
  spawnConfetti();

  document.getElementById('win-score').textContent = G.score;
  document.getElementById('win-coins').textContent = '+' + coinReward;
  document.getElementById('win-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  document.getElementById('btn-next').style.display = G.level < 50 ? 'block' : 'none';
  showOverlay('ov-win');
}

function triggerFail(reason) {
  if (G.over || G.won) return;
  G.over = true;
  stopTimer();
  stopOrderSystem();

  const titles = {
    deadlock:      '烤盘全满了！',
    timeout:       '时间到了！',
    order_timeout: '订单超时了！',
  };
  const subs = {
    deadlock:      '调配食材使同种集中到一个烤盘',
    timeout:       '别灰心，下次更快！',
    order_timeout: '注意订单时限，合理安排节奏',
  };
  document.getElementById('fail-title').textContent = titles[reason] || '游戏结束';
  document.getElementById('fail-sub').textContent   = subs[reason]   || '再试试吧！';
  showOverlay('ov-fail');
}

// ==================== 气泡提示 ====================

function showComboTip(combo, refEl) {
  const text = COMBO_TEXTS[Math.min(combo, COMBO_TEXTS.length - 1)];
  if (!text) return;
  const tip = document.createElement('div');
  tip.className = 'combo-tip';
  tip.textContent = text;
  const rect = refEl ? refEl.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2 };
  tip.style.left = (rect.left + rect.width / 2) + 'px';
  tip.style.top  = rect.top + 'px';
  document.body.appendChild(tip);
  setTimeout(() => tip.remove(), 900);
}

function showOrderDoneTip() {
  const tip = document.createElement('div');
  tip.className = 'order-done-tip';
  tip.textContent = '订单完成！+500';
  tip.style.left  = '50%';
  tip.style.top   = '40%';
  tip.style.transform = 'translateX(-50%)';
  document.body.appendChild(tip);
  setTimeout(() => tip.remove(), 1100);
}

// ==================== 庆祝粒子 ====================

function spawnConfetti() {
  const symbols = ['•', '◆', '✦', '+'];
  const colors = ['#f5b94c', '#ff6856', '#2dd4bf', '#e75a8a'];
  for (let i = 0; i < 18; i++) {
    const el = document.createElement('div');
    el.className = 'conf';
    el.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    el.style.color = colors[Math.floor(Math.random() * colors.length)];
    el.style.left   = Math.random() * 100 + 'vw';
    el.style.top    = '-30px';
    el.style.fontSize = (14 + Math.random() * 12) + 'px';
    const dur = 1.6 + Math.random() * 1.4;
    el.style.animationDuration  = dur + 's';
    el.style.animationDelay     = Math.random() * 0.8 + 's';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), (dur + 1) * 1000);
  }
}

// ==================== 弹窗 ====================

function showOverlay(id) {
  document.querySelectorAll('.overlay').forEach(el => el.classList.remove('show'));
  document.getElementById(id).classList.add('show');
}

function hideOverlay(id) {
  document.getElementById(id).classList.remove('show');
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(el => el.classList.add('hidden'));
  document.getElementById('page-' + name).classList.remove('hidden');
}

// ==================== 关卡大厅 ====================

function renderHall() {
  const save = getSaveSnapshot();
  document.getElementById('hall-score').textContent  = save.totalScore || 0;
  document.getElementById('hall-coins').textContent  = (save.resources && save.resources.coins) || 0;
  document.getElementById('hall-maxlv').textContent  = `第${save.maxLevel}关`;

  const grid = document.getElementById('level-grid');
  grid.innerHTML = '';
  for (let lv = 1; lv <= 50; lv++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const stars = save.levelStars[lv] || 0;
    const isCompleted = stars > 0;
    const isUnlocked  = lv <= save.maxLevel;
    btn.className = 'level-btn ' + (isCompleted ? 'completed' : isUnlocked ? 'unlocked' : 'locked');
    btn.disabled = !isUnlocked;
    btn.setAttribute('aria-label', isUnlocked ? `进入第${lv}关` : `第${lv}关未解锁`);
    btn.innerHTML = `<span class="lv-num">${lv}</span>
      <span class="lv-star">${isCompleted ? '★'.repeat(stars) : isUnlocked ? '开' : '锁'}</span>`;
    if (isUnlocked) {
      btn.addEventListener('click',     () => Game.startLevel(lv));
      btn.addEventListener('touchend', e => { e.preventDefault(); Game.startLevel(lv); }, { passive: false });
    }
    grid.appendChild(btn);
  }
}

// ==================== 初始化 ====================

async function init() {
  if (typeof Auth !== 'undefined' && Auth.requireAuth && !Auth.requireAuth()) return;

  await loadSave();

  // 关卡大厅
  renderHall();

  // 返回按钮
  document.getElementById('btn-back').addEventListener('click', () => {
    stopTimer();
    stopOrderSystem();
    G.over = true;
    showPage('hall');
    renderHall();
  });

  // 通关弹窗
  document.getElementById('btn-next').addEventListener('click', () => {
    hideOverlay('ov-win');
    Game.startLevel(Math.min(50, G.level + 1));
  });
  document.getElementById('btn-win-retry').addEventListener('click', () => {
    hideOverlay('ov-win');
    Game.startLevel(G.level);
  });
  document.getElementById('btn-win-hall').addEventListener('click', () => {
    hideOverlay('ov-win');
    showPage('hall');
    renderHall();
  });

  // 失败弹窗
  document.getElementById('btn-fail-retry').addEventListener('click', () => {
    hideOverlay('ov-fail');
    Game.startLevel(G.level);
  });
  document.getElementById('btn-fail-hall').addEventListener('click', () => {
    hideOverlay('ov-fail');
    showPage('hall');
    renderHall();
  });

  // 防止游戏区域的触摸滚动干扰拖拽
  document.getElementById('game-area').addEventListener('touchmove', e => {
    if (dragState) e.preventDefault();
  }, { passive: false });
}

document.addEventListener('DOMContentLoaded', () => {
  init();
});
