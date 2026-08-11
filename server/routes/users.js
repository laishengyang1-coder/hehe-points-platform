// 用户管理（管理员）：账号列表、新建、重置密码
const express = require('express');
const { authMiddleware, adminOnly } = require('../auth');
const { balanceOf, ranking } = require('../points');
const { hashPw, makeSalt } = require('../db');

module.exports = function (db) {
  const r = express.Router();
  r.use(authMiddleware(db));

  // 列表：sales 看自己资料；admin 看全部 + 余额排名
  r.get('/', (req, res) => {
    if (req.user.role !== 'admin') {
      const u = req.user;
      const b = balanceOf(db, u.id);
      const rk = ranking(db).find(x => x.id === u.id);
      return res.json([{ id: u.id, name: u.name, region: u.region, joined: u.joined, role: u.role, cum: b.cum, avail: b.avail, rank: rk ? rk.rank : 0 }]);
    }
    const rows = db.prepare("SELECT * FROM users ORDER BY role DESC, id").all();
    res.json(rows.map(u => {
      const b = balanceOf(db, u.id);
      const rk = ranking(db).find(x => x.id === u.id);
      return { id: u.id, name: u.name, region: u.region, joined: u.joined, role: u.role, cum: b.cum, avail: b.avail, rank: rk ? rk.rank : 0 };
    }));
  });

  // 管理员新建账号
  r.post('/', adminOnly, (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.password || b.password.length < 4) {
      return res.status(400).json({ error: '请填写姓名，密码至少 4 位' });
    }
    const exists = db.prepare('SELECT id FROM users WHERE name=?').get(b.name.trim());
    if (exists) return res.status(400).json({ error: '该姓名已存在' });
    const salt = makeSalt();
    const info = db.prepare('INSERT INTO users (name,region,joined,role,salt,pass) VALUES (?,?,?,?,?,?)')
      .run(b.name.trim(), b.region || '', b.joined || '', 'sales', salt, hashPw(b.password, salt));
    res.json({ id: info.lastInsertRowid });
  });

  // 管理员重置密码
  r.put('/:id/password', adminOnly, (req, res) => {
    const b = req.body || {};
    if (!b.password || b.password.length < 4) return res.status(400).json({ error: '密码至少 4 位' });
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!u) return res.status(404).json({ error: '用户不存在' });
    const salt = makeSalt();
    db.prepare('UPDATE users SET salt=?, pass=? WHERE id=?').run(salt, hashPw(b.password, salt), u.id);
    res.json({ ok: true });
  });

  return r;
};
