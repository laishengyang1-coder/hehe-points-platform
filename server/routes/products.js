// 产品库（所有人可见）：车衣/窗膜产品参数
const express = require('express');
const { authMiddleware } = require('../auth');

module.exports = function (db) {
  const r = express.Router();
  r.use(authMiddleware(db));

  r.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM products WHERE enabled=1 ORDER BY id').all();
    res.json(rows.map(x => ({ ...x, specs: JSON.parse(x.specs || '{}') })));
  });

  return r;
};
