/**
 * 疯狂烧烤摊 (BBQ Crazy Grill) — 游戏核心逻辑
 *
 * 玩法：
 *   - 12个烤盘排成 3列 x 4行 的网格
 *   - 每个烤盘左右两侧各有一个食材托盘
 *   - 食材层叠在托盘上，只能点击最顶部的食材
 *   - 点击食材 → 飞入对应烤盘（最多3个槽位）
 *   - 同一烤盘凑齐3个相同食材 → 自动消除，清空该烤盘
 *   - 消除所有食材 → 通关；所有烤盘满且托盘还有食材 → 失败
 */

'use strict';

// ==================== 常量配置 ====================

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

const GRILL_COUNT  = 12;   // 固定12个烤盘
const PAN_CAPACITY = 3;    // 每个烤盘最多3个食材
const TOOL_INIT    = { undo: 3, shuffle: 1, remove: 1 };
const SAVE_KEY     = 'bbq_crazy_v1';

const COMBO_TEXTS = ['', '', 'Nice! 🔥', 'Great! 🔥🔥', 'Awesome! ⚡', 'COMBO! 🌟', 'MASTER! 👑'];

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

// 向上取整到3的倍数
const ceil3 = n => Math.ceil(n / 3) * 3;

// ==================== 关卡配置 ====================

function getLevelCfg(lv) {
  // numTypes: 食材种类数
  // total:    食材总数（必须是3的倍数，且能整除给12个烤盘）
  // time:     倒计时秒数
  // maxStack: 每个托盘最大叠放层数
  if (lv <= 3) {
    return { numTypes: 3, total: 36,  time: 300, maxStack: 3 };
  }
  if (lv <= 6) {
    return { numTypes: 4, total: 48,  time: 270, maxStack: 4 };
  }
  if (lv <= 10) {
    return { numTypes: 5, total: 60,  time: 240, maxStack: 4 };
  }
  if (lv <= 15) {
    return { numTypes: 6, total: 72,  time: 210, maxStack: 5 };
  }
  if (lv <= 20) {
    return { numTypes: 7, total: 72,  time: 190, maxStack: 5 };
  }
  if (lv <= 25) {
    return { numTypes: 8, total: 84,  time: 180, maxStack: 6 };
  }
  if (lv <= 30) {
    return { numTypes: 9, total: 90,  time: 165, maxStack: 6 };
  }
  if (lv <= 35) {
    return { numTypes: 10, total: 96, time: 150, maxStack: 7 };
  }
  if (lv <= 40) {
    return { numTypes: 11, total: 108, time: 135, maxStack: 7 };
  }
  return {
    numTypes: 12,
    total: 108 + ceil3(Math.min(lv - 40, 10) * 3),
    time: Math.max(90, 135 - (lv - 40) * 3),
    maxStack: 8,
  };
}

// ==================== 关卡生成 ====================

/**
 * 数据结构：
 *   grills[i] = {
 *     id: number,           // 0~11
 *     pan: [item|null, ...], // 烤盘槽位，length=3
 *     leftTray:  [item, ...], // 左托盘食材栈（index 0 = 最底部，最后一个 = 顶部可点击）
 *     rightTray: [item, ...], // 右托盘食材栈
 *   }
 *
 *   item = { uid, typeId, emoji, name }
 */
