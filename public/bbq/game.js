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
  { id: 'pepper',   emoji: '🌶️', name: '烤辣椒', unlock: 1  },
  { id: 'corn',     emoji: '🌽', name: '烤玉米', unlock: 1  },
  { id: 'meat',     emoji: '🍖', name: '烤肉串', unlock: 1  },
  { id: 'shrimp',   emoji: '🦐', name: '烤大虾', unlock: 3  },
  { id: 'chicken',  emoji: '🍗', name: '烤鸡腿', unlock: 5  },
  { id: 'mushroom', emoji: '🍄', name: '烤香菇', unlock: 8  },
  { id: 'squid',    emoji: '🦑', name: '烤鱿鱼', unlock: 12 },
  { id: 'yam',      emoji: '🍠', name: '烤红薯', unlock: 16 },
  { id: 'broccoli', emoji: '🥦', name: '西兰花', unlock: 20 },
  { id: 'onion',    emoji: '🧅', name: '烤洋葱', unlock: 25 },
  { id: 'eggplant', emoji: '🍆', name: '烤茄子', unlock: 30 },
  { id: 'fish',     emoji: '🐟', name: '烤鱼',   unlock: 35 },
];

const GRILL_COUNT  = 12;
const PAN_CAPACITY = 3;
const SAVE_KEY     = 'bbq_crazy_v3';
const TOOL_INIT    = { undo: 3, shuffle: 1, remove: 1, addtime: 1 };
const COMBO_TEXTS  = ['', '', 'Nice! 🔥', 'Great! 🔥🔥', 'Awesome! ⚡', 'COMBO! 🌟', 'MASTER! 👑'];

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

// ==================== 关卡配置 ====================

function getLevelCfg(lv) {
  if (lv <= 3)  return { numTypes: 3,  itemsPerDish: 3,  time: 300, spicyRatio: 0,    orderInterval: 60, orderTime: 50, maxOrders: 1 };
  if (lv <= 6)  return { numTypes: 4,  itemsPerDish: 4,  time: 280, spicyRatio: 0.3,  orderInterval: 55, orderTime: 45, maxOrders: 1 };
  if (lv <= 10) return { numTypes: 5,  itemsPerDish: 4,  time: 260, spicyRatio: 0.4,  orderInterval: 50, orderTime: 40, maxOrders: 1 };
  if (lv <= 15) return { numTypes: 5,  itemsPerDish: 5,  time: 240, spicyRatio: 0.4,  orderInterval: 45, orderTime: 38, maxOrders: 1 };
  if (lv <= 20) return { numTypes: 6,  itemsPerDish: 5,  time: 220, spicyRatio: 0.4,  orderInterval: 40, orderTime: 35, maxOrders: 1 };
  if (lv <= 25) return { numTypes: 7,  itemsPerDish: 6,  time: 210, spicyRatio: 0.45, orderInterval: 35, orderTime: 32, maxOrders: 2 };
  if (lv <= 30) return { numTypes: 8,  itemsPerDish: 6,  time: 200, spicyRatio: 0.45, orderInterval: 30, orderTime: 28, maxOrders: 2 };
  if (lv <= 40) return { numTypes: 9,  itemsPerDish: 7,  time: 190, spicyRatio: 0.5,  orderInterval: 25, orderTime: 25, maxOrders: 2 };
  return {
    numTypes: Math.min(12, 10 + Math.floor((lv - 40) / 3)),
    itemsPerDish: 8,
    time: Math.max(150, 190 - (lv - 40) * 2),
    spicyRatio: 0.5,
    orderInterval: 20,
    orderTime: 22,
    maxOrders: 2,
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

  const pool = INGREDIENTS.filter(ing => ing.unlock <= levelNum);
  const numTypes = Math.min(cfg.numTypes, pool.length);
  const chosen = shuffle(pool).slice(0, numTypes);

  // ---- 计算总食材数（必须是3的整倍数） ----
  // 每个烤盘初始放2个食材，留1个空位供拖拽
  const itemsPerPan    = 2;
  const initialPanCount = GRILL_COUNT * itemsPerPan; // 24
  const totalDishCount  = GRILL_COUNT * cfg.itemsPerDish;
  const rawTotal = initialPanCount + totalDishCount;

  // 每种类型数量取3的倍数，确保总数是3的整倍数
  const perType     = ceil3(Math.ceil(rawTotal / numTypes));
  const actualTotal = perType * numTypes;

  // 生成所有食材
  const allItems = [];
  chosen.forEach(ing => {
    for (let i = 0; i < perType; i++) {
      allItems.push({ uid: nextUid(), typeId: ing.id, emoji: ing.emoji, name: ing.name });
    }
  });

  const bag = shuffle(allItems);

  // 前 initialPanCount 个放到烤盘（每盘2个），剩余进碟子
  const panItems  = bag.slice(0, initialPanCount);
  const dishItems = bag.slice(initialPanCount);

  // 把 dishItems 分配到12个碟子（均匀分配）
  const dishes = Array.from({ length: GRILL_COUNT }, () => []);
  dishItems.forEach((item, idx) => {
    dishes[idx % GRILL_COUNT].push(item);
  });

  // 辣盘分配
  const spicyCount   = Math.round(GRILL_COUNT * cfg.spicyRatio);
  const spicyIndices = new Set(
    shuffle(Array.from({ length: GRILL_COUNT }, (_, i) => i)).slice(0, spicyCount)
  );

  // 构造烤盘：每盘放2个食材 + 1个空位
  const grills = Array.from({ length: GRILL_COUNT }, (_, i) => {
    const a = panItems[i * itemsPerPan];
    const b = panItems[i * itemsPerPan + 1];
    // 随机决定空位位置（左、中、右）
    const emptyPos = Math.floor(Math.random() * 3);
    let pan;
    if (emptyPos === 0)      pan = [null, a, b];
    else if (emptyPos === 1) pan = [a, null, b];
    else                     pan = [a, b, null];

    return {
      id:    i,
      spicy: spicyIndices.has(i),
      pan,
      dish:  dishes[i],
    };
  });

  return { levelNum, grills, totalItems: actualTotal, cfg };
}

// ==================== 存档 ====================

function loadSave() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (d) return { maxLevel: 1, levelStars: {}, totalScore: 0, ...d };
  } catch (_) {}
  return { maxLevel: 1, levelStars: {}, totalScore: 0 };
}

