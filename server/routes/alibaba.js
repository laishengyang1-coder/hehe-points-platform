// 阿里国际站看板（管理员）：月度投放 + 人均转化
const express = require('express');
const { authMiddleware, adminOnly } = require('../auth');

module.exports = function (db) {
  const r = express.Router();
  r.use(authMiddleware(db), adminOnly);

  // 月度数据 + 人均分配（year 查询）
  r.get('/', (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    const months = db.prepare(
      'SELECT month, spend, leads, deals FROM ali_months WHERE year=? ORDER BY month'
    ).all(year);

    const assign = db.prepare(
      'SELECT user_id, SUM(assigned) assigned, SUM(deals) deals FROM ali_assign WHERE year=? AND month=0 GROUP BY user_id'
    ).all(year);
    const u = db.prepare('SELECT name, region FROM users WHERE id=?');
    const people = assign.map(a => {
      const usr = u.get(a.user_id);
      return {
        name: usr ? usr.name : '未知', region: usr ? usr.region : '',
        assigned: a.assigned, deals: a.deals
      };
    });

    const total = months.reduce((s, m) => ({
      spend: s.spend + m.spend, leads: s.leads + m.leads, deals: s.deals + m.deals
    }), { spend: 0, leads: 0, deals: 0 });
    total.conv = total.leads ? Math.round(total.deals / total.leads * 100) : 0;

    res.json({ year, months, people, total });
  });

  // 填入月度数据（管理员，示例数据替换入口）
  r.post('/months', (req, res) => {
    const b = req.body || {};
    const year = Number(b.year), month = Number(b.month);
    if (!year || !month || month < 1 || month > 12) return res.status(400).json({ error: '月份参数不合法' });
    db.prepare(
      'INSERT INTO ali_months (year,month,spend,leads,deals) VALUES (?,?,?,?,?) ON CONFLICT(year,month) DO UPDATE SET spend=excluded.spend, leads=excluded.leads, deals=excluded.deals'
    ).run(year, month, Number(b.spend) || 0, Number(b.leads) || 0, Number(b.deals) || 0);
    res.json({ ok: true });
  });

  // 填入人均分配
  r.post('/assign', (req, res) => {
    const b = req.body || {};
    const year = Number(b.year);
    if (!year || !b.userId) return res.status(400).json({ error: '参数不合法' });
    db.prepare(
      'INSERT INTO ali_assign (user_id,year,month,assigned,deals) VALUES (?,?,0,?,?) ON CONFLICT DO NOTHING'
    ).run(b.userId, year, Number(b.assigned) || 0, Number(b.deals) || 0);
    res.json({ ok: true });
  });

  // 商机看板聚合统计（基于 opportunities 表 + ali_months 花费；source 区分 国际站/独立站；mode=year 年度总览）
  r.get('/overview', (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    const source = req.query.source || '国际站';

    // ---- 年度总览 ----
    if (req.query.mode === 'year') {
      const rows = db.prepare('SELECT * FROM opportunities WHERE year=? AND source=?').all(year, source);
      const deals = rows.filter(x => x.classify === '成交客户');
      const spend = Number(db.prepare('SELECT SUM(spend) s FROM ali_months WHERE year=?').get(year).s) || 0;
      const total = {
        leads: rows.length,
        deals: deals.length,
        amount: deals.reduce((s, x) => s + x.amount, 0),
        conv: rows.length ? Math.round(deals.length / rows.length * 100) : 0,
        spend: spend,
        costPerLead: spend > 0 ? Math.round(spend / rows.length * 100) / 100 : 0
      };
      const monthly = [];
      for (let m = 1; m <= 12; m++) {
        const mr = rows.filter(x => x.month === m);
        const md = mr.filter(x => x.classify === '成交客户');
        monthly.push({ month: m, leads: mr.length, deals: md.length, amount: md.reduce((s, x) => s + x.amount, 0), conv: mr.length ? Math.round(md.length / mr.length * 100) : 0 });
      }
      return res.json({ mode: 'year', year, source, total, byOwner: ownerAgg(rows), byCountry: countryAgg(rows), byType: typeAgg(rows), monthly, years: availableYears(db, source) });
    }

    // ---- 月度看板 ----
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const base = 'FROM opportunities WHERE year=? AND month=? AND source=?';
    const rows = db.prepare('SELECT * ' + base).all(year, month, source);
    const spendRow = db.prepare('SELECT spend FROM ali_months WHERE year=? AND month=?').get(year, month);
    const spend = spendRow ? Number(spendRow.spend) : 0;
    const months = availableMonths(db, source);
    if (!rows.length) {
      return res.json({ year, month, spend, total: { leads: 0, deals: 0, amount: 0, conv: 0, spend: spend, costPerLead: 0 }, byOwner: [], byCountry: [], byType: [], daily: [], levelDist: [], followDist: [], months });
    }
    const deals = rows.filter(x => x.classify === '成交客户');
    const total = {
      leads: rows.length,
      deals: deals.length,
      amount: deals.reduce((s, x) => s + x.amount, 0),
      conv: Math.round(deals.length / rows.length * 100),
      spend: spend,
      costPerLead: spend > 0 ? Math.round(spend / rows.length * 100) / 100 : 0
    };
    const byOwner = ownerAgg(rows);
    const byCountry = countryAgg(rows);
    const byType = typeAgg(rows);
    // 每日趋势
    const dMap = {};
    rows.forEach(x => { dMap[x.date] = (dMap[x.date] || 0) + 1; });
    const daily = Object.keys(dMap).map(d => ({ date: d, count: dMap[d] })).sort((a, b) => a.date < b.date ? -1 : 1);
    // 等级分布
    const lMap = {};
    rows.forEach(x => { lMap[x.level || '无等级'] = (lMap[x.level || '无等级'] || 0) + 1; });
    const levelDist = Object.keys(lMap).map(l => ({ level: l, count: lMap[l] }));
    // 跟进情况分布
    const fMap = {};
    rows.forEach(x => { fMap[x.follow || '未填写'] = (fMap[x.follow || '未填写'] || 0) + 1; });
    const followDist = Object.keys(fMap).map(f => ({ follow: f, count: fMap[f] })).sort((a, b) => b.count - a.count);
    res.json({ year, month, spend, total, byOwner, byCountry, byType, daily, levelDist, followDist, months });
  });

  return r;
};

