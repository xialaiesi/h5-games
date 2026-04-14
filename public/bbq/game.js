/**
 * 疯狂烧烤摊 — 核心逻辑 v2
 *
 * 布局：3列 x 4行，共12个烤盘单元
 * 每个单元 = [上方烤盘(3槽)] + [下方食材盘(层叠)]
 *
 * 玩法：
 *   1. 点击食材盘顶部食材 → 飞入上方烤盘空槽
 *   2. 烤盘凑齐3个相同食材 → 自动消除
 *   3. 消除后自动从食材盘补充（连锁检测）
 *   4. 烤盘分辣/不辣，同种食材口味不同
 *   5. 11关后出现外卖订单，超时失败
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
const TOOL_INIT    = { undo: 3, shuffle: 1, remove: 1, addtime: 1 };
const SAVE_KEY     = 'bbq_crazy_v2';
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

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ==================== 关卡配置 ====================

/**
 * 返回关卡配置
 * @param {number} lv
 * @returns {{ numTypes, itemsPerDish, time, spicyRatio, orderInterval, orderTime, maxOrders }}
 */
function getLevelCfg(lv) {
  if (lv <= 3) {
    return { numTypes: 3,  itemsPerDish: 3,  time: 300, spicyRatio: 0,   orderInterval: 0,   orderTime: 0,  maxOrders: 0 };
  }
  if (lv <= 6) {
    return { numTypes: 4,  itemsPerDish: 4,  time: 280, spicyRatio: 0.3, orderInterval: 0,   orderTime: 0,  maxOrders: 0 };
  }
  if (lv <= 10) {
    return { numTypes: 5,  itemsPerDish: 4,  time: 260, spicyRatio: 0.4, orderInterval: 0,   orderTime: 0,  maxOrders: 0 };
  }
  if (lv <= 15) {
    return { numTypes: 5,  itemsPerDish: 5,  time: 240, spicyRatio: 0.4, orderInterval: 60,  orderTime: 45, maxOrders: 1 };
  }
  if (lv <= 20) {
    return { numTypes: 6,  itemsPerDish: 5,  time: 220, spicyRatio: 0.4, orderInterval: 55,  orderTime: 40, maxOrders: 1 };
  }
  if (lv <= 25) {
    return { numTypes: 7,  itemsPerDish: 6,  time: 210, spicyRatio: 0.45,orderInterval: 50,  orderTime: 38, maxOrders: 1 };
  }
  if (lv <= 30) {
    return { numTypes: 8,  itemsPerDish: 6,  time: 200, spicyRatio: 0.45,orderInterval: 45,  orderTime: 35, maxOrders: 2 };
  }
  if (lv <= 40) {
    return { numTypes: 9,  itemsPerDish: 7,  time: 190, spicyRatio: 0.5, orderInterval: 35,  orderTime: 30, maxOrders: 2 };
  }
  return {
    numTypes: Math.min(12, 10 + Math.floor((lv - 40) / 3)),
    itemsPerDish: 8,
    time: Math.max(150, 190 - (lv - 40) * 2),
    spicyRatio: 0.5,
    orderInterval: 30,
    orderTime: 25,
    maxOrders: 2,
  };
}

// ==================== 关卡生成 ====================

/**
 * 数据结构：
 *   grills[i] = {
 *     id:      number (0~11),
 *     spicy:   boolean,          // 是否辣味烤盘
 *     pan:     [item|null, ...], // 烤盘槽位(length=3)
 *     dish:    [item, ...],      // 食材盘(index 0 = 底部，最后 = 顶部可点击)
 *   }
 *
 *   item = { uid, typeId, emoji, name }
 *
 * 通关条件：所有 dish 清空 + 所有 pan 清空
 * 失败条件：所有 pan 都满(3个不同或非匹配食材)，dish 中还有食材
 */
