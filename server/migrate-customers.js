// 客户池增量导入：从 opportunities 表按 客户名+国家 去重，补充导入 customers 表
// 用法（部署完成后在服务器执行）：sudo node server/migrate-customers.js
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'points.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const opps = db.prepare('SELECT * FROM opportunities').all();

// 去重：同名同国合并，成交优先、金额取最大
const map = {};
opps.forEach(o => {
  if (!o.customer) return;
  const key = o.customer + '|' + o.country;
  const prev = map[key];
  if (!prev) { map[key] = o; return; }
  const oDeal = o.classify === '成交客户', pDeal = prev.classify === '成交客户';
  if (oDeal && !pDeal) map[key] = o;
  else if (oDeal && pDeal && o.amount > prev.amount) map[key] = o;
});

const users = db.prepare('SELECT id, name FROM users').all();
const uidByName = {};
users.forEach(u => uidByName[u.name] = u.id);

const exist = new Set(db.prepare('SELECT name, country FROM customers').all().map(c => c.name + '|' + c.country));
const ins = db.prepare('INSERT INTO customers (owner_id,name,country,contact,phone,rating,status,note,date) VALUES (?,?,?,?,?,?,?,?,?)');

let added = 0, noOwner = 0, dup = 0;
Object.values(map).forEach(o => {
  const ownerId = uidByName[o.owner];
  if (!ownerId) { noOwner++; return; }
  const key = o.customer + '|' + o.country;
  if (exist.has(key)) { dup++; return; }
  const status = o.classify === '成交客户' ? '已成交' : (o.classify === '意向客户' ? '跟进中' : '首次接触');
  const note = ['来源:' + (o.source || ''), o.level ? '等级:' + o.level : '', o.follow ? '跟进:' + o.follow : '', o.amount ? '成交金额:$' + o.amount : ''].filter(Boolean).join(' | ');
  ins.run(ownerId, o.customer, o.country, '', '', 'B', status, note, o.date);
  exist.add(key);
  added++;
});
console.log('商机总数:', opps.length, '| 去重后客户:', Object.keys(map).length);
console.log('新增客户:', added, '| 已有跳过:', dup, '| 无归属跳过:', noOwner);
console.log('客户池总计:', db.prepare('SELECT COUNT(*) c FROM customers').get().c);
