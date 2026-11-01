'use strict';
// MobilePlus onlayn do'kon serveri — tashqi kutubxonalarsiz (faqat Node.js 18+).
// Ishga tushirish:  node server.js   →  http://localhost:3000  (admin: /admin)

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createSeed } = require('./seed');

const PORT = Number(process.env.PORT) || 3000;
// STORAGE_DIR — hostingdagi doimiy disk (masalan Railway volume: /data). Berilmasa — loyiha papkasi.
const STORAGE_DIR = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : __dirname;
const DATA_DIR = path.join(STORAGE_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(STORAGE_DIR, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 25 * 1024 * 1024;
const MAX_IMAGE = 10 * 1024 * 1024;
const SESSION_TTL = 7 * 24 * 3600 * 1000;
// O'zbekiston mobil operatorlari kodlari (+998 XX ...)
const OPERATOR_CODES = ['20', '33', '50', '55', '61', '62', '65', '66', '67', '69', '70', '71', '72', '73', '74', '75', '76', '77', '78', '79', '87', '88', '90', '91', '93', '94', '95', '97', '98', '99'];
const STATUSES = ['new', 'confirmed', 'shipping', 'done', 'cancelled'];
const STATUS_NAMES = { new: 'Yangi', confirmed: "To'lov tasdiqlandi", shipping: "Yo'lda", done: 'Yetkazildi', cancelled: 'Bekor qilindi' };

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- Parol ----------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pw), salt, 64).toString('hex');
}
function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const a = crypto.scryptSync(String(pw), salt, 64);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- Ma'lumotlar bazasi (JSON fayl) ----------
let db;
if (fs.existsSync(DB_FILE)) {
  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
} else {
  const pw = process.env.ADMIN_PASSWORD || 'admin123';
  db = createSeed(hashPassword(pw));
  save();
  console.log(`\n  Yangi baza yaratildi. Admin paroli: ${pw}  (admin paneldan albatta o'zgartiring!)\n`);
}
function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

// ---------- Yordamchilar ----------
const newId = () => crypto.randomBytes(6).toString('hex');
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const int = (v) => { const n = Math.round(Number(String(v ?? '').replace(/\s/g, ''))); return Number.isFinite(n) && n > 0 ? n : 0; };
const escHtml = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const fmtMoney = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm";

function normPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 9) d = '998' + d;
  if (d.length !== 12 || !d.startsWith('998')) return '';
  if (!OPERATOR_CODES.includes(d.slice(3, 5))) return '';
  if (/^(\d)\1+$/.test(d.slice(5))) return ''; // 0000000, 1111111 kabi soxta raqamlar
  return `+998 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10, 12)}`;
}

function send(res, code, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const fail = (code, msg) => { throw new HttpError(code, msg); };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'Fayl juda katta')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, "Noto'g'ri so'rov")); }
    });
    req.on('error', reject);
  });
}

function saveDataUrl(dataUrl) {
  const m = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) fail(400, 'Rasm formati noto\'g\'ri (JPG, PNG, WEBP)');
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > MAX_IMAGE) fail(400, 'Rasm hajmi 10 MB dan oshmasligi kerak');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const name = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return '/uploads/' + name;
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}
// Oddiy cheklov: IP bo'yicha ma'lum vaqtda nechta urinish
const hits = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) fail(429, "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring.");
  list.push(now); hits.set(key, list);
}

// ---------- Sessiyalar ----------
const sessions = new Map();
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function isAdmin(req) {
  const t = parseCookies(req).mp_admin;
  const exp = t && sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}

