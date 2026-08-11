// 认证路由：登录 / 登出 / 当前用户
const express = require('express');
const { hashPw } = require('../db');
const { createSession, destroySession, authMiddleware } = require('../auth');

function publicUser(u) {
  return { id: u.id, name: u.name, region: u.region, joined: u.joined, role: u.role };
}

module.exports = function (db) {
  const r = express.Router();

  r.post('/login', (req, res) => {
    const { name, password } = req.body || {};
    if (!name || !password) return res.status(400).json({ error: '请输入账号和密码' });
    const u = db.prepare('SELECT * FROM users WHERE name=?').get(name);
    if (!u || hashPw(password, u.salt) !== u.pass) {
      return res.status(401).json({ error: '账号或密码错误' });
    }
    const token = createSession(u.id);
    res.json({ token, user: publicUser(u) });
  });

  r.post('/logout', (req, res) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (token) destroySession(token);
    res.json({ ok: true });
  });

  r.get('/me', authMiddleware(db), (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  return r;
};
