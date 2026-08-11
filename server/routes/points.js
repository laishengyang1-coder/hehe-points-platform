// 积分：类型表、流水、申请、审核、手动调整、榜单
const express = require('express');
const { authMiddleware, adminOnly } = require('../auth');
const { POINT_TYPES, findType, balanceOf, ranking } = require('../points');

module.exports = function (db) {
  const r = express.Router();
  r.use(authMiddleware(db));

  // 积分类型表（申请表单/规则页用）
  r.get('/types', (req, res) => res.json(POINT_TYPES));

  // 流水：sales 看自己；admin 可筛全部
  r.get('/logs', (req, res) => {
    const { status, userId } = req.query;
    const params = [];
    let sql = 'SELECT * FROM logs';
    const cond = [];
    if (req.user.role !== 'admin') {
      cond.push('user_id=?'); params.push(req.user.id);
    } else if (userId && userId !== 'all') {
      cond.push('user_id=?'); params.push(Number(userId));
    }
    if (status && status !== 'all') { cond.push('status=?'); params.push(status); }
    if (cond.length) sql += ' WHERE ' + cond.join(' AND ');
    sql += ' ORDER BY id DESC';
    res.json(db.prepare(sql).all(...params));
  });

  // 我的余额与排名
  r.get('/me/balance', (req, res) => {
    const b = balanceOf(db, req.user.id);
    const rk = ranking(db).find(x => x.id === req.user.id);
    res.json({ ...b, rank: rk ? rk.rank : 0 });
  });

  // 我的客户转化统计（上月 / 年度：分配、成交、成交率）
  r.get('/me/stats', (req, res) => {
    const uid = req.user.id;
    const last = new Date();
    last.setMonth(last.getMonth() - 1); // 上月（表格按月延迟一个月导入）
    const y = last.getFullYear();
    const m = String(last.getMonth() + 1).padStart(2, '0');
    const monthPrefix = y + '-' + m;
    const customers = db.prepare('SELECT status, date FROM customers WHERE owner_id=?').all(uid);
    const monthAll = customers.filter(c => (c.date || '').startsWith(monthPrefix));
    const monthDeals = monthAll.filter(c => c.status === '已成交');
    const yearAll = customers.filter(c => (c.date || '').startsWith(String(y)));
    const yearDeals = yearAll.filter(c => c.status === '已成交');
    res.json({
      month: { label: y + '-' + m, assigned: monthAll.length, deals: monthDeals.length, conv: monthAll.length ? Math.round(monthDeals.length / monthAll.length * 100) : 0 },
      year: { assigned: yearAll.length, deals: yearDeals.length, conv: yearAll.length ? Math.round(yearDeals.length / yearAll.length * 100) : 0 }
    });
  });

  // 申请积分（统一走审核）
  r.post('/logs', (req, res) => {
    const b = req.body || {};
    const ft = findType(b.type);
    if (!ft) return res.status(400).json({ error: '积分类型不存在' });
    if (!b.desc || !b.desc.trim()) return res.status(400).json({ error: '请填写申请说明' });
    const info = db.prepare(
      "INSERT INTO logs (user_id,type,cat,pts,related,desc,date,status,kind) VALUES (?,?,?,?,?,?,?,'pending',?)"
    ).run(req.user.id, b.type, ft.cat, ft.pts, b.related || '', b.desc.trim(), today(), ft.pts >= 0 ? 'earn' : 'spend');
    res.json({ id: info.lastInsertRowid });
  });

  // 审核（管理员）：通过 / 驳回
  r.put('/logs/:id', adminOnly, (req, res) => {
    const l = db.prepare('SELECT * FROM logs WHERE id=?').get(req.params.id);
    if (!l) return res.status(404).json({ error: '记录不存在' });
    const status = req.body && req.body.status;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: '状态不合法' });
    db.prepare('UPDATE logs SET status=? WHERE id=?').run(status, l.id);
    res.json({ ok: true });
  });

  // 管理员手动加/扣积分（approved 直接生效，留痕）
  r.post('/adjust', adminOnly, (req, res) => {
    const b = req.body || {};
    const amt = Number(b.pts);
    if (!b.userId || !amt || !Number.isInteger(amt)) return res.status(400).json({ error: '参数不合法' });
    if (!b.desc || !b.desc.trim()) return res.status(400).json({ error: '请填写调整原因' });
    const isAdd = amt > 0;
    db.prepare(
      "INSERT INTO logs (user_id,type,cat,pts,related,desc,date,status,kind) VALUES (?,?,?,?,?,?,?,'approved',?)"
    ).run(
      b.userId, isAdd ? '管理员加发' : '管理员扣减', '调整', amt, '',
      b.desc.trim(), today(), isAdd ? 'earn' : 'spend'
    );
    res.json({ ok: true });
  });

  // 榜单：month=当月 / year=年度累计
  r.get('/leaderboard', (req, res) => {
    const tab = req.query.tab === 'month' ? 'month' : 'year';
    const y = new Date().getFullYear();
    const m = String(new Date().getMonth() + 1).padStart(2, '0');
    const prefix = `${y}-${m}`;
    const sales = db.prepare("SELECT * FROM users WHERE role='sales'").all();
    const rows = sales.map(u => {
      let cum = 0;
      const logs = db.prepare(
        "SELECT pts FROM logs WHERE user_id=? AND status='approved' AND kind='earn'"
      ).all(u.id);
      for (const l of logs) {
        if (tab === 'month' && !(l.date || '').startsWith(prefix)) continue;
        cum += l.pts;
      }
      return { id: u.id, name: u.name, region: u.region, joined: u.joined, cum };
    }).sort((a, b) => b.cum - a.cum)
      .map((x, i) => ({ rank: i + 1, ...x }));
    res.json({ tab, rows });
  });

  return r;
};

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
