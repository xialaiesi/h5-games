'use strict';

// ==================== ELO 积分计算模块 ====================
// 纯函数，无副作用，前后端通用（UMD）
// 公式：E_A = 1 / (1 + 10^((R_B - R_A) / 400))
//       R_A' = R_A + K * (S_A - E_A)

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Elo = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /**
   * 根据当前积分和总局数确定 K 值
   * K 值决定每局积分变化幅度：
   *   - 新手玩家（< 20 局）K=32，积分变化快
   *   - 高分玩家（积分 > 1800）K=16，积分稳定
   *   - 其余情况 K=24
   * @param {number} rating - 当前积分
   * @param {number} totalGames - 历史对局总数
   * @returns {number}
   */
  function getK(rating, totalGames) {
    if (totalGames < 20) return 32;  // 新手期
    if (rating > 1800) return 16;    // 高分段
    return 24;                        // 普通
  }

  /**
   * 计算 A 对 B 的预期胜率
   * 公式：E = 1 / (1 + 10^((rB - rA) / 400))
   * @param {number} ratingA
   * @param {number} ratingB
   * @returns {number} 0~1 之间的小数
   */
  function expectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }

  /**
   * 计算对局后双方新积分
   * @param {number} ratingA - A 当前积分
   * @param {number} ratingB - B 当前积分
   * @param {'win'|'loss'|'draw'} result - A 方的对局结果
   * @param {{ totalGames: number }} statsA - A 的统计信息
   * @param {{ totalGames: number }} statsB - B 的统计信息
   * @returns {{ newRatingA: number, newRatingB: number, deltaA: number, deltaB: number }}
   */
  function calculate(ratingA, ratingB, result, statsA, statsB) {
    var kA = getK(ratingA, statsA.totalGames);
    var kB = getK(ratingB, statsB.totalGames);

    var eA = expectedScore(ratingA, ratingB);
    var eB = 1 - eA;

    var sA, sB;
    if (result === 'win') {
      sA = 1; sB = 0;
    } else if (result === 'loss') {
      sA = 0; sB = 1;
    } else {
      // draw
      sA = 0.5; sB = 0.5;
    }

    var deltaA = Math.round(kA * (sA - eA));
    var deltaB = Math.round(kB * (sB - eB));

    // 积分最低不低于 0
    var newRatingA = Math.max(0, ratingA + deltaA);
    var newRatingB = Math.max(0, ratingB + deltaB);

    return {
      newRatingA: newRatingA,
      newRatingB: newRatingB,
      deltaA: newRatingA - ratingA,
      deltaB: newRatingB - ratingB,
    };
  }

  /**
   * 根据积分获取段位名称
   * @param {number} rating
   * @returns {string}
   */
  function getRank(rating) {
    if (rating >= 2000) return '宗师';
    if (rating >= 1700) return '大师';
    if (rating >= 1500) return '强棋';
    if (rating >= 1300) return '棋士';
    if (rating >= 1100) return '学徒';
    return '入门';
  }

  return {
    getK: getK,
    expectedScore: expectedScore,
    calculate: calculate,
    getRank: getRank,
  };

}));
