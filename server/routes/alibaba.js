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

  return r;
};
