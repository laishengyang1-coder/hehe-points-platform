// 数据库初始化：建表 + 种子数据
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'points.db');

function hashPw(pw, salt) {
  return crypto.createHash('sha256').update(salt + pw).digest('hex');
}
function makeSalt() { return crypto.randomBytes(8).toString('hex'); }

function init() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      region TEXT DEFAULT '',
      joined TEXT DEFAULT '',
      role TEXT DEFAULT 'sales',
      salt TEXT NOT NULL,
      pass TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      country TEXT DEFAULT '',
      contact TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      rating TEXT DEFAULT 'B',
      status TEXT DEFAULT '首次接触',
      note TEXT DEFAULT '',
      date TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      cat TEXT DEFAULT '',
      pts INTEGER NOT NULL,
      related TEXT DEFAULT '',
      desc TEXT DEFAULT '',
      date TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      kind TEXT DEFAULT 'earn',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS exchanges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      item TEXT NOT NULL,
      cost INTEGER NOT NULL,
      date TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS mall_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sec TEXT NOT NULL,
      name TEXT NOT NULL,
      desc TEXT DEFAULT '',
      pts INTEGER NOT NULL,
      ico TEXT DEFAULT 'gift',
      enabled INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ali_months (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      spend INTEGER DEFAULT 0,
      leads INTEGER DEFAULT 0,
      deals INTEGER DEFAULT 0,
      UNIQUE(year, month)
    );
    CREATE TABLE IF NOT EXISTS ali_assign (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER DEFAULT 0,
      assigned INTEGER DEFAULT 0,
      deals INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      date TEXT DEFAULT '',
      type TEXT DEFAULT '',
      customer TEXT DEFAULT '',
      country TEXT DEFAULT '',
      level TEXT DEFAULT '',
      owner TEXT DEFAULT '',
      follow TEXT DEFAULT '',
      classify TEXT DEFAULT '',
      amount INTEGER DEFAULT 0,
      source TEXT DEFAULT '国际站'
    );
  `);

  // 兼容旧库：为已存在的 opportunities 表补充 source 列
  try { db.exec("ALTER TABLE opportunities ADD COLUMN source TEXT DEFAULT '国际站'"); } catch (e) { /* 已存在则忽略 */ }

  // 种子：管理员账号
  const adminCount = db.prepare('SELECT COUNT(*) c FROM users WHERE role=?').get('admin').c;
  if (adminCount === 0) {
    const salt = makeSalt();
    db.prepare('INSERT INTO users (name, region, joined, role, salt, pass) VALUES (?,?,?,?,?,?)')
      .run('管理员', '', '', 'admin', salt, hashPw('admin123', salt));
  }

  // 种子：商城配置（文档三层兑换体系）
  const mallCount = db.prepare('SELECT COUNT(*) c FROM mall_items').get().c;
  if (mallCount === 0) {
    const ins = db.prepare('INSERT INTO mall_items (sec, name, desc, pts, ico) VALUES (?,?,?,?,?)');
    const items = [
      ['instant', '山姆购', '山姆会员店购物，80 元以内', 30, 'bag'],
      ['instant', '居家办公 1 天', '居家办公一天，灵活安排', 60, 'brief'],
      ['instant', '山姆购 / 京东卡', '200 元以内', 60, 'bag'],
      ['instant', '高铁 / 飞机出行一次', '任意地点，1000 元以内', 100, 'globe'],
      ['instant', '山姆购 / 京东卡', '1000 元以内', 100, 'bag'],
      ['quarterly', '1 个月弹性工作制', '当月无需打卡', 200, 'clock'],
      ['quarterly', '金豆子 2 粒', '可累积克数兑换黄金饰品', 200, 'star'],
      ['quarterly', '团队团建主导权', '事业部团建全程策划主导权（含预算审批权）', 500, 'users'],
      ['quarterly', '家庭旅行基金', '报销额度 5000 元', 500, 'globe'],
      ['quarterly', '高端电子产品', '5000 元以内', 800, 'zap'],
      ['quarterly', '差旅升级', '出差头等舱 1 次，不超过 2 万', 1000, 'trend'],
      ['annual', '海外展会随行名额', '年度竞拍 · 住宿、机票费用承担（2000 分起拍）', 2000, 'trophy']
    ];
    items.forEach(i => ins.run(...i));
  }

  return db;
}

module.exports = { init, DB_PATH, hashPw, makeSalt };
