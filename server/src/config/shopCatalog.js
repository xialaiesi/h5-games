'use strict'

const SHOP_CATALOG = [
  {
    itemKey: 'secret-seasoning',
    name: '秘制撒料',
    tag: '补给',
    description: '更稳的开局，适合连续开烤。',
    price: 24,
    sortOrder: 1,
  },
  {
    itemKey: 'grill-upgrade',
    name: '烤架升级',
    tag: '强化',
    description: '火候更顺，适合冲一段连续通关。',
    price: 42,
    sortOrder: 2,
  },
  {
    itemKey: 'night-sign',
    name: '夜摊灯牌',
    tag: '装扮',
    description: '摊位更亮，气势先拉满。',
    price: 68,
    sortOrder: 3,
  },
  {
    itemKey: 'combo-drink',
    name: '拼单饮料',
    tag: '限购',
    description: '活动期常备，连打几局更带劲。',
    price: 16,
    sortOrder: 4,
  },
]

function getCatalog() {
  return SHOP_CATALOG
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(item => ({ ...item }))
}

function getCatalogItem(itemKey) {
  return SHOP_CATALOG.find(item => item.itemKey === itemKey) || null
}

module.exports = {
  SHOP_CATALOG,
  getCatalog,
  getCatalogItem,
}