function writeSave(d) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (_) {}
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
  const availableTypes = new Set();
  G.data.grills.forEach(g => {
    g.dish.forEach(it => availableTypes.add(it.typeId));
    g.pan.forEach(it => { if (it) availableTypes.add(it.typeId); });
  });
  const typeArr = Array.from(availableTypes);
  if (typeArr.length < 3) return;

  const chosenTypes = shuffle(typeArr).slice(0, 3);
  const hasSpicy  = G.data.grills.some(g => g.spicy);
  const hasNormal = G.data.grills.some(g => !g.spicy);
  let orderSpicy  = false;
  if (hasSpicy && hasNormal) orderSpicy = Math.random() < 0.5;
  else if (hasSpicy) orderSpicy = true;

  const typeMap = {};
  INGREDIENTS.forEach(ing => { typeMap[ing.id] = ing.emoji; });

  const order = {
    id:       ++G.orderIdCounter,
    spicy:    orderSpicy,
    items:    chosenTypes.map(tid => ({ typeId: tid, emoji: typeMap[tid] || '?', done: false })),
    timerSec: cfg.orderTime,
    handle:   null,
  };
  order.handle = setInterval(() => {
    order.timerSec--;
    renderOrders();
    if (order.timerSec <= 0) {
      clearInterval(order.handle);
      if (!G.over && !G.won) triggerFail('order_timeout');
    }
  }, 1000);
  G.orders.push(order);
  renderOrders();
}

function addTimeToOrders(sec) {
  G.orders.forEach(o => { o.timerSec += sec; });
  renderOrders();
}

function checkOrderProgress(typeId, spicy) {
  G.orders.forEach(o => {
    if (o.spicy !== spicy) return;
    const item = o.items.find(it => it.typeId === typeId && !it.done);
    if (!item) return;
    item.done = true;
    if (o.items.every(it => it.done)) {
      clearInterval(o.handle);
      G.score += 500;
      o.completed = true;
      renderOrders();
      showOrderDoneTip();
      setTimeout(() => {
        G.orders = G.orders.filter(oo => oo.id !== o.id);
        renderOrders();
      }, 1200);
    } else {
      renderOrders();
    }
  });
}

