// 认证与会话：登录签发 token，中间件校验
const crypto = require('crypto');

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

// token -> userId 的内存会话表（重启后需重新登录，小团队足够）
const sessions = new Map();

function createSession(userId) {
  const token = makeToken();
  sessions.set(token, { userId, createdAt: Date.now() });
  return token;
}
function destroySession(token) {
  sessions.delete(token);
}
function getSessionUser(db, token) {
  const s = sessions.get(token);
  if (!s) return null;
  return db.prepare('SELECT * FROM users WHERE id=?').get(s.userId) || null;
}

// Express 中间件：校验 Authorization: Bearer <token>
function authMiddleware(db) {
  return function (req, res, next) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    const user = token ? getSessionUser(db, token) : null;
    if (!user) {
      return res.status(401).json({ error: '未登录或登录已过期' });
    }
    req.user = user;
    req.token = token;
    next();
  };
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权限' });
  }
  next();
}

module.exports = { createSession, destroySession, authMiddleware, adminOnly };