function generateLevel(levelNum) {
  const cfg = getLevelCfg(levelNum);

  // 选食材种类
  const pool = INGREDIENTS.filter(ing => ing.unlock <= levelNum);
  const numTypes = Math.min(cfg.numTypes, pool.length);
  const chosen = shuffle(pool).slice(0, numTypes);

  // 每种食材数量需是3的倍数，且均等
  // 总食材 = GRILL_COUNT * itemsPerDish（分配到12个食材盘）
  const targetTotal = GRILL_COUNT * cfg.itemsPerDish;
  // 每种类型需要至少3个（可被消除）
  const perType = ceil3(Math.ceil(targetTotal / numTypes));
  const actualTotal = perType * numTypes;

  // 生成所有食材
  const allItems = [];
  chosen.forEach(ing => {
    for (let i = 0; i < perType; i++) {
      allItems.push({ uid: nextUid(), typeId: ing.id, emoji: ing.emoji, name: ing.name });
    }
  });

  // 打乱后均匀分配到12个食材盘
  const bag = shuffle(allItems);
  const dishes = Array.from({ length: GRILL_COUNT }, () => []);
  bag.forEach((item, idx) => {
    dishes[idx % GRILL_COUNT].push(item);
  });

  // 辣盘分配：随机选约 spicyRatio 比例的烤盘为辣味
  const spicyCount = Math.round(GRILL_COUNT * cfg.spicyRatio);
  const spicyIndices = new Set(
    shuffle(Array.from({ length: GRILL_COUNT }, (_, i) => i)).slice(0, spicyCount)
  );

  // 构造烤盘数组，烤盘初始为空
  const grills = Array.from({ length: GRILL_COUNT }, (_, i) => ({
    id:    i,
    spicy: spicyIndices.has(i),
    pan:   [null, null, null],
    dish:  dishes[i],
  }));

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
  data:        null,
  score:       0,
  combo:       0,
  tools:       { ...TOOL_INIT },
  // 撤回快照列表
  history:     [],
  cleared:     0,
  busy:        false,
  over:        false,
  won:         false,
  timerSec:    0,
  timerHandle: null,
  removeMode:  false,

  // 外卖订单系统
  orders:          [],      // 当前活跃订单列表
  orderIdCounter:  0,
  orderSpawnTimer: null,    // 订单生成定时器
};

// ==================== 外卖订单 ====================

/**
 * 订单结构：
 *   { id, spicy, items: [{typeId,emoji,done}], timerSec, handle }
 */
function startOrderSystem() {
  const cfg = G.data.cfg;
  if (!cfg.orderInterval || cfg.orderInterval === 0) return;

  // 第一个订单在 orderInterval 秒后出现
  G.orderSpawnTimer = setTimeout(function spawnLoop() {
    if (G.over || G.won) return;
    if (G.orders.length < cfg.maxOrders) {
      spawnOrder();
    }
    G.orderSpawnTimer = setTimeout(spawnLoop, cfg.orderInterval * 1000);
  }, cfg.orderInterval * 1000);
}

function stopOrderSystem() {
  if (G.orderSpawnTimer) {
    clearTimeout(G.orderSpawnTimer);
    G.orderSpawnTimer = null;
  }
  // 停止所有订单倒计时
  G.orders.forEach(o => {
    if (o.handle) clearInterval(o.handle);
  });
  G.orders = [];
}

function spawnOrder() {
  const cfg = G.data.cfg;
  // 从当前食材盘中随机选3种不同的食材类型
  const availableTypes = new Set();
  G.data.grills.forEach(g => {
    g.dish.forEach(it => availableTypes.add(it.typeId));
    g.pan.forEach(it => { if (it) availableTypes.add(it.typeId); });
  });

  const typeArr = Array.from(availableTypes);
  if (typeArr.length < 3) return; // 食材不够就不生成订单

  const chosenTypes = shuffle(typeArr).slice(0, 3);

  // 随机决定辣/不辣
  const hasSpicy  = G.data.grills.some(g => g.spicy);
  const hasNormal = G.data.grills.some(g => !g.spicy);
  let orderSpicy  = false;
  if (hasSpicy && hasNormal) {
    orderSpicy = Math.random() < 0.5;
  } else if (hasSpicy) {
    orderSpicy = true;
  }

  // 找到对应食材的 emoji
  const typeMap = {};
  INGREDIENTS.forEach(ing => { typeMap[ing.id] = ing.emoji; });

  const order = {
    id:       ++G.orderIdCounter,
    spicy:    orderSpicy,
    items:    chosenTypes.map(tid => ({ typeId: tid, emoji: typeMap[tid] || '?', done: false })),
    timerSec: cfg.orderTime,
    handle:   null,
  };

  // 启动订单倒计时
  order.handle = setInterval(() => {
    order.timerSec--;
    renderOrders();
    if (order.timerSec <= 0) {
      clearInterval(order.handle);
      // 订单超时 → 游戏失败
      if (!G.over && !G.won) {
        triggerFail('order_timeout');
      }
    }
  }, 1000);

  G.orders.push(order);
  renderOrders();
}