function renderOrders() {
  const area = document.getElementById('orders-area');
  if (!area) return;
  area.innerHTML = '';
  G.orders.forEach(o => {
    const card = document.createElement('div');
    card.className = 'order-card' +
      (o.completed ? ' completed-order' : '') +
      (!o.completed && o.timerSec <= 10 ? ' urgent-order' : '');
    const flavorText = o.spicy ? '🌶️辣味' : '原味';
    const timerClass = o.timerSec <= 10 ? 'order-timer low' : 'order-timer';
    card.innerHTML = `
      <span class="order-icon">🛵</span>
      <div class="order-info">
        <div class="order-flavor">${flavorText}订单</div>
        <div class="order-items">${o.items.map(it =>
          `<span class="order-item${it.done ? ' done' : ''}">${it.emoji}</span>`
        ).join('')}</div>
      </div>
      <div class="${timerClass}">${o.completed ? '✓' : o.timerSec + 's'}</div>`;
    area.appendChild(card);
  });
}

// ==================== 渲染 ====================

function renderAll() {
  renderGrid();
  renderProgress();
  renderTools();
}

function renderGrid() {
  const grid = document.getElementById('grill-grid');
  if (!grid) return;
  grid.innerHTML = '';
  G.data.grills.forEach(g => {
    grid.appendChild(buildGrillUnit(g));
  });
}

function buildGrillUnit(g) {
  const unit = document.createElement('div');
  unit.className = 'grill-unit';
  unit.dataset.grillId = g.id;

  // 烤盘
  const pan = document.createElement('div');
  pan.className = 'grill-pan' + (g.spicy ? ' spicy' : '');
  pan.dataset.grillId = g.id;
  if (G.removeMode) pan.classList.add('remove-mode');

  // 辣标签
  if (g.spicy) {
    const tag = document.createElement('span');
    tag.className = 'spicy-tag';
    tag.textContent = '辣🌶️';
    pan.appendChild(tag);
  }

  // 槽位容器
  const slotsEl = document.createElement('div');
  slotsEl.className = 'pan-slots';

  g.pan.forEach((item, slotIdx) => {
    const slot = document.createElement('div');
    slot.className = 'pan-slot' + (item ? ' has' : ' empty-slot');
    slot.dataset.grillId = g.id;
    slot.dataset.slotIdx = slotIdx;
    if (item) {
      slot.textContent = item.emoji;
      slot.dataset.typeId = item.typeId;
      slot.dataset.uid = item.uid;
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
    // 显示最顶部的1-2个食材
    const topItems = g.dish.slice(-Math.min(2, count));
    topItems.forEach(it => {
      const span = document.createElement('span');
      span.className = 'dish-emoji';
      span.textContent = it.emoji;
      main.appendChild(span);
    });

    // 数量角标
    const badge = document.createElement('span');
    badge.className = 'dish-count-badge';
    badge.textContent = count;
    main.appendChild(badge);
  } else {
    main.textContent = '—';
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
      if (k === 'remove') el.classList.toggle('active-mode', G.removeMode);
    }
  });
}

// ==================== 拖拽系统 ====================

let dragState = null;
/*
  dragState = {
    grillId:   number,
    slotIdx:   number,
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

function startDrag(grillId, slotIdx, x, y, slotEl) {
  if (G.busy || G.over || G.won || G.removeMode) return;

  const grill = G.data.grills[grillId];
  const item  = grill.pan[slotIdx];
  if (!item) return;

  dragState = { grillId, slotIdx, item, sourceEl: slotEl };

  // 源槽位半透明
  slotEl.classList.add('dragging-source');

  // 显示幽灵
  ghost.textContent = item.emoji;
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

  // 命中测试：找到鼠标/触摸位置下的烤盘
  const targetGrillId = hitTestGrill(x, y);

  if (targetGrillId !== null && targetGrillId !== dragState.grillId) {
    tryMoveTo(dragState.grillId, dragState.slotIdx, targetGrillId);
  } else if (targetGrillId === dragState.grillId) {
    // 放回原位，无操作
  } else {
    // 落空，不操作
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

/**
 * 拖拽移动中：高亮目标烤盘
 */
function onDragMove(x, y) {
  if (!dragState) return;
  moveGhost(x, y);
  clearDragHighlights();

  const targetId = hitTestGrill(x, y);
  if (targetId !== null && targetId !== dragState.grillId) {
    const targetGrill = G.data.grills[targetId];
    const isFull = targetGrill.pan.filter(s => s !== null).length >= PAN_CAPACITY;
    const panEl  = document.querySelector(`.grill-pan[data-grill-id="${targetId}"]`);
    if (panEl) {
      panEl.classList.add(isFull ? 'drag-over-full' : 'drag-over');
    }
  }
}