function ownerAgg(rows) {
  const ownerMap = {};
  rows.forEach(x => { (ownerMap[x.owner] = ownerMap[x.owner] || []).push(x); });
  return Object.keys(ownerMap).map(o => {
    const list = ownerMap[o];
    const d = list.filter(x => x.classify === '成交客户');
    return { owner: o, leads: list.length, deals: d.length, amount: d.reduce((s, x) => s + x.amount, 0), conv: Math.round(d.length / list.length * 100) };
  }).sort((a, b) => b.leads - a.leads);
}
function countryAgg(rows) {
  const cMap = {};
  rows.forEach(x => { cMap[x.country] = (cMap[x.country] || 0) + 1; });
  return Object.keys(cMap).map(c => ({ country: c, count: cMap[c] })).sort((a, b) => b.count - a.count).slice(0, 10);
}
function typeAgg(rows) {
  const tMap = {};
  rows.forEach(x => { tMap[x.type] = (tMap[x.type] || 0) + 1; });
  return Object.keys(tMap).map(t => ({ type: t, count: tMap[t] }));
}
function availableYears(db, source) {
  const sourceQ = source || '国际站';
  return db.prepare('SELECT DISTINCT year FROM opportunities WHERE source=? ORDER BY year DESC').all(sourceQ).map(x => x.year);
}

function availableMonths(db, source) {
  const sourceQ = source || '国际站';
  const ops = db.prepare('SELECT DISTINCT year, month FROM opportunities WHERE source=? ORDER BY year DESC, month DESC').all(sourceQ);
  const ali = db.prepare('SELECT DISTINCT year, month FROM ali_months ORDER BY year DESC, month DESC').all();
  const seen = {};
  const out = [];
  ops.concat(ali).forEach(m => {
    const k = m.year + '-' + m.month;
    if (!seen[k]) { seen[k] = 1; out.push({ year: m.year, month: m.month }); }
  });
  return out.sort((a, b) => (a.year - b.year) || (a.month - b.month)).reverse();
}