function generateLevel(levelNum) {
  const cfg = getLevelCfg(levelNum);

  // 选可用食材种类
  const pool = INGREDIENTS.filter(ing => ing.unlock <= levelNum);
  const numTypes = Math.min(cfg.numTypes, pool.length);
  const chosen = shuffle(pool).slice(0, numTypes);

  // 计算每种食材数量（均等，总数为3的倍数）
  const perType = ceil3(Math.ceil(cfg.total / numTypes));
  const actualTotal = perType * numTypes;

  // 生成所有食材
  const allItems = [];
  chosen.forEach(ing => {
    for (let i = 0; i < perType; i++) {
      allItems.push({ uid: nextUid(), typeId: ing.id, emoji: ing.emoji, name: ing.name });
    }
  });

  // 打乱
  const bag = shuffle(allItems);

  // 分配到 24 个托盘（每个烤盘左右各一个，共 12*2=24 个托盘）
  // 每个托盘 maxStack 层，但我们把食材尽量均匀分配
  const trayCount = GRILL_COUNT * 2;
  const itemsPerTray = Math.ceil(actualTotal / trayCount);
  const trays = Array.from({ length: trayCount }, () => []);

  // 轮询分配，确保均匀
  bag.forEach((item, idx) => {
    trays[idx % trayCount].push(item);
  });

  // 构造烤盘数组
  const grills = Array.from({ length: GRILL_COUNT }, (_, i) => ({
    id: i,
    pan: [null, null, null],
    leftTray:  trays[i * 2],       // 左托盘
    rightTray: trays[i * 2 + 1],   // 右托盘
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
  level:      1,
  data:       null,   // generateLevel 结果
  score:      0,
  combo:      0,
  tools:      { ...TOOL_INIT },
  // 撤回快照：{ grillId, side('left'|'right'), item, panSnap }
  history:    [],
  cleared:    0,      // 已消除食材数
  busy:       false,  // 动画中，拦截操作
  over:       false,
  won:        false,
  timerSec:   0,
  timerHandle: null,
  removeMode: false,  // 清盘道具激活状态
};

// ==================== 渲染：大厅 ====================

function renderHall() {
  const save = loadSave();
  document.getElementById('hall-score').textContent = (save.totalScore || 0).toLocaleString();
  document.getElementById('hall-maxlv').textContent = `第${save.maxLevel || 1}关`;

  const grid = document.getElementById('level-grid');
  grid.innerHTML = '';

  const showMax = Math.min((save.maxLevel || 1) + 1, 50);
  for (let lv = 1; lv <= showMax; lv++) {
    const stars = save.levelStars[lv] || 0;
    const avail = lv <= (save.maxLevel || 1);
    const done  = lv < (save.maxLevel || 1);

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

// ==================== 渲染：游戏页（全量） ====================

function renderGame() {
  document.getElementById('lv-label').textContent = `第 ${G.level} 关`;
  updateToolbar();
  renderGrills();
  updateProgress();
}

function updateToolbar() {
  ['undo', 'shuffle', 'remove'].forEach(t => {
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

  // 左托盘
  unit.appendChild(makeTrayEl(grill, 'left'));

  // 烤盘主体
  unit.appendChild(makePanEl(grill));

  // 右托盘
  unit.appendChild(makeTrayEl(grill, 'right'));

  return unit;
}

function makePanEl(grill) {
  const pan = document.createElement('div');
  pan.className = 'grill-pan';
  pan.dataset.gid = grill.id;

  // 判断满盘：3个槽全有内容
  const full = grill.pan.every(s => s !== null);
  if (full) pan.classList.add('full');

  // 清盘模式：只有非空烤盘才显示
  if (G.removeMode && grill.pan.some(s => s !== null)) {
    pan.classList.add('remove-mode');
    pan.addEventListener('click', () => doRemoveGrill(grill.id));
    return pan;
  }

  // 普通显示：3个槽位
  const slotsRow = document.createElement('div');
  slotsRow.className = 'pan-slots';

  for (let i = 0; i < PAN_CAPACITY; i++) {
    const slot = document.createElement('div');
    slot.className = 'pan-slot' + (grill.pan[i] ? ' has' : '');
    slot.dataset.gid = grill.id;
    slot.dataset.si  = i;
    if (grill.pan[i]) slot.textContent = grill.pan[i].emoji;
    slotsRow.appendChild(slot);
  }

  pan.appendChild(slotsRow);
  return pan;
}

function makeTrayEl(grill, side) {
  const tray = document.createElement('div');
  tray.className = 'ingredient-tray';
  tray.dataset.gid  = grill.id;
  tray.dataset.side = side;

  const stack = side === 'left' ? grill.leftTray : grill.rightTray;

  if (stack.length === 0) {
    // 托盘为空，显示占位
    const empty = document.createElement('div');
    empty.className = 'tray-empty';
    tray.appendChild(empty);
    return tray;
  }

  // 最多显示4层（避免高度溢出）
  const displayItems = stack.slice(-4);
  const topIdx = displayItems.length - 1; // 最后一个是顶部（可点击）

  displayItems.forEach((item, i) => {
    const el = document.createElement('div');
    const isTop = (i === topIdx);
    el.className = 'tray-item ' + (isTop ? 'top' : 'stacked');
    el.dataset.uid  = item.uid;
    el.dataset.gid  = grill.id;
    el.dataset.side = side;
    el.textContent  = item.emoji;
    el.title        = item.name;

    if (isTop) {
      el.addEventListener('click', e => {
        e.stopPropagation();
        clickTrayItem(grill.id, side);
      });
    } else {
      el.addEventListener('click', e => {
        e.stopPropagation();
        // 点击被压住的食材：抖动顶部提示
        const topEl = tray.querySelector('.tray-item.top');
        if (topEl && !topEl.classList.contains('shake')) {
          topEl.classList.add('shake');
          setTimeout(() => topEl.classList.remove('shake'), 350);
        }
      });
    }
    tray.appendChild(el);
  });

  return tray;
}

// ---- 局部刷新单个烤盘单元 ----

function refreshGrillUnit(grillId) {
  const grill = G.data.grills[grillId];
  const grid  = document.getElementById('grill-grid');
  const oldUnit = grid.querySelector(`.grill-unit[data-gid="${grillId}"]`);
  if (!oldUnit) return;
  const newUnit = makeGrillUnit(grill);
  grid.replaceChild(newUnit, oldUnit);
}

// ==================== 计数辅助 ====================

function countAllTrayItems() {
  return G.data.grills.reduce((sum, g) => sum + g.leftTray.length + g.rightTray.length, 0);
}

function countAllPanItems() {
  return G.data.grills.reduce((sum, g) => sum + g.pan.filter(Boolean).length, 0);
}

function updateProgress() {
  const total    = G.data.totalItems;
  const cleared  = G.cleared;
  const remaining = countAllTrayItems() + countAllPanItems();
  document.getElementById('prog-text').textContent    = `${cleared}/${total}`;
  document.getElementById('prog-remain').textContent  = `还剩${remaining}个`;
  document.getElementById('prog-fill').style.width    = (total ? Math.min(100, cleared / total * 100) : 0) + '%';
}

// ==================== 核心交互：点击托盘食材 ====================

function clickTrayItem(grillId, side) {
  if (G.busy || G.over || G.won || G.removeMode) return;

  const grill = G.data.grills[grillId];
  const stack = side === 'left' ? grill.leftTray : grill.rightTray;

  if (stack.length === 0) return;

  // 检查烤盘是否有空位
  const emptySlot = grill.pan.findIndex(s => s === null);
  if (emptySlot === -1) {
    // 烤盘满了，抖动烤盘
    const panEl = document.querySelector(`.grill-pan[data-gid="${grillId}"]`);
    if (panEl) {
      panEl.style.animation = 'none';
      panEl.style.border = '1.5px solid rgba(244,67,54,0.9)';
      setTimeout(() => {
        if (panEl) panEl.style.border = '';
      }, 500);
    }
    return;
  }

  G.busy = true;

  // 取出顶部食材
  const item = stack[stack.length - 1];

  // 保存撤回快照（快照食材放入前的状态）
  G.history.push({
    grillId,
    side,
    item: { ...item },
    panSnap: grill.pan.map(s => s ? { ...s } : null),
  });

  // 找到源 DOM 元素（顶部食材）
  const srcEl = document.querySelector(
    `.ingredient-tray[data-gid="${grillId}"][data-side="${side}"] .tray-item.top`
  );

  // 找到目标槽位 DOM 元素
  const dstEl = document.querySelector(
    `.grill-pan[data-gid="${grillId}"] .pan-slot[data-si="${emptySlot}"]`
  );

  // 飞行动画，完成后更新状态
  flyToSlot(srcEl, dstEl, item.emoji, () => {
    // 从托盘移除顶部食材
    stack.pop();

    // 放入烤盘槽位
    grill.pan[emptySlot] = item;

    // 刷新单元
    refreshGrillUnit(grillId);
    updateProgress();

    // 延迟检测消除
    setTimeout(() => checkElim(grillId), 60);
  });
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

  // 触发消除弹出动画
  const panEl = document.querySelector(`.grill-pan[data-gid="${grillId}"]`);
  const slotsEls = panEl ? panEl.querySelectorAll('.pan-slot') : [];
  const elimIdxs = [];
  grill.pan.forEach((item, i) => {
    if (item && item.typeId === typeId) elimIdxs.push(i);
  });

  elimIdxs.forEach(i => {
    if (slotsEls[i]) {
      slotsEls[i].classList.remove('glow');
      slotsEls[i].classList.add('pop');
    }
  });

  setTimeout(() => {
    // 清空烤盘对应槽位
    elimIdxs.forEach(i => { grill.pan[i] = null; });

    // 计分
    G.combo++;
    const mult = G.combo >= 6 ? 3.0 : G.combo >= 5 ? 2.5 : G.combo >= 4 ? 2.0 :
                 G.combo >= 3 ? 1.5 : 1.0;
    G.score += Math.round(300 * mult);
    G.cleared += PAN_CAPACITY;

    // 连击提示
    if (G.combo >= 2) showComboTip(G.combo);

    if (panEl) panEl.classList.remove('glow-match');

    // 清除撤回历史（消除后无法撤回）
    G.history = G.history.filter(h => h.grillId !== grillId);

    refreshGrillUnit(grillId);
    updateProgress();

    G.busy = false;
    checkFailCondition();
    if (!G.over) checkWinCondition();
  }, 450);
}

// ==================== 胜负判断 ====================

function checkWinCondition() {
  const trayItems = countAllTrayItems();
  const panItems  = countAllPanItems();
  if (trayItems === 0 && panItems === 0) {
    triggerWin();
  }
}

function checkFailCondition() {
  // 失败条件：所有烤盘都满了（每个都有3个食材），且托盘还有食材
  const trayItems = countAllTrayItems();
  if (trayItems === 0) return; // 托盘空了，不算失败

  const allPansFull = G.data.grills.every(g => g.pan.every(s => s !== null));
  if (allPansFull) {
    triggerFail('full');
    return;
  }

  // 也检查是否超时（由倒计时触发）
}

function triggerWin() {
  if (G.won || G.over) return;
  G.won = true;
  G.busy = false;
  stopTimer();

  // 通关奖励
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

  const titleEl = document.getElementById('fail-title');
  const subEl   = document.getElementById('fail-sub');
  if (reason === 'timeout') {
    if (titleEl) titleEl.textContent = '时间到了！';
    if (subEl)   subEl.textContent   = '手速再快一点点就能过关~';
  } else {
    if (titleEl) titleEl.textContent = '烤盘全满了！';
    if (subEl)   subEl.textContent   = '别灰心，换个思路再试试';
  }

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
  const s   = Math.max(0, G.timerSec);
  const mm  = String(Math.floor(s / 60)).padStart(1, '0');
  const ss  = String(s % 60).padStart(2, '0');
  el.textContent = `${mm}:${ss}`;
  if (box) box.classList.toggle('urgent', s <= 30);
}

// ==================== 飞行动画 ====================

function flyToSlot(srcEl, dstEl, emoji, onDone) {
  if (!srcEl || !dstEl) { onDone(); return; }

  const src = srcEl.getBoundingClientRect();
  const dst = dstEl.getBoundingClientRect();

  // 隐藏源元素
  srcEl.style.visibility = 'hidden';

  // 创建飞行元素
  const fly = document.createElement('div');
  fly.className   = 'item-fly';
  fly.textContent = emoji;
  fly.style.cssText = `left:${src.left}px;top:${src.top}px`;
  document.body.appendChild(fly);

  // 双帧触发 CSS transition
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fly.style.left = dst.left + 'px';
    fly.style.top  = dst.top  + 'px';
    fly.style.transform = 'scale(1.15)';
  }));

  setTimeout(() => {
    fly.remove();
    onDone();
  }, 320);
}

// ==================== 连击提示 ====================

function showComboTip(combo) {
  const text = COMBO_TEXTS[Math.min(combo, COMBO_TEXTS.length - 1)];
  if (!text) return;
  const gameArea = document.getElementById('grill-grid');
  const r = gameArea.getBoundingClientRect();
  const tip = document.createElement('div');
  tip.className   = 'combo-tip';
  tip.textContent = text;
  tip.style.left  = (r.left + r.width / 2 - 50) + 'px';
  tip.style.top   = (r.top + r.height / 3) + 'px';
  document.body.appendChild(tip);
  setTimeout(() => tip.remove(), 950);
}

// ==================== 道具 ====================

const Game = {
  useTool(name) {
    if (G.over || G.won || G.busy) return;
    if (G.tools[name] <= 0) return;
    ({ undo: doUndo, shuffle: doShuffle, remove: activateRemove })[name]();
  },
};

// ---- 撤回 ----
function doUndo() {
  if (G.history.length === 0) return;
  const snap = G.history.pop();
  G.tools.undo--;
  G.combo = 0;

  const grill = G.data.grills[snap.grillId];

  // 恢复烤盘
  grill.pan = snap.panSnap.map(s => s ? { ...s } : null);

  // 把食材放回托盘顶部
  const stack = snap.side === 'left' ? grill.leftTray : grill.rightTray;
  stack.push(snap.item);

  refreshGrillUnit(snap.grillId);
  updateProgress();
  updateToolbar();
}

// ---- 洗牌 ----
function doShuffle() {
  G.tools.shuffle--;
  G.combo = 0;

  // 收集所有托盘食材
  const allTrayItems = [];
  G.data.grills.forEach(g => {
    g.leftTray.forEach(it => allTrayItems.push(it));
    g.rightTray.forEach(it => allTrayItems.push(it));
  });

  // 打乱食材（只打乱 typeId/emoji/name，保持 uid 在原位以防引用问题）
  const shuffledTypes = shuffle(allTrayItems.map(it => ({
    typeId: it.typeId, emoji: it.emoji, name: it.name,
  })));

  let idx = 0;
  G.data.grills.forEach(g => {
    g.leftTray.forEach(it => { Object.assign(it, shuffledTypes[idx++]); });
    g.rightTray.forEach(it => { Object.assign(it, shuffledTypes[idx++]); });
  });

  G.history = []; // 洗牌后撤回无意义
  renderGrills();
  updateToolbar();
}

// ---- 清盘：激活模式，等待点击烤盘 ----
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
  G.combo = 0;
  G.removeMode = false;

  // 清空烤盘
  grill.pan = [null, null, null];

  G.history = []; // 清盘后撤回无意义

  renderGrills();
  updateProgress();
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
}

// ==================== 事件绑定 ====================

function bindEvents() {
  document.getElementById('btn-back').addEventListener('click', () => {
    stopTimer();
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

  // 点击空白处退出清盘模式
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