// ---------- Telegram bildirishnoma ----------
function notifyTelegram(text, settings = db.settings) {
  return new Promise((resolve) => {
    const { tgBotToken: token, tgChatId: chat } = settings;
    if (!token || !chat) return resolve({ ok: false, error: 'Bot token yoki chat ID kiritilmagan' });
    const data = JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true });
    const req = https.request({
      hostname: 'api.telegram.org', path: `/bot${encodeURIComponent(token)}/sendMessage`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, timeout: 10000,
    }, (r) => {
      let body = '';
      r.on('data', (c) => (body += c));
      r.on('end', () => { try { const j = JSON.parse(body); resolve(j.ok ? { ok: true } : { ok: false, error: j.description }); } catch { resolve({ ok: false, error: 'Telegram javobi noto\'g\'ri' }); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => { console.error('Telegram:', e.message); resolve({ ok: false, error: e.message }); });
    req.end(data);
  });
}
function orderTelegramText(o) {
  const lines = o.items.map((i) => `• ${escHtml(i.name)} × ${i.qty} = ${fmtMoney(i.price * i.qty)}`);
  return [
    `🛒 <b>Yangi buyurtma #${o.number}</b>`,
    ``,
    `👤 ${escHtml(o.customer.name)}`,
    `📞 ${o.customer.phone}${o.customer.phone2 ? ' / ' + o.customer.phone2 : ''}`,
    `🚚 ${o.delivery === 'delivery' ? 'Yetkazib berish: ' + escHtml([o.customer.city, o.customer.address].filter(Boolean).join(', ')) : "Do'kondan olib ketish"}`,
    o.customer.comment ? `💬 ${escHtml(o.customer.comment)}` : '',
    ``,
    ...lines,
    o.extras.map((e) => `• ${escHtml(e.name)} = ${fmtMoney(e.price)}`).join('\n'),
    ``,
    `💰 <b>Jami: ${fmtMoney(o.total)}</b> (kartaga to'langan, chek yuklangan)`,
  ].filter((l) => l !== '').join('\n');
}

// ---------- Ma'lumotlarni tozalash ----------
function publicSettings() {
  const { tgBotToken, tgChatId, ...rest } = db.settings;
  return rest;
}
function cleanImages(list) {
  return (Array.isArray(list) ? list : [])
    .filter((u) => typeof u === 'string' && (/^\/uploads\/[\w.-]+$/.test(u) || /^https:\/\/[^\s"'<>]+$/.test(u)))
    .slice(0, 12);
}
function productFrom(b, prev = {}) {
  const name = str(b.name, 200);
  if (name.length < 2) fail(400, 'Mahsulot nomini kiriting');
  if (!db.categories.some((c) => c.id === b.categoryId)) fail(400, 'Kategoriyani tanlang');
  const price = int(b.price);
  if (!price) fail(400, 'Narxni kiriting');
  const stockRaw = String(b.stock ?? '').trim();
  return {
    ...prev,
    name, price,
    categoryId: b.categoryId,
    oldPrice: int(b.oldPrice),
    stock: stockRaw === '' ? null : Math.max(0, Math.round(Number(stockRaw)) || 0),
    images: cleanImages(b.images),
    brand: str(b.brand, 60),
    description: str(b.description, 5000),
    specs: str(b.specs, 5000),
    featured: !!b.featured,
    active: b.active !== false,
  };
}
function deliveryFeeFor(delivery, subtotal) {
  if (delivery !== 'delivery') return 0;
  const s = db.settings;
  if (s.freeDeliveryFrom > 0 && subtotal >= s.freeDeliveryFrom) return 0;
  return s.deliveryFee || 0;
}

// ---------- API ----------
async function handleApi(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  // --- Ochiq (mijozlar uchun) ---
  if (p === '/api/shop' && m === 'GET') {
    return send(res, 200, {
      settings: publicSettings(),
      categories: [...db.categories].sort((a, b) => a.sort - b.sort),
      products: db.products.filter((x) => x.active),
    });
  }

  if (p === '/api/orders' && m === 'POST') {
    const b = await readBody(req);
    const c = b.customer || {};
    const name = str(c.name, 80);
    if (name.length < 2) fail(400, 'Ismingizni kiriting');
    const phone = normPhone(c.phone);
    if (!phone) fail(400, "Telefon raqam noto'g'ri. Ishlaydigan raqamni +998 XX XXX XX XX ko'rinishida kiriting");
    let phone2 = '';
    if (str(c.phone2, 30)) { phone2 = normPhone(c.phone2); if (!phone2) fail(400, "Qo'shimcha telefon raqam noto'g'ri"); }
    const delivery = b.delivery === 'delivery' ? 'delivery' : 'pickup';
    const city = str(c.city, 80);
    const address = str(c.address, 300);
    if (delivery === 'delivery' && address.length < 5) fail(400, "Yetkazib berish manzilini to'liq kiriting");

    const rawItems = Array.isArray(b.items) ? b.items.slice(0, 60) : [];
    const items = [];
    for (const it of rawItems) {
      const prod = db.products.find((x) => x.id === it.id && x.active);
      const qty = Math.min(99, Math.max(1, Math.round(Number(it.qty)) || 1));
      if (!prod) fail(400, "Savatdagi ba'zi mahsulotlar endi mavjud emas. Savatni yangilang.");
      const existing = items.find((x) => x.productId === prod.id);
      if (existing) { existing.qty += qty; continue; }
      items.push({ productId: prod.id, name: prod.name, price: prod.price, qty, image: prod.images[0] || '' });
    }
    if (!items.length) fail(400, "Savat bo'sh");
    for (const it of items) {
      const prod = db.products.find((x) => x.id === it.productId);
      if (prod.stock !== null && prod.stock !== undefined && it.qty > prod.stock) {
        fail(400, `"${prod.name}" omborda ${prod.stock} dona qolgan`);
      }
    }
    if (!b.receipt) fail(400, "To'lov chekini (skrinshot) yuklang");
    rateLimit('order:' + clientIp(req), 8, 3600 * 1000);

    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const extras = [];
    if (b.assembly && db.settings.assemblyFee > 0) extras.push({ name: "PC yig'ish xizmati", price: db.settings.assemblyFee });
    const dFee = deliveryFeeFor(delivery, subtotal);
    if (dFee) extras.push({ name: 'Yetkazib berish', price: dFee });
    const receipt = saveDataUrl(b.receipt);

    for (const it of items) {
      const prod = db.products.find((x) => x.id === it.productId);
      if (prod.stock !== null && prod.stock !== undefined) prod.stock -= it.qty;
    }
    db.meta.lastOrderNo += 1;
    const order = {
      id: newId(),
      number: db.meta.lastOrderNo,
      createdAt: Date.now(),
      status: 'new',
      customer: { name, phone, phone2, city, address, comment: str(c.comment, 1000) },
      delivery,
      items, extras,
      subtotal,
      total: subtotal + extras.reduce((s, e) => s + e.price, 0),
      receipt,
      adminNote: '',
      history: [{ status: 'new', at: Date.now() }],
    };
    db.orders.unshift(order);
    save();
    notifyTelegram(orderTelegramText(order));
    return send(res, 201, { number: order.number, total: order.total });
  }

  if (p === '/api/orders/track' && m === 'GET') {
    rateLimit('track:' + clientIp(req), 30, 600 * 1000);
    const num = Number(url.searchParams.get('number'));
    const phone = normPhone(url.searchParams.get('phone'));
    const o = db.orders.find((x) => x.number === num);
    if (!o || !phone || o.customer.phone !== phone) fail(404, 'Buyurtma topilmadi. Raqam va telefonni tekshiring.');
    return send(res, 200, {
      number: o.number, createdAt: o.createdAt, status: o.status, statusName: STATUS_NAMES[o.status],
      total: o.total, items: o.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })), extras: o.extras,
    });
  }

  // --- Admin ---
  if (p === '/api/admin/login' && m === 'POST') {
    rateLimit('login:' + clientIp(req), 10, 15 * 60 * 1000);
    const b = await readBody(req);
    if (!verifyPassword(b.password, db.admin.passwordHash)) fail(401, "Parol noto'g'ri");
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_TTL);
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    return send(res, 200, { ok: true }, {
      'Set-Cookie': `mp_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}${secure}`,
    });
  }
  if (p === '/api/admin/logout' && m === 'POST') {
    sessions.delete(parseCookies(req).mp_admin);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'mp_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }

  if (!p.startsWith('/api/admin/')) fail(404, 'Topilmadi');
  if (!isAdmin(req)) fail(401, 'Avval tizimga kiring');

  if (p === '/api/admin/data' && m === 'GET') {
    return send(res, 200, {
      settings: db.settings,
      categories: [...db.categories].sort((a, b) => a.sort - b.sort),
      products: db.products,
      orders: db.orders,
      usingDefaultPassword: verifyPassword('admin123', db.admin.passwordHash),
    });
  }
  if (p === '/api/admin/orders' && m === 'GET') return send(res, 200, { orders: db.orders });

  if (p === '/api/admin/upload' && m === 'POST') {
    const b = await readBody(req);
    return send(res, 201, { url: saveDataUrl(b.dataUrl) });
  }

  // Mahsulotlar
  if (p === '/api/admin/products' && m === 'POST') {
    const prod = productFrom(await readBody(req), { id: newId(), createdAt: Date.now() });
    db.products.unshift(prod); save();
    return send(res, 201, prod);
  }
  let mm = /^\/api\/admin\/products\/([\w-]+)$/.exec(p);
  if (mm) {
    const idx = db.products.findIndex((x) => x.id === mm[1]);
    if (idx < 0) fail(404, 'Mahsulot topilmadi');
    if (m === 'PUT') { db.products[idx] = productFrom(await readBody(req), db.products[idx]); save(); return send(res, 200, db.products[idx]); }
    if (m === 'DELETE') { db.products.splice(idx, 1); save(); return send(res, 200, { ok: true }); }
  }

  // Kategoriyalar
  if (p === '/api/admin/categories' && m === 'POST') {
    const b = await readBody(req);
    const name = str(b.name, 80);
    if (name.length < 2) fail(400, 'Kategoriya nomini kiriting');
    const cat = { id: newId(), name, icon: str(b.icon, 30) || 'box', color: str(b.color, 20) || 'blue', pcPart: !!b.pcPart, sort: Number(b.sort) || db.categories.length + 1 };
    db.categories.push(cat); save();
    return send(res, 201, cat);
  }
  mm = /^\/api\/admin\/categories\/([\w-]+)$/.exec(p);
  if (mm) {
    const cat = db.categories.find((x) => x.id === mm[1]);
    if (!cat) fail(404, 'Kategoriya topilmadi');
    if (m === 'PUT') {
      const b = await readBody(req);
      const name = str(b.name, 80);
      if (name.length < 2) fail(400, 'Kategoriya nomini kiriting');
      Object.assign(cat, { name, icon: str(b.icon, 30) || 'box', color: str(b.color, 20) || 'blue', pcPart: !!b.pcPart, sort: Number(b.sort) || 0 });
      save(); return send(res, 200, cat);
    }
    if (m === 'DELETE') {
      const n = db.products.filter((x) => x.categoryId === cat.id).length;
      if (n) fail(400, `Bu kategoriyada ${n} ta mahsulot bor. Avval ularni boshqa kategoriyaga o'tkazing yoki o'chiring.`);
      db.categories = db.categories.filter((x) => x !== cat); save();
      return send(res, 200, { ok: true });
    }
  }

  // Buyurtmalar
  mm = /^\/api\/admin\/orders\/([\w-]+)$/.exec(p);
  if (mm) {
    const o = db.orders.find((x) => x.id === mm[1]);
    if (!o) fail(404, 'Buyurtma topilmadi');
    if (m === 'PUT') {
      const b = await readBody(req);
      if (b.status && STATUSES.includes(b.status) && b.status !== o.status) {
        // Bekor qilinsa — mahsulotlar omborga qaytariladi, qayta tiklansa — yana ayiriladi
        const delta = b.status === 'cancelled' ? 1 : o.status === 'cancelled' ? -1 : 0;
        if (delta) {
          for (const it of o.items) {
            const prod = db.products.find((x) => x.id === it.productId);
            if (prod && prod.stock !== null && prod.stock !== undefined) prod.stock = Math.max(0, prod.stock + delta * it.qty);
          }
        }
        o.status = b.status;
        (o.history ||= []).push({ status: b.status, at: Date.now() });
      }
      if (b.adminNote !== undefined) o.adminNote = str(b.adminNote, 2000);
      save(); return send(res, 200, o);
    }
    if (m === 'DELETE') { db.orders = db.orders.filter((x) => x !== o); save(); return send(res, 200, { ok: true }); }
  }

  // Sozlamalar
  if (p === '/api/admin/settings' && m === 'PUT') {
    const b = await readBody(req);
    const s = db.settings;
    const textKeys = ['shopName', 'tagline', 'phone', 'address', 'workHours', 'telegram', 'instagram', 'cardNumber', 'cardHolder', 'cardBank', 'paymentNote', 'deliveryNote', 'heroTitle', 'heroText', 'wholesaleText', 'tgBotToken', 'tgChatId'];
    for (const k of textKeys) if (b[k] !== undefined) s[k] = str(b[k], 1000);
    for (const k of ['deliveryFee', 'freeDeliveryFrom', 'assemblyFee']) if (b[k] !== undefined) s[k] = int(b[k]);
    for (const k of ['telegram', 'instagram']) if (s[k] && !/^https?:\/\//.test(s[k])) s[k] = 'https://' + s[k];
    save(); return send(res, 200, s);
  }
  if (p === '/api/admin/password' && m === 'POST') {
    const b = await readBody(req);
    if (!verifyPassword(b.current, db.admin.passwordHash)) fail(400, "Joriy parol noto'g'ri");
    if (String(b.next || '').length < 6) fail(400, "Yangi parol kamida 6 belgidan iborat bo'lsin");
    db.admin.passwordHash = hashPassword(b.next); save();
    return send(res, 200, { ok: true });
  }
  if (p === '/api/admin/telegram-test' && m === 'POST') {
    const b = await readBody(req);
    const r = await notifyTelegram(`✅ ${escHtml(db.settings.shopName)}: Telegram bildirishnomalar ishlayapti!`, { tgBotToken: str(b.tgBotToken, 200), tgChatId: str(b.tgChatId, 100) });
    if (!r.ok) fail(400, 'Telegram xatosi: ' + r.error);
    return send(res, 200, { ok: true });
  }

  fail(404, 'Topilmadi');
}

// ---------- Statik fayllar ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
function serveFile(res, base, rel) {
  const file = path.resolve(base, '.' + path.posix.normalize('/' + rel));
  if (!file.startsWith(base + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Topilmadi'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': base === UPLOAD_DIR ? 'public, max-age=31536000' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname.startsWith('/uploads/')) return serveFile(res, UPLOAD_DIR, decodeURIComponent(url.pathname.slice('/uploads/'.length)));
    if (url.pathname === '/admin' || url.pathname === '/admin/') return serveFile(res, PUBLIC_DIR, 'admin.html');
    if (url.pathname === '/') return serveFile(res, PUBLIC_DIR, 'index.html');
    return serveFile(res, PUBLIC_DIR, decodeURIComponent(url.pathname.slice(1)));
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.code, { error: e.message });
    console.error(e);
    return send(res, 500, { error: 'Server xatosi' });
  }
});

server.listen(PORT, () => {
  console.log(`MobilePlus do'koni ishlayapti:  http://localhost:${PORT}`);
  console.log(`Admin panel:                    http://localhost:${PORT}/admin`);
});
