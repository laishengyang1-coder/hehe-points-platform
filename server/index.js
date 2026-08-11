// 服务入口：静态托管 + API
const express = require('express');
const path = require('path');
const { init, hashPw, makeSalt } = require('./db');
const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const pointRoutes = require('./routes/points');
const mallRoutes = require('./routes/mall');
const userRoutes = require('./routes/users');
const alibabaRoutes = require('./routes/alibaba');

const PORT = process.env.PORT || 3000;
const db = init();

// 商机数据自动导入：opportunities-YYYY-MM.json（国际站）+ site-opportunities-YYYY-MM.json（独立站）
(function importOpportunities() {
  const fs = require('fs');
  const dataDir = path.join(__dirname, '..', 'data');
  const files = fs.existsSync(dataDir) ? fs.readdirSync(dataDir).filter(f => /^(site-)?opportunities-\d{4}-\d{2}\.json$/.test(f)) : [];
  files.forEach(file => {
    const m = file.match(/^(site-)?opportunities-(\d{4})-(\d{2})\.json$/);
    const source = m[1] ? '独立站' : '国际站';
    const year = Number(m[2]), month = Number(m[3]);
    const exists = db.prepare('SELECT COUNT(*) c FROM opportunities WHERE year=? AND month=? AND source=?').get(year, month, source).c;
    if (exists > 0) return;
    const rows = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    const ins = db.prepare(
      'INSERT INTO opportunities (year,month,date,type,customer,country,level,owner,follow,classify,amount,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    );
    rows.forEach(r => ins.run(year, month, r.date || '', r.type || '', r.customer || '', r.country || '', r.level || '', r.owner || '', r.follow || '', r.classify || '', r.amount || 0, source));
    console.log(`[import] 已导入${source}商机数据 ${file}（${rows.length} 条）`);
  });
})();

// 月度花费导入：data/ali-months.json → ali_months 表（upsert spend，leads/deals 由商机表实时统计）
(function importAliMonths() {
  const fs = require('fs');
  const f = path.join(__dirname, '..', 'data', 'ali-months.json');
  if (!fs.existsSync(f)) return;
  const rows = JSON.parse(fs.readFileSync(f, 'utf8'));
  const upsert = db.prepare(
    'INSERT INTO ali_months (year,month,spend) VALUES (?,?,?) ON CONFLICT(year,month) DO UPDATE SET spend=excluded.spend'
  );
  rows.forEach(r => upsert.run(Number(r.year), Number(r.month), Number(r.spend) || 0));
  console.log(`[import] 已导入月度花费 ${rows.length} 条`);
})();

// 首次启动若没有任何业务员账号，自动创建演示账号（生产可删）
if (db.prepare("SELECT COUNT(*) c FROM users WHERE role='sales'").get().c === 0) {
  const demo = [
    ['张明', '欧洲区', '2024-03'], ['李婷', '北美区', '2024-05'],
    ['王浩', '东南亚区', '2024-06'], ['陈思', '中东区', '2024-09'],
    ['刘洋', '南美区', '2025-01'], ['赵磊', '欧洲区', '2025-03']
  ];
  const ins = db.prepare('INSERT INTO users (name,region,joined,role,salt,pass) VALUES (?,?,?,?,?,?)');
  demo.forEach(([n, region, joined]) => {
    const salt = makeSalt();
    ins.run(n, region, joined, 'sales', salt, hashPw('123456', salt));
  });
  console.log('[init] 已创建 6 个演示业务员账号（密码 123456），生产环境请删除或改密');
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api', authRoutes(db));
app.use('/api/customers', customerRoutes(db));
app.use('/api', pointRoutes(db));
app.use('/api/mall', mallRoutes(db));
app.use('/api/users', userRoutes(db));
app.use('/api/alibaba', alibabaRoutes(db));

// 前端路由兜底（SPA 无此需求，纯静态单页）
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`积分平台服务已启动: http://0.0.0.0:${PORT}`);
});