/** 加时道具：所有当前订单 +15 秒 */
function addTimeToOrders(sec) {
  G.orders.forEach(o => { o.timerSec += sec; });
  renderOrders();
}

/**
 * 检测消除是否完成了某个订单的某项
 * @param {string} typeId  被消除食材的类型
 * @param {boolean} spicy  烤盘是否辣
 */
function checkOrderProgress(typeId, spicy) {
  let orderCompleted = false;

  G.orders.forEach(o => {
    if (o.spicy !== spicy) return; // 口味不匹配
    const item = o.items.find(it => it.typeId === typeId && !it.done);
    if (item) {
      item.done = true;

      // 检查订单是否全部完成
      if (o.items.every(it => it.done)) {
        // 订单完成
        clearInterval(o.handle);
        G.score += 500; // 完成订单奖励
        orderCompleted = true;

        // 短暂标记为完成状态，再移除
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
        <div class="order-items">
          ${o.items.map(it => `<span class="order-item${it.done ? ' done' : ''}">${it.emoji}</span>`).join('')}
        </div>
      </div>
      <div class="${timerClass}">${o.completed ? '✓' : o.timerSec + 's'}</div>
    `;

    area.appendChild(card);
  });
}

function showOrderDoneTip() {
  const area = document.getElementById('orders-area');
  if (!area) return;
  const r = area.getBoundingClientRect();
  const tip = document.createElement('div');
  tip.className   = 'order-done-tip';
  tip.textContent = '订单完成 +500 🎊';
  tip.style.left  = (r.left + r.width / 2 - 60) + 'px';
  tip.style.top   = (r.bottom + 10) + 'px';
  document.body.appendChild(tip);
  setTimeout(() => tip.remove(), 1100);
}

// ==================== 渲染：大厅 ====================

function renderHall() {
  const save = loadSave();
  document.getElementById('hall-score').textContent = (save.totalScore || 0).toLocaleString();
  document.getElementById('hall-maxlv').textContent  = `第${save.maxLevel || 1}关`;

  const grid = document.getElementById('level-grid');
  grid.innerHTML = '';

  const showMax = Math.min((save.maxLevel || 1) + 1, 50);
  for (let lv = 1; lv <= showMax; lv++) {
    const stars = save.levelStars[lv] || 0;
    const avail = lv <= (save.maxLevel || 1);
    const done  = lv <  (save.maxLevel || 1);

    const btn = document.createElement('div');
    btn.className = 'level-btn ' + (avail ? (done ? 'completed' : 'unlocked') : 'locked');
    if (avail) {
      btn.innerHTML = `<span class="lv-num">${lv}</span>
        <span class="lv-star">${'⭐'.repeat(stars)}${'☆'.repeat(Math.max(0, 3 - stars))}</span>`;
      btn.addEventListener('click', () => startLevel(lv));
    } else {
      btn.innerHTML = `<span style="font-size:18px">🔒</span>`;
    }
    grid.appendChild(btn);
  }
}

// ==================== 渲染：游戏页 ====================

function renderGame() {
  document.getElementById('lv-label').textContent = `第 ${G.level} 关`;
  updateToolbar();
  renderGrills();
  updateProgress();
  renderOrders();
}

function updateToolbar() {
  ['undo', 'shuffle', 'remove', 'addtime'].forEach(t => {
    const cnt = document.getElementById(`cnt-${t}`);
    const btn = document.getElementById(`tool-${t}`);
    if (cnt) cnt.textContent = G.tools[t];
    if (btn) {
      btn.classList.toggle('off', G.tools[t] <= 0);
      btn.classList.toggle('active-mode', t === 'remove' && G.removeMode);
    }
  });
}

// ---- 全量渲染12个烤盘单元 ----

function renderGrills() {
  const grid = document.getElementById('grill-grid');
  grid.innerHTML = '';
  G.data.grills.forEach(grill => {
    grid.appendChild(makeGrillUnit(grill));
  });
}

function makeGrillUnit(grill) {
  const unit = document.createElement('div');
  unit.className = 'grill-unit';
  unit.dataset.gid = grill.id;

  // 上方：烤盘
  unit.appendChild(makePanEl(grill));

  // 下方：食材盘
  unit.appendChild(makeDishEl(grill));

  return unit;
}

function makePanEl(grill) {
  const pan = document.createElement('div');
  pan.className = 'grill-pan' + (grill.spicy ? ' spicy' : '');
  pan.dataset.gid = grill.id;

  // 辣标签
  if (grill.spicy) {
    const tag = document.createElement('span');
    tag.className   = 'spicy-tag';
    tag.textContent = '辣';
    pan.appendChild(tag);
  }

  // 满盘
  const full = grill.pan.every(s => s !== null);
  if (full) pan.classList.add('full');

  // 清盘模式
  if (G.removeMode && grill.pan.some(s => s !== null)) {
    pan.classList.add('remove-mode');
    pan.addEventListener('click', e => {
      e.stopPropagation();
      doRemoveGrill(grill.id);
    });
    return pan;
  }

  // 3个槽位
  const slotsRow = document.createElement('div');
  slotsRow.className = 'pan-slots';

  for (let i = 0; i < PAN_CAPACITY; i++) {
    const slot = document.createElement('div');
    slot.className   = 'pan-slot' + (grill.pan[i] ? ' has' : '');
    slot.dataset.gid = grill.id;
    slot.dataset.si  = i;
    if (grill.pan[i]) slot.textContent = grill.pan[i].emoji;
    slotsRow.appendChild(slot);
  }

  pan.appendChild(slotsRow);
  return pan;
}

function makeDishEl(grill) {
  const dish = document.createElement('div');
  dish.className   = 'ingredient-dish' + (grill.dish.length === 0 ? ' empty' : '');
  dish.dataset.gid = grill.id;

  if (grill.dish.length === 0) {
    // 食材盘已空，显示空状态
    const emptyHint = document.createElement('span');
    emptyHint.style.cssText = 'font-size:11px;color:#bbb;';
    emptyHint.textContent   = '空';
    dish.appendChild(emptyHint);
    return dish;
  }

  // 显示最顶部2-3个食材（层叠感），其余只显示数量
  const totalCount = grill.dish.length;
  const topIdx     = totalCount - 1; // 最后一个是顶部可点击
  const showCount  = Math.min(totalCount, 3); // 最多显示3个
  const startIdx   = totalCount - showCount;

  for (let i = startIdx; i < totalCount; i++) {
    const item   = grill.dish[i];
    const isTop  = (i === topIdx);
    const el     = document.createElement('div');
    el.className = 'dish-item ' + (isTop ? 'top' : 'stacked');
    el.dataset.uid  = item.uid;
    el.dataset.gid  = grill.id;
    el.textContent  = item.emoji;
    el.title        = item.name;

    if (isTop) {
      el.addEventListener('click', e => {
        e.stopPropagation();
        clickDishItem(grill.id);
      });
    } else {
      el.addEventListener('click', e => {
        e.stopPropagation();
        // 点击被压住的食材：抖动顶部提示
        const topEl = dish.querySelector('.dish-item.top');
        if (topEl && !topEl.classList.contains('shake')) {
          topEl.classList.add('shake');
          setTimeout(() => topEl.classList.remove('shake'), 350);
        }
      });
    }
    dish.appendChild(el);
  }

  // 数量角标（显示总数）
  if (totalCount > 3) {
    const badge = document.createElement('span');
    badge.className   = 'dish-count';
    badge.textContent = totalCount;
    dish.appendChild(badge);
  }

  return dish;
}

// ---- 局部刷新单个烤盘单元 ----

function refreshGrillUnit(grillId) {
  const grill  = G.data.grills[grillId];
  const grid   = document.getElementById('grill-grid');
  const oldUnit = grid.querySelector(`.grill-unit[data-gid="${grillId}"]`);
  if (!oldUnit) return;
  const newUnit = makeGrillUnit(grill);
  grid.replaceChild(newUnit, oldUnit);
}

// ==================== 进度计数 ====================

function countAllDishItems() {
  return G.data.grills.reduce((sum, g) => sum + g.dish.length, 0);
}

function countAllPanItems() {
  return G.data.grills.reduce((sum, g) => sum + g.pan.filter(Boolean).length, 0);
}

function updateProgress() {
  const total     = G.data.totalItems;
  const remaining = countAllDishItems() + countAllPanItems();
  document.getElementById('prog-text').textContent   = `${G.cleared}/${total}`;
  document.getElementById('prog-remain').textContent = `还剩${remaining}个`;
  document.getElementById('prog-fill').style.width   = (total ? Math.min(100, G.cleared / total * 100) : 0) + '%';
}

// ==================== 核心交互：点击食材盘 ====================

function clickDishItem(grillId) {
  if (G.busy || G.over || G.won || G.removeMode) return;

  const grill = G.data.grills[grillId];
  if (grill.dish.length === 0) return;

  // 检查烤盘是否有空位
  const emptySlot = grill.pan.findIndex(s => s === null);
  if (emptySlot === -1) {
    // 烤盘满了，闪烁烤盘
    flashPan(grillId);
    return;
  }

  G.busy = true;

  // 取出食材盘顶部食材
  const item = grill.dish[grill.dish.length - 1];

  // 保存撤回快照
  G.history.push({
    grillId,
    item:     { ...item },
    panSnap:  grill.pan.map(s => s ? { ...s } : null),
    dishSnap: [...grill.dish],
  });
  // 最多保留5步历史
  if (G.history.length > 5) G.history.shift();

  // 找源 DOM 元素（食材盘顶部食材）
  const srcEl = document.querySelector(
    `.ingredient-dish[data-gid="${grillId}"] .dish-item.top`
  );
  // 找目标槽位 DOM 元素
  const dstEl = document.querySelector(
    `.grill-pan[data-gid="${grillId}"] .pan-slot[data-si="${emptySlot}"]`
  );

  // 飞行动画完成后更新状态
  flyToSlot(srcEl, dstEl, item.emoji, () => {
    // 从食材盘移除顶部食材
    grill.dish.pop();

    // 放入烤盘槽位
    grill.pan[emptySlot] = item;

    refreshGrillUnit(grillId);
    updateProgress();

    // 延迟检测消除
    setTimeout(() => checkElim(grillId), 60);
  });
}

function flashPan(grillId) {
  const panEl = document.querySelector(`.grill-pan[data-gid="${grillId}"]`);
  if (!panEl || panEl._flashing) return;
  panEl._flashing = true;
  const originalBorder = panEl.style.borderColor;
  panEl.style.borderColor = 'rgba(244,67,54,0.9)';
  panEl.style.boxShadow   = '0 0 12px rgba(244,67,54,0.6)';
  setTimeout(() => {
    if (panEl) {
      panEl.style.borderColor = originalBorder;
      panEl.style.boxShadow   = '';
      panEl._flashing = false;
    }
  }, 400);
}

// ==================== 消除检测 ====================

function checkElim(grillId) {
  const grill = G.data.grills[grillId];

  // 统计烤盘内各类型数量
  const cnt = {};
  grill.pan.forEach(item => {
    if (item) cnt[item.typeId] = (cnt[item.typeId] || 0) + 1;
  });

  const hitType = Object.keys(cnt).find(t => cnt[t] >= PAN_CAPACITY);

  if (hitType) {
    // 高亮匹配槽位
    const panEl = document.querySelector(`.grill-pan[data-gid="${grillId}"]`);
    if (panEl) panEl.classList.add('glow-match');

    const slotsEls = panEl ? panEl.querySelectorAll('.pan-slot') : [];
    slotsEls.forEach((el, i) => {
      if (grill.pan[i] && grill.pan[i].typeId === hitType) {
        el.classList.add('glow');
      }
    });

    setTimeout(() => doElim(grillId, hitType), 250);
  } else {
    G.busy = false;
    checkFailCondition();
    if (!G.over) checkWinCondition();
  }
}

function doElim(grillId, typeId) {
  const grill = G.data.grills[grillId];

  const panEl   = document.querySelector(`.grill-pan[data-gid="${grillId}"]`);
  const slotsEls = panEl ? panEl.querySelectorAll('.pan-slot') : [];

  const elimIdxs = [];
  grill.pan.forEach((item, i) => {
    if (item && item.typeId === typeId) elimIdxs.push(i);
  });

  // 弹出动画
  elimIdxs.forEach(i => {
    if (slotsEls[i]) {
      slotsEls[i].classList.remove('glow');
      slotsEls[i].classList.add('pop');
    }
  });

  setTimeout(() => {
    // 清空对应槽位
    elimIdxs.forEach(i => { grill.pan[i] = null; });

    // 计分（连击倍率）
    G.combo++;
    const mult = G.combo >= 6 ? 3.0 : G.combo >= 5 ? 2.5 : G.combo >= 4 ? 2.0 :
                 G.combo >= 3 ? 1.5 : 1.0;
    G.score   += Math.round(300 * mult);
    G.cleared += PAN_CAPACITY;

    if (G.combo >= 2) showComboTip(G.combo);
    if (panEl) panEl.classList.remove('glow-match');

    // 检查外卖订单进度（口味需匹配）
    checkOrderProgress(typeId, grill.spicy);

    // 清除该烤盘的撤回历史
    G.history = G.history.filter(h => h.grillId !== grillId);

    refreshGrillUnit(grillId);
    updateProgress();

    // 自动补充：消除后从食材盘顶部填入烤盘空槽（0.3秒延迟）
    setTimeout(() => autoRefill(grillId), 300);
  }, 440);
}

// ==================== 自动补充 ====================

/**
 * 消除后自动从食材盘补充到烤盘
 * 最多补充到满（3个），补充后再次检测消除（连锁）
 */
function autoRefill(grillId) {
  const grill = G.data.grills[grillId];

  // 找空槽
  let emptySlot = grill.pan.findIndex(s => s === null);
  if (emptySlot === -1 || grill.dish.length === 0) {
    // 无需补充
    G.busy = false;
    checkFailCondition();
    if (!G.over) checkWinCondition();
    return;
  }

  // 从食材盘顶部取出一个补充进去
  const item = grill.dish.pop();
  grill.pan[emptySlot] = item;
  refreshGrillUnit(grillId);
  updateProgress();

  // 继续检查是否还有空槽和食材盘还有食材，可继续补充
  emptySlot = grill.pan.findIndex(s => s === null);
  if (emptySlot !== -1 && grill.dish.length > 0) {
    // 再取一个（填满）
    const item2 = grill.dish.pop();
    grill.pan[emptySlot] = item2;
    refreshGrillUnit(grillId);
    updateProgress();

    emptySlot = grill.pan.findIndex(s => s === null);
    if (emptySlot !== -1 && grill.dish.length > 0) {
      const item3 = grill.dish.pop();
      grill.pan[emptySlot] = item3;
      refreshGrillUnit(grillId);
      updateProgress();
    }
  }

  // 补充后检测是否能再次消除（连锁）
  setTimeout(() => checkElim(grillId), 80);
}

// ==================== 胜负判断 ====================

function checkWinCondition() {
  const dishItems = countAllDishItems();
  const panItems  = countAllPanItems();
  if (dishItems === 0 && panItems === 0) {
    triggerWin();
  }
}

function checkFailCondition() {
  const dishItems = countAllDishItems();
  if (dishItems === 0) return; // 食材盘空，不算失败（等待烤盘消除）

  // 所有烤盘都满且没有可消除的配对
  const allPansFull = G.data.grills.every(g => g.pan.every(s => s !== null));
  if (!allPansFull) return;

  // 检查是否有至少一个烤盘有3个相同食材（还能消除）
  const anyCanElim = G.data.grills.some(g => {
    const cnt = {};
    g.pan.forEach(it => { if (it) cnt[it.typeId] = (cnt[it.typeId] || 0) + 1; });
    return Object.values(cnt).some(v => v >= PAN_CAPACITY);
  });

  if (!anyCanElim) {
    triggerFail('full');
  }
}

function triggerWin() {
  if (G.won || G.over) return;
  G.won  = true;
  G.busy = false;
  stopTimer();
  stopOrderSystem();

  // 剩余时间奖励
  G.score += 500 + G.timerSec * 2;

  const save  = loadSave();
  const lv    = G.level;
  const stars = calcStars(G.score, lv);

  if (lv >= (save.maxLevel || 1)) save.maxLevel = lv + 1;
  if (!save.levelStars[lv] || save.levelStars[lv] < stars) save.levelStars[lv] = stars;
  save.totalScore = (save.totalScore || 0) + G.score;
  writeSave(save);

  document.getElementById('win-score').textContent = G.score.toLocaleString();
  document.getElementById('win-stars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
  showOv('ov-win');
  spawnConfetti();
}

function triggerFail(reason) {
  if (G.over || G.won) return;
  G.over = true;
  G.busy = false;
  stopTimer();
  stopOrderSystem();

  const titleEl = document.getElementById('fail-title');
  const subEl   = document.getElementById('fail-sub');

  const msgs = {
    timeout:       ['时间到了！',           '手速再快一点就能过关~'],
    order_timeout: ['外卖员等太久走了！',   '要抓紧处理订单哦~'],
    full:          ['烤盘全满了！',          '别灰心，换个思路再试试'],
  };
  const [title, sub] = msgs[reason] || msgs.full;
  if (titleEl) titleEl.textContent = title;
  if (subEl)   subEl.textContent   = sub;

  setTimeout(() => showOv('ov-fail'), 300);
}

function calcStars(score, lv) {
  const b = lv * 400;
  if (score >= b * 2.5) return 3;
  if (score >= b * 1.2) return 2;
  return 1;
}

// ==================== 倒计时 ====================

function startTimer(totalSec) {
  G.timerSec = totalSec;
  stopTimer();
  renderTimer();
  G.timerHandle = setInterval(() => {
    G.timerSec--;
    renderTimer();
    if (G.timerSec <= 0) {
      stopTimer();
      if (!G.won && !G.over) triggerFail('timeout');
    }
  }, 1000);
}

function stopTimer() {
  if (G.timerHandle) {
    clearInterval(G.timerHandle);
    G.timerHandle = null;
  }
}

function renderTimer() {
  const el  = document.getElementById('timer-val');
  const box = document.getElementById('timer-box');
  if (!el) return;
  const s  = Math.max(0, G.timerSec);
  const mm = String(Math.floor(s / 60)).padStart(1, '0');
  const ss = String(s % 60).padStart(2, '0');
  el.textContent = `${mm}:${ss}`;
  if (box) box.classList.toggle('urgent', s <= 30);
}

// ==================== 飞行动画 ====================

function flyToSlot(srcEl, dstEl, emoji, onDone) {
  if (!srcEl || !dstEl) { G.busy = false; onDone(); return; }

  const src = srcEl.getBoundingClientRect();
  const dst = dstEl.getBoundingClientRect();

  srcEl.style.visibility = 'hidden';

  const fly = document.createElement('div');
  fly.className   = 'item-fly';
  fly.textContent = emoji;
  fly.style.cssText = `left:${src.left}px;top:${src.top}px`;
  document.body.appendChild(fly);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    fly.style.left      = dst.left + 'px';
    fly.style.top       = dst.top  + 'px';
    fly.style.transform = 'scale(1.15)';
  }));

  setTimeout(() => {
    fly.remove();
    onDone();
  }, 300);
}

// ==================== 连击提示 ====================

function showComboTip(combo) {
  const text = COMBO_TEXTS[Math.min(combo, COMBO_TEXTS.length - 1)];
  if (!text) return;
  const r   = document.getElementById('grill-grid').getBoundingClientRect();
  const tip = document.createElement('div');
  tip.className   = 'combo-tip';
  tip.textContent = text;
  tip.style.left  = (r.left + r.width / 2 - 50) + 'px';
  tip.style.top   = (r.top  + r.height / 3) + 'px';
  document.body.appendChild(tip);
  setTimeout(() => tip.remove(), 950);
}

// ==================== 道具 ====================

const Game = {
  useTool(name) {
    if (G.over || G.won || G.busy) return;
    if (G.tools[name] <= 0) return;
    ({ undo: doUndo, shuffle: doShuffleDishes, remove: activateRemove, addtime: doAddTime })[name]?.();
  },
};

// ---- 撤回 ----
function doUndo() {
  if (G.history.length === 0) return;
  const snap = G.history.pop();
  G.tools.undo--;
  G.combo = 0;

  const grill   = G.data.grills[snap.grillId];
  grill.pan     = snap.panSnap.map(s => s ? { ...s } : null);
  grill.dish    = snap.dishSnap.map(s => ({ ...s }));

  // 如果这次放入导致了消除（cleared增加），需要撤回 cleared
  // 简单处理：清除后 cleared 计数不完整撤回，仅还原状态
  refreshGrillUnit(snap.grillId);
  updateProgress();
  updateToolbar();
}

// ---- 洗牌（打乱所有食材盘内食材） ----
function doShuffleDishes() {
  G.tools.shuffle--;
  G.combo = 0;

  // 收集所有食材盘中的食材
  const allDishItems = [];
  G.data.grills.forEach(g => {
    g.dish.forEach(it => allDishItems.push(it));
  });

  // 打乱类型信息（保留 uid 位置）
  const shuffledTypes = shuffle(allDishItems.map(it => ({
    typeId: it.typeId, emoji: it.emoji, name: it.name,
  })));

  let idx = 0;
  G.data.grills.forEach(g => {
    g.dish.forEach(it => { Object.assign(it, shuffledTypes[idx++]); });
  });

  G.history = [];
  renderGrills();
  updateToolbar();
}

// ---- 清盘道具：激活模式，等待点击烤盘 ----
function activateRemove() {
  G.removeMode = !G.removeMode;
  renderGrills();
  updateToolbar();
}

function doRemoveGrill(grillId) {
  if (!G.removeMode) return;
  const grill = G.data.grills[grillId];
  if (grill.pan.every(s => s === null)) return; // 空烤盘，不消耗

  G.tools.remove--;
  G.combo      = 0;
  G.removeMode = false;
  grill.pan    = [null, null, null];
  G.history    = [];

  renderGrills();
  updateProgress();
  updateToolbar();
}

// ---- 加时道具：主计时器 +60 秒，订单计时 +15 秒 ----
function doAddTime() {
  G.tools.addtime--;
  G.timerSec += 60;
  renderTimer();
  addTimeToOrders(15);
  updateToolbar();
}

// ==================== 弹窗 ====================

function showOv(id) { document.getElementById(id).classList.add('show'); }
function hideOv(id) { document.getElementById(id).classList.remove('show'); }

// ==================== 庆祝粒子 ====================

function spawnConfetti() {
  const pool = ['🎊', '⭐', '🔥', '✨', '🌟', '🎉', '🥳', '💫'];
  for (let i = 0; i < 20; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className   = 'conf';
      el.textContent = pool[(Math.random() * pool.length) | 0];
      el.style.cssText = `
        left: ${Math.random() * 100}vw;
        top: -30px;
        font-size: ${14 + ((Math.random() * 14) | 0)}px;
        animation-duration: ${1.3 + Math.random() * 2.2}s;
      `;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }, i * 90);
  }
}

// ==================== 页面切换 ====================

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ==================== 开启关卡 ====================

function startLevel(lv) {
  stopTimer();
  stopOrderSystem();

  G.level      = lv;
  G.data       = generateLevel(lv);
  G.score      = 0;
  G.combo      = 0;
  G.tools      = { ...TOOL_INIT };
  G.history    = [];
  G.cleared    = 0;
  G.busy       = false;
  G.over       = false;
  G.won        = false;
  G.removeMode = false;

  hideOv('ov-win');
  hideOv('ov-fail');
  showPage('page-game');
  renderGame();
  startTimer(G.data.cfg.time);

  // 11关后启动外卖订单系统
  if (lv >= 11) {
    startOrderSystem();
  }
}

// ==================== 事件绑定 ====================

function bindEvents() {
  document.getElementById('btn-back').addEventListener('click', () => {
    stopTimer();
    stopOrderSystem();
    G.removeMode = false;
    showPage('page-hall');
    renderHall();
  });

  document.getElementById('btn-next').addEventListener('click', () => {
    hideOv('ov-win');
    startLevel(Math.min(G.level + 1, 50));
  });

  document.getElementById('btn-win-retry').addEventListener('click', () => {
    hideOv('ov-win');
    startLevel(G.level);
  });

  document.getElementById('btn-win-hall').addEventListener('click', () => {
    hideOv('ov-win');
    showPage('page-hall');
    renderHall();
  });

  document.getElementById('btn-fail-retry').addEventListener('click', () => {
    hideOv('ov-fail');
    startLevel(G.level);
  });

  document.getElementById('btn-fail-hall').addEventListener('click', () => {
    hideOv('ov-fail');
    showPage('page-hall');
    renderHall();
  });

  // 点击网格空白处退出清盘模式
  document.getElementById('grill-grid').addEventListener('click', () => {
    if (G.removeMode) {
      G.removeMode = false;
      renderGrills();
      updateToolbar();
    }
  });
}

// ==================== 启动 ====================

document.addEventListener('DOMContentLoaded', () => {
  const save = loadSave();
  if (!save.maxLevel) { save.maxLevel = 1; writeSave(save); }

  bindEvents();
  renderHall();
  showPage('page-hall');
});
