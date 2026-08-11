// 客户管理：业务员维护自己的客户，管理员看全部
const express = require('express');
const { authMiddleware, adminOnly } = require('../auth');

module.exports = function (db) {
  const r = express.Router();
  r.use(authMiddleware(db));

  // 列表：sales 只看自己；admin 可看全部
  r.get('/', (req, res) => {
    const { status, q } = req.query;
    const params = [];
    let sql = 'SELECT * FROM customers';
    const cond = [];
    if (req.user.role !== 'admin') {
      cond.push('owner_id=?');
      params.push(req.user.id);
    }
    if (status && status !== 'all') {
      cond.push('status=?');
      params.push(status);
    }
    if (q) {
      cond.push('(name LIKE ? OR country LIKE ? OR contact LIKE ?)');
      const like = '%' + q + '%';
      params.push(like, like, like);
    }
    if (cond.length) sql += ' WHERE ' + cond.join(' AND ');
    sql += ' ORDER BY id DESC';
    const rows = db.prepare(sql).all(...params);
    const owner = db.prepare('SELECT id,name,region FROM users WHERE id=?');
    res.json(rows.map(c => ({ ...c, owner: owner.get(c.owner_id) })));
  });

  // 新建
  r.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.name.trim()) return res.status(400).json({ error: '请填写客户名称' });
    const info = db.prepare(
      'INSERT INTO customers (owner_id,name,country,contact,phone,rating,status,note,date) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(
      req.user.id, b.name.trim(), b.country || '', b.contact || '', b.phone || '',
      b.rating || 'B', b.status || '首次接触', b.note || '', b.date || today()
    );
    res.json({ id: info.lastInsertRowid });
  });

  // 更新（本人客户；管理员可改所有人）
  r.put('/:id', (req, res) => {
    const c = db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id);
    if (!c) return res.status(404).json({ error: '客户不存在' });
    if (req.user.role !== 'admin' && c.owner_id !== req.user.id) {
      return res.status(403).json({ error: '只能修改自己的客户' });
    }
    const b = req.body || {};
    if (!b.name || !b.name.trim()) return res.status(400).json({ error: '请填写客户名称' });
    db.prepare(
      'UPDATE customers SET name=?,country=?,contact=?,phone=?,rating=?,status=?,note=? WHERE id=?'
    ).run(
      b.name.trim(), b.country || '', b.contact || '', b.phone || '',
      b.rating || 'B', b.status || '首次接触', b.note || '', c.id
    );
    res.json({ ok: true });
  });

  return r;
};

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
