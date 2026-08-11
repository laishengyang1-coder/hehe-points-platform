// 一次性迁移脚本：按 7 月商机表重建销售账号体系并导入客户池
// 用法（服务器上）：sudo node server/migrate-accounts.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'points.db');
const OWNERS = ['Allen', 'Amber', 'Brienna', 'Clarie', 'Kally', 'Kat', 'Leo', 'Lia'];
const STATUS_MAP = { '成交客户': '已成交', '意向客户': '跟进中' };

function hashPw(pw, salt) { return crypto.createHash('sha256').update(salt + pw).digest('hex'); }
function makeSalt() { return crypto.randomBytes(8).toString('hex'); }

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// 1. 删除现有销售账号（中文演示账号）
console.log('删除现有销售账号:', db.prepare("DELETE FROM users WHERE role='sales'").run().changes, '个');

// 2. 清空演示业务数据（客户/积分流水/兑换，均为空演示数据）
console.log('清空 customers:', db.prepare('DELETE FROM customers').run().changes);
console.log('清空 logs:', db.prepare('DELETE FROM logs').run().changes);
console.log('清空 exchanges:', db.prepare('DELETE FROM exchanges').run().changes);

// 3. 新建英文名销售账号（默认密码 123456）
const insUser = db.prepare('INSERT INTO users (name,region,joined,role,salt,pass) VALUES (?,?,?,?,?,?)');
const ids = {};
OWNERS.forEach(name => {
  const salt = makeSalt();
  const info = insUser.run(name, '', '', 'sales', salt, hashPw('123456', salt));
  ids[name] = info.lastInsertRowid;
});
console.log('新建英文销售账号:', OWNERS.length, '个 ->', OWNERS.join(' / '));

// 4. 导入客户到对应销售池
const opps = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'opportunities-2026-07.json'), 'utf8'));
const insCust = db.prepare('INSERT INTO customers (owner_id,name,country,contact,phone,rating,status,note,date) VALUES (?,?,?,?,?,?,?,?,?)');
let imported = 0, skipped = 0;
opps.forEach(o => {
  const ownerId = ids[o.owner];
  if (!ownerId) { skipped++; return; }
  const status = STATUS_MAP[o.classify] || '首次接触';
  const note = ['商机类型:' + o.type, o.level ? '等级:' + o.level : '', o.follow ? '跟进:' + o.follow : '', o.amount ? '成交金额:$' + o.amount : ''].filter(Boolean).join(' | ');
  insCust.run(ownerId, o.customer, o.country, '', '', 'B', status, note, o.date);
  imported++;
});
console.log('导入客户:', imported, '条（跳过未分配经理:', skipped, '条）');
console.log('迁移完成。各销售客户数:');
OWNERS.forEach(name => {
  console.log(' ', name, db.prepare('SELECT COUNT(*) c FROM customers WHERE owner_id=?').get(ids[name]).c, '条');
});
