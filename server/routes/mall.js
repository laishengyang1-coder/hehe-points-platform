// 商城：商品列表、兑换申请、管理员审核发放
const express = require('express');
const { authMiddleware, adminOnly } = require('../auth');
const { balanceOf } = require('../points');

module.exports = function (db) {
  const r = express.Router();
  r.use(authMiddleware(db));

  // 商品列表（三层）
  r.get('/items', (req, res) => {
    const items = db.prepare('SELECT * FROM mall_items WHERE enabled=1 ORDER BY id').all();
    const bySec = { instant: [], quarterly: [], annual: [] };
    items.forEach(i => { if (bySec[i.sec]) bySec[i.sec].push(i); });
    res.json(bySec);
  });

  // 我的兑换记录
  r.get('/exchanges', (req, res) => {
    if (req.user.role === 'admin') {
      const rows = db.prepare('SELECT * FROM exchanges ORDER BY id DESC').all();
      const u = db.prepare('SELECT name FROM users WHERE id=?');
      return res.json(rows.map(x => ({ ...x, user_name: u.get(x.user_id).name })));
    }
    res.json(db.prepare('SELECT * FROM exchanges WHERE user_id=? ORDER BY id DESC').all(req.user.id));
  });

  // 提交兑换申请
  r.post('/exchanges', (req, res) => {
    const b = req.body || {};
    const item = db.prepare('SELECT * FROM mall_items WHERE id=? AND enabled=1').get(b.itemId);
    if (!item) return res.status(404).json({ error: '商品不存在' });
    const bal = balanceOf(db, req.user.id);
    if (bal.avail < item.pts) return res.status(400).json({ error: '可用积分不足' });
    const info = db.prepare(
      "INSERT INTO exchanges (user_id,item,cost,date,status) VALUES (?,?,?,?,'pending')"
    ).run(req.user.id, item.name, item.pts, today());
    res.json({ id: info.lastInsertRowid });
  });

  // 管理员审核：通过→发放并扣可用积分；驳回
  r.put('/exchanges/:id', adminOnly, (req, res) => {
    const e = db.prepare('SELECT * FROM exchanges WHERE id=?').get(req.params.id);
    if (!e) return res.status(404).json({ error: '记录不存在' });
    const status = req.body && req.body.status;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: '状态不合法' });
    db.prepare('UPDATE exchanges SET status=? WHERE id=?').run(status, e.id);
    if (status === 'approved') {
      // 生成扣减流水（spend 存负数）
      db.prepare(
        "INSERT INTO logs (user_id,type,cat,pts,related,desc,date,status,kind) VALUES (?,?,?,?,?,?,?,'approved','spend')"
      ).run(e.user_id, '商城兑换', '商城消费', -e.cost, e.item, '兑换发放扣减', today());
    }
    res.json({ ok: true });
  });

  return r;
};

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