function clearDragHighlights() {
  document.querySelectorAll('.drag-over, .drag-over-full').forEach(el => {
    el.classList.remove('drag-over', 'drag-over-full');
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

// ==================== 游戏逻辑 ====================

/**
 * 把食材从 fromGrillId[fromSlotIdx] 移到 toGrillId 的第一个空槽
 */
function tryMoveTo(fromGrillId, fromSlotIdx, toGrillId) {
  if (G.busy || G.over || G.won) return;

  const fromGrill = G.data.grills[fromGrillId];
  const toGrill   = G.data.grills[toGrillId];
  const item      = fromGrill.pan[fromSlotIdx];
  if (!item) return;

  // 找到目标烤盘的第一个空槽
  const emptySlot = toGrill.pan.indexOf(null);
  if (emptySlot === -1) {
    // 目标已满，拒绝：抖动提示
    shakeGrill(toGrillId);
    return;
  }

  // 保存撤回快照
  saveSnapshot();

  // 执行移动
  fromGrill.pan[fromSlotIdx] = null;
  toGrill.pan[emptySlot]     = item;

  G.combo = 0; // 移动重置连击（消除会重新计）

  renderAll();

  // 检测消除（先检测目标，再检测来源——来源可能因补充而产生新的消除）
  setTimeout(() => {
    checkAndEliminate(toGrillId, () => {
      checkAndEliminate(fromGrillId, () => {
        checkDeadlock();
      });
    });
  }, 60);
}

/**
 * 检测烤盘是否有3个相同食材，有则消除并补充
 */
function checkAndEliminate(grillId, cb) {
  const grill = G.data.grills[grillId];
  const items = grill.pan.filter(s => s !== null);

  if (items.length === PAN_CAPACITY) {
    const typeId = items[0].typeId;
    if (items.every(it => it.typeId === typeId)) {
      // 消除！
      eliminateGrill(grillId, typeId, grill.spicy, cb);
      return;
    }
  }
  if (cb) cb();
}

/**
 * 执行消除动画 + 逻辑
 */
function eliminateGrill(grillId, typeId, spicy, cb) {
  G.busy = true;

  // 高亮烤盘
  const panEl = document.querySelector(`.grill-pan[data-grill-id="${grillId}"]`);
  if (panEl) panEl.classList.add('glow-match');

  // 槽位弹出动画
  const slotEls = document.querySelectorAll(`.pan-slot[data-grill-id="${grillId}"]`);
  slotEls.forEach(el => {
    if (el.textContent.trim()) el.classList.add('pop');
  });

  setTimeout(() => {
    if (panEl) panEl.classList.remove('glow-match');

    const grill = G.data.grills[grillId];
    grill.pan   = [null, null, null];
    G.cleared  += PAN_CAPACITY;
    G.score    += 100 * (1 + G.combo);
    G.combo++;

    // 检查订单
    checkOrderProgress(typeId, spicy);

    // 显示连击
    if (G.combo >= 2) showComboTip(G.combo, panEl);

    // 从碟子补充食材
    refillFromDish(grillId);

    G.busy = false;

    renderAll();
    renderProgress();

    // 检查通关
    if (checkWin()) {
      triggerWin();
      if (cb) cb();
      return;
    }

    if (cb) cb();
  }, 420);
}

/**
 * 从碟子补充食材到烤盘（最多到3个）
 */
function refillFromDish(grillId) {
  const grill = G.data.grills[grillId];
  for (let i = 0; i < PAN_CAPACITY; i++) {
    if (grill.pan[i] === null && grill.dish.length > 0) {
      grill.pan[i] = grill.dish.pop();
    }
  }
}

/**
 * 补充后再次检测消除（连锁）
 */
function checkAfterRefill(grillId, cb) {
  checkAndEliminate(grillId, cb);
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
    g.dish.forEach(it => {
      typeCounts[it.typeId] = (typeCounts[it.typeId] || 0) + 1;
    });
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
    triggerFail('deadlock');
  }
}

function checkWin() {
  const allDishEmpty = G.data.grills.every(g => g.dish.length === 0);
  const allPanEmpty  = G.data.grills.every(g => g.pan.every(s => s === null));
  return allDishEmpty && allPanEmpty;
}

function shakeGrill(grillId) {
  const panEl = document.querySelector(`.grill-pan[data-grill-id="${grillId}"]`);
  if (!panEl) return;
  panEl.classList.remove('shake');
  void panEl.offsetWidth;
  panEl.classList.add('shake');
  setTimeout(() => panEl.classList.remove('shake'), 350);
}

// ==================== 道具 ====================

function saveSnapshot() {
  const snap = G.data.grills.map(g => ({
    pan:  g.pan.map(it => it ? { ...it } : null),
    dish: g.dish.map(it => ({ ...it })),
  }));
  G.history.push({ snap, cleared: G.cleared, score: G.score });
  if (G.history.length > 5) G.history.shift();
}

const Game = {
  useTool(type) {
    if (G.over || G.won || G.busy) return;
    if (G.tools[type] <= 0) return;

    if (type === 'undo') {
      if (G.history.length === 0) return;
      const { snap, cleared, score } = G.history.pop();
      G.data.grills.forEach((g, i) => {
        g.pan  = snap[i].pan;
        g.dish = snap[i].dish;
      });
      G.cleared = cleared;
      G.score   = score;
      G.combo   = 0;
      G.tools.undo--;
      renderAll();
    }

    else if (type === 'shuffle') {
      saveSnapshot();
      // 收集所有烤盘上的食材，重新随机分配
      const allPanItems = [];
      G.data.grills.forEach(g => {
        g.pan.forEach(it => { if (it) allPanItems.push(it); });
        g.pan = [null, null, null];
      });
      const bag = shuffle(allPanItems);
      let idx = 0;
      G.data.grills.forEach(g => {
        for (let s = 0; s < PAN_CAPACITY && idx < bag.length; s++) {
          g.pan[s] = bag[idx++];
        }
      });
      G.tools.shuffle--;
      G.combo = 0;
      renderAll();
      // 重新检测消除
      setTimeout(() => {
        let chain = 0;
        const checkAll = () => {
          if (chain++ > 20) return;
          let any = false;
          G.data.grills.forEach((g, id) => {
            const items = g.pan.filter(s => s !== null);
            if (items.length === PAN_CAPACITY && items.every(it => it.typeId === items[0].typeId)) {
              any = true;
              eliminateGrill(id, items[0].typeId, g.spicy, checkAll);
            }
          });
        };
        checkAll();
      }, 100);
    }

    else if (type === 'remove') {
      G.removeMode = !G.removeMode;
      renderAll();
    }

    else if (type === 'addtime') {
      G.timerSec  += 60;
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

    stopTimer();
    stopOrderSystem();

    G.timerSec = G.data.cfg.time;
    document.getElementById('lv-label').textContent = `第 ${lv} 关`;

    renderAll();
    renderOrders();
    updateTimerDisplay();

    // 延迟一帧后启动倒计时，让渲染先完成
    requestAnimationFrame(() => {
      startTimer();
      startOrderSystem();
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
  grill.pan   = [null, null, null];
  G.tools.remove--;
  G.removeMode = false;
  renderAll();

  // 从碟子补充
  refillFromDish(grillId);
  renderAll();
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

  const save = loadSave();
  const prevStars = save.levelStars[G.level] || 0;
  if (stars > prevStars) save.levelStars[G.level] = stars;
  if (G.level >= save.maxLevel) save.maxLevel = Math.min(50, G.level + 1);
  save.totalScore = (save.totalScore || 0) + G.score;
  writeSave(save);

  // 庆祝粒子
  spawnConfetti();

  document.getElementById('win-score').textContent = G.score;
  document.getElementById('win-stars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
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
  const emojis = ['🎉', '🎊', '⭐', '✨', '🌟', '🔥'];
  for (let i = 0; i < 18; i++) {
    const el = document.createElement('div');
    el.className = 'conf';
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
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
  const save = loadSave();
  document.getElementById('hall-score').textContent  = save.totalScore || 0;
  document.getElementById('hall-maxlv').textContent  = `第${save.maxLevel}关`;

  const grid = document.getElementById('level-grid');
  grid.innerHTML = '';
  for (let lv = 1; lv <= 50; lv++) {
    const btn = document.createElement('div');
    const stars = save.levelStars[lv] || 0;
    const isCompleted = stars > 0;
    const isUnlocked  = lv <= save.maxLevel;
    btn.className = 'level-btn ' + (isCompleted ? 'completed' : isUnlocked ? 'unlocked' : 'locked');
    btn.innerHTML = `<span class="lv-num">${lv}</span>
      <span class="lv-star">${isCompleted ? '⭐'.repeat(stars) : isUnlocked ? '▶' : '🔒'}</span>`;
    if (isUnlocked) {
      btn.addEventListener('click',     () => Game.startLevel(lv));
      btn.addEventListener('touchend', e => { e.preventDefault(); Game.startLevel(lv); }, { passive: false });
    }
    grid.appendChild(btn);
  }
}

// ==================== 初始化 ====================

function init() {
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

document.addEventListener('DOMContentLoaded', init);
