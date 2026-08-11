// 积分业务常量：类型表（与文档一致，供申请表单/规则页使用）
const POINT_TYPES = [
  { cat: '战果积分', items: [
    { t: 'CRM准客户录入', p: 1,  d: '每新增一个准客户录入，按月核算' },
    { t: '新客户开发',   p: 5,  d: '新客户首单成交' },
    { t: '大客户开发',   p: 10, d: '当地市场 TOP8 以内客户，开发并寄样' },
    { t: '大客户成交',   p: 30, d: '大客户首单成交' },
    { t: '月度目标完成', p: 20, d: '目标超额完成，鼓励冲刺' },
    { t: '月度业绩突破', p: 30, d: '每破百万业绩，鼓励挑战' },
    { t: '国外市场地推', p: 15, d: '国外有效出差 1 次（10~20 分浮动）' }
  ]},
  { cat: '破冰积分', items: [
    { t: '新市场首单', p: 10, d: '首次进入新国家/区域市场，经事业部确认' },
    { t: '新品线首单', p: 5,  d: '公司新品类首批海外订单' }
  ]},
  { cat: '专业赋能', items: [
    { t: '内部经验分享', p: 5,  d: '个人经验分享，沉淀组织能力' },
    { t: '内部培训',   p: 10, d: '面向事业部全员，正式培训（含教材）' }
  ]},
  { cat: '积分扣减', items: [
    { t: '影响团队 / 价值观', p: -5, d: '个人行为影响团队或不符合公司价值观，扣减 5 分/次' }
  ]}
];

// 根据类型名查积分与类目
function findType(typeName) {
  for (const g of POINT_TYPES) {
    for (const it of g.items) {
      if (it.t === typeName) return { pts: it.p, cat: g.cat };
    }
  }
  return null;
}

// 余额计算：累计积分（只增不减）+ 可用积分（商城扣减）
function balanceOf(db, userId) {
  const rows = db.prepare(
    "SELECT pts, kind FROM logs WHERE user_id=? AND status='approved'"
  ).all(userId);
  let cum = 0, avail = 0;
  for (const r of rows) {
    if (r.kind === 'earn') cum += r.pts;
    avail += r.pts; // spend 存负数，直接累加即扣减
  }
  return { cum, avail };
}

// 排名（按累计积分）
function ranking(db) {
  const sales = db.prepare("SELECT * FROM users WHERE role='sales'").all();
  return sales
    .map(u => ({ id: u.id, name: u.name, region: u.region, cum: balanceOf(db, u.id).cum }))
    .sort((a, b) => b.cum - a.cum)
    .map((r, i) => ({ rank: i + 1, ...r }));
}

module.exports = { POINT_TYPES, findType, balanceOf, ranking };
