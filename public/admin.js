'use strict';
// MobilePlus — do'kon egasi uchun admin panel

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm";
const fmtDate = (t) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const STATUS = {
  new: 'Yangi',
  confirmed: "To'lov tasdiqlandi",
  shipping: "Yo'lda",
  done: 'Yetkazildi',
  cancelled: 'Bekor qilindi',
};
const pill = (s) => `<span class="pill st-${s}">${STATUS[s] || s}</span>`;
const view = $('#view');
const I = (name) => Icons.svg(name);
const T = (name, color, size) => Icons.tile(name, color, size);

let D = { settings: {}, categories: [], products: [], orders: [] };
let orderFilter = 'all';
let orderSearch = '';
let productSearch = '';
let productCat = '';
let lastSeenOrderNo = 0;

// ---------- Yordamchilar ----------
async function api(path, method = 'GET', body) {
  const r = await fetch(path, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/api/admin/login') { showLogin(); throw new Error(d.error || 'Avval tizimga kiring'); }
  if (!r.ok) throw new Error(d.error || 'Xatolik yuz berdi');
  return d;
}
function toast(msg, isError) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.className = 'toast'), 2800);
}
const catById = (id) => D.categories.find((c) => c.id === id);
function thumb(p) {
  return `<div class="thumb">${p.images?.[0] ? `<img src="${esc(p.images[0])}" alt="">` : Icons.catTile(catById(p.categoryId), 'sm')}</div>`;
}
function openModal(html) {
  $('#modalBox').innerHTML = html;
  $('#modal').hidden = false;
  document.body.style.overflow = 'hidden';
  $$('[data-close]', $('#modalBox')).forEach((b) => (b.onclick = closeModal));
}
function closeModal() { $('#modal').hidden = true; document.body.style.overflow = ''; }
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

function compressImage(file, maxSide = 1600) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Faqat rasm fayllari'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Faylni o'qib bo'lmadi"));
    reader.onload = () => {
      const im = new Image();
      im.onerror = () => reject(new Error("Rasmni o'qib bo'lmadi"));
      im.onload = () => {
        const k = Math.min(1, maxSide / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.88));
      };
      im.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18].forEach((d) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.2, ctx.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d + 0.15);
      o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.16);
    });
  } catch {}
}
function updateBadge() {
  const n = D.orders.filter((o) => o.status === 'new').length;
  $('#newBadge').textContent = n;
  $('#newBadge').hidden = n === 0;
  document.title = (n ? `(${n}) ` : '') + 'Admin panel — ' + (D.settings.shopName || 'MobilePlus');
}

// ---------- Kirish ----------
function showLogin() {
  $('#shell').hidden = true;
  $('#login').hidden = false;
  clearInterval(pollTimer);
}
$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  $('#loginErr').textContent = '';
  try {
    await api('/api/admin/login', 'POST', { password: e.target.password.value });
    e.target.reset();
    start();
  } catch (err) { $('#loginErr').textContent = err.message; }
};
$('#logoutBtn').onclick = async () => { await api('/api/admin/logout', 'POST').catch(() => {}); showLogin(); };

let pollTimer;
async function start() {
  try { D = await api('/api/admin/data'); } catch { return; }
  $('#login').hidden = true;
  $('#shell').hidden = false;
  $('#shopName').textContent = D.settings.shopName;
  $('#pwWarn').hidden = !D.usingDefaultPassword;
  lastSeenOrderNo = Math.max(0, ...D.orders.map((o) => o.number));
  updateBadge();
  route();
  clearInterval(pollTimer);
  pollTimer = setInterval(poll, 15000);
}

// Yangi buyurtmalarni har 15 soniyada tekshirish
async function poll() {
  try {
    const { orders } = await api('/api/admin/orders');
    const maxNo = Math.max(0, ...orders.map((o) => o.number));
    const fresh = orders.filter((o) => o.number > lastSeenOrderNo);
    D.orders = orders;
    updateBadge();
    if (fresh.length) {
      lastSeenOrderNo = maxNo;
      beep();
      toast(`Yangi buyurtma #${fresh[0].number} — ${fresh[0].customer.name}, ${money(fresh[0].total)}`);
      const v = currentView();
      if ($('#modal').hidden && (v === 'orders' || v === 'dashboard')) route();
    }
  } catch {}
}

// ---------- Router ----------
const currentView = () => (location.hash.slice(1) || 'dashboard').split('/')[0];
function route() {
  const v = currentView();
  $$('#sideNav a').forEach((a) => a.classList.toggle('active', a.dataset.v === v));
  window.scrollTo(0, 0);
  ({ dashboard: renderDashboard, orders: renderOrders, products: renderProducts, categories: renderCategories, settings: renderSettings }[v] || renderDashboard)();
}
window.addEventListener('hashchange', () => { if (!$('#shell').hidden) route(); });

// ---------- Bosh sahifa ----------
function renderDashboard() {
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(dayStart); monthStart.setDate(1);
  const paid = D.orders.filter((o) => ['confirmed', 'shipping', 'done'].includes(o.status));
  const today = D.orders.filter((o) => o.createdAt >= dayStart.getTime());
  const monthRevenue = paid.filter((o) => o.createdAt >= monthStart.getTime()).reduce((s, o) => s + o.total, 0);
  const newOrders = D.orders.filter((o) => o.status === 'new');
  const lowStock = D.products.filter((p) => p.stock != null && p.stock <= 3).sort((a, b) => a.stock - b.stock);
  const sold = {};
  paid.forEach((o) => o.items.forEach((i) => (sold[i.name] = (sold[i.name] || 0) + i.qty)));
  const top = Object.entries(sold).sort((a, b) => b[1] - a[1]).slice(0, 6);
  view.innerHTML = `
    <div class="page-head"><h1>Bosh sahifa</h1><a href="#products" class="btn btn-primary" id="quickAdd">${I('plus')} Mahsulot qo'shish</a></div>
    <div class="stats">
      <div class="stat hot">${T('bell', 'red', 'sm')}<small>Yangi buyurtmalar (lead)</small><b>${newOrders.length}</b></div>
      <div class="stat">${T('receipt', 'blue', 'sm')}<small>Bugungi buyurtmalar</small><b>${today.length}</b></div>
      <div class="stat">${T('chart', 'green', 'sm')}<small>Shu oy tushum</small><b>${money(monthRevenue)}</b></div>
      <div class="stat">${T('box', 'orange', 'sm')}<small>Mahsulotlar</small><b>${D.products.length}</b></div>
    </div>
    <div class="dash">
      <div class="card">
        <div class="page-head" style="margin-bottom:10px"><h3 style="margin:0">So'nggi buyurtmalar</h3><a href="#orders" class="btn btn-sm">Barchasi →</a></div>
        ${D.orders.length ? ordersTable(D.orders.slice(0, 8), true) : `<div class="empty"><div>${T('receipt', 'gray', 'lg')}</div>Hozircha buyurtmalar yo'q</div>`}
      </div>
      <div>
        <div class="card"><h3 class="h-ico">${T('alert', 'yellow', 'xs')} Kam qolgan tovarlar</h3>
          ${lowStock.length ? lowStock.slice(0, 8).map((p) => `<div class="line" style="padding:8px 0;border:0"><div class="grow">${esc(p.name)}</div><span class="tag ${p.stock === 0 ? 'red' : ''}">${p.stock} dona</span></div>`).join('') : '<p class="muted" style="margin:0">Hammasi yetarli</p>'}
        </div>
        <div class="card"><h3 class="h-ico">${T('trophy', 'orange', 'xs')} Ko'p sotilganlar</h3>
          ${top.length ? top.map(([n, q]) => `<div class="line" style="padding:8px 0;border:0"><div class="grow">${esc(n)}</div><b>${q} ta</b></div>`).join('') : '<p class="muted" style="margin:0">Tasdiqlangan buyurtmalar paydo bo\'lganda ko\'rinadi</p>'}
        </div>
      </div>
    </div>`;
  bindOrderRows();
  $('#quickAdd').onclick = (e) => { e.preventDefault(); location.hash = 'products'; setTimeout(() => productForm(), 0); };
}

// ---------- Buyurtmalar ----------
function ordersTable(list, compact) {
  return `<div class="table-wrap" style="${compact ? 'border:0' : ''}"><table>
    <thead><tr><th>№</th><th>Mijoz</th><th>Telefon</th>${compact ? '' : '<th class="hide-sm">Tovarlar</th><th class="hide-sm">Qabul</th>'}<th>Summa</th><th>Holat</th><th class="hide-sm">Sana</th></tr></thead>
    <tbody>${list.map((o) => `
      <tr class="click ${o.status === 'new' ? 'is-new' : ''}" data-order="${o.id}">
        <td><b>#${o.number}</b></td>
        <td>${esc(o.customer.name)}</td>
        <td class="nowrap">${esc(o.customer.phone)}</td>
        ${compact ? '' : `<td class="hide-sm">${o.items.reduce((s, i) => s + i.qty, 0)} ta</td><td class="hide-sm">${o.delivery === 'delivery' ? `${I('truck')} Yetkazish` : `${I('store')} Olib ketish`}</td>`}
        <td class="nowrap"><b>${money(o.total)}</b></td>
        <td>${pill(o.status)}</td>
        <td class="nowrap muted hide-sm">${fmtDate(o.createdAt)}</td>
      </tr>`).join('')}</tbody></table></div>`;
}
function bindOrderRows() {
  $$('[data-order]').forEach((tr) => (tr.onclick = () => orderModal(tr.dataset.order)));
}
function renderOrders() {
  const counts = { all: D.orders.length };
  Object.keys(STATUS).forEach((s) => (counts[s] = D.orders.filter((o) => o.status === s).length));
  const q = orderSearch.toLowerCase().replace(/\s/g, '');
  const list = D.orders.filter((o) => (orderFilter === 'all' || o.status === orderFilter) &&
    (!q || `${o.number}${o.customer.name}${o.customer.phone}${o.customer.phone2}`.toLowerCase().replace(/\s/g, '').includes(q)));
  view.innerHTML = `
    <div class="page-head"><h1>Buyurtmalar</h1><button class="btn" id="csvBtn">${I('download')} Excel (CSV)</button></div>
    <div class="filters">
      ${[['all', 'Barchasi'], ...Object.entries(STATUS)].map(([k, n]) => `<button class="fchip ${orderFilter === k ? 'active' : ''}" data-f="${k}">${n}<em>${counts[k]}</em></button>`).join('')}
      <input class="input" id="oSearch" placeholder="Raqam, ism yoki telefon bo'yicha qidirish" value="${esc(orderSearch)}">
    </div>
    ${list.length ? ordersTable(list) : `<div class="card empty"><div>${T('receipt', 'gray', 'lg')}</div>Buyurtmalar topilmadi</div>`}`;
  bindOrderRows();
  $$('[data-f]').forEach((b) => (b.onclick = () => { orderFilter = b.dataset.f; renderOrders(); }));
  const s = $('#oSearch');
  s.oninput = () => { orderSearch = s.value; renderOrders(); const n = $('#oSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  $('#csvBtn').onclick = () => exportCsv(list);
}
function exportCsv(list) {
  const rows = [['Raqam', 'Sana', 'Holat', 'Ism', 'Telefon', "Qo'shimcha telefon", 'Qabul', 'Shahar', 'Manzil', 'Tovarlar', 'Summa', 'Izoh']];
  list.forEach((o) => rows.push([o.number, fmtDate(o.createdAt), STATUS[o.status], o.customer.name, o.customer.phone, o.customer.phone2,
    o.delivery === 'delivery' ? 'Yetkazish' : 'Olib ketish', o.customer.city, o.customer.address,
    o.items.map((i) => `${i.name} x${i.qty}`).join('; '), o.total, o.adminNote]));
  const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `buyurtmalar-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function orderModal(id) {
  const o = D.orders.find((x) => x.id === id);
  if (!o) return;
  const c = o.customer;
  const digits = (p) => String(p).replace(/[^\d+]/g, '');
  const phoneBlock = (p) => `<b>${esc(p)}</b><div class="call">
      <a class="btn btn-sm btn-primary" href="tel:${digits(p)}">${I('phone')} Qo'ng'iroq</a>
      <a class="btn btn-sm" href="https://t.me/${digits(p)}" target="_blank" rel="noopener">${I('send')} Telegram</a>
      <button class="btn btn-sm" data-copy="${esc(p)}" title="Nusxalash">${I('copy')}</button></div>`;
  openModal(`
    <div class="modal-head"><h2>Buyurtma #${o.number} ${pill(o.status)}</h2><button class="x" data-close>✕</button></div>
    <div class="info">
      <div><small>Mijoz</small><b>${esc(c.name)}</b></div>
      <div><small>Sana</small><b>${fmtDate(o.createdAt)}</b></div>
      <div><small>Telefon</small>${phoneBlock(c.phone)}</div>
      ${c.phone2 ? `<div><small>Qo'shimcha telefon</small>${phoneBlock(c.phone2)}</div>` : ''}
      <div><small>Qabul qilish</small><b>${o.delivery === 'delivery' ? 'Yetkazib berish' : "Do'kondan olib ketish"}</b>
        ${o.delivery === 'delivery' ? `<div>${esc([c.city, c.address].filter(Boolean).join(', '))}</div>` : ''}</div>
      ${c.comment ? `<div><small>Mijoz izohi</small><b>${esc(c.comment)}</b></div>` : ''}
    </div>
    <div class="lines">
      ${o.items.map((i) => `<div class="line"><div class="thumb">${i.image ? `<img src="${esc(i.image)}" alt="">` : I('box')}</div>
        <div class="grow">${esc(i.name)}<div class="muted">${money(i.price)} × ${i.qty}</div></div><b class="nowrap">${money(i.price * i.qty)}</b></div>`).join('')}
      ${(o.extras || []).map((x) => `<div class="line"><div class="grow">${esc(x.name)}</div><b class="nowrap">${money(x.price)}</b></div>`).join('')}
      <div class="line total"><div class="grow">Jami (kartaga to'langan)</div><span class="nowrap">${money(o.total)}</span></div>
    </div>
    <div class="order-grid">
      <div>
        <label class="field"><span>Holat</span>
          <select class="input" id="oStatus">${Object.entries(STATUS).map(([k, n]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field"><span>Admin izohi (mijoz ko'rmaydi)</span>
          <textarea class="input" id="oNote" rows="3" placeholder="Masalan: to'lov tekshirildi, ertaga yetkaziladi">${esc(o.adminNote)}</textarea></label>
        <div class="history">${(o.history || []).map((h) => `${fmtDate(h.at)} — ${STATUS[h.status]}`).join('<br>')}</div>
      </div>
      <div><span class="field"><span>To'lov cheki</span></span>
        ${o.receipt ? `<a class="receipt" href="${esc(o.receipt)}" target="_blank" rel="noopener"><img src="${esc(o.receipt)}" alt="Chek"></a><small class="muted">Kattalashtirish uchun bosing</small>` : '<p class="muted">Chek yo\'q</p>'}
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-danger left" id="oDel">${I('trash')} O'chirish</button>
      <button class="btn" data-close>Yopish</button>
      <button class="btn btn-primary" id="oSave">Saqlash</button>
    </div>`);
  $$('[data-copy]').forEach((b) => (b.onclick = () => navigator.clipboard?.writeText(b.dataset.copy).then(() => toast('Nusxalandi'))));
  $('#oSave').onclick = async () => {
    try {
      const upd = await api(`/api/admin/orders/${o.id}`, 'PUT', { status: $('#oStatus').value, adminNote: $('#oNote').value });
      Object.assign(o, upd);
      if (upd.status !== 'new') await refreshProducts();
      toast('✓ Saqlandi'); closeModal(); updateBadge(); route();
    } catch (e) { toast(e.message, true); }
  };
  $('#oDel').onclick = async () => {
    if (!confirm(`#${o.number} buyurtmani butunlay o'chirasizmi?`)) return;
    try {
      await api(`/api/admin/orders/${o.id}`, 'DELETE');
      D.orders = D.orders.filter((x) => x !== o);
      toast("✓ O'chirildi"); closeModal(); updateBadge(); route();
    } catch (e) { toast(e.message, true); }
  };
}
async function refreshProducts() {
  try { const d = await api('/api/admin/data'); D.products = d.products; } catch {}
}

// ---------- Mahsulotlar ----------
function renderProducts() {
  const q = productSearch.toLowerCase();
  const list = D.products.filter((p) => (!productCat || p.categoryId === productCat) && (!q || `${p.name} ${p.brand}`.toLowerCase().includes(q)));
  view.innerHTML = `
    <div class="page-head"><h1>Mahsulotlar <span class="muted" style="font-size:16px">${D.products.length}</span></h1>
      <button class="btn btn-primary" id="addProd">+ Mahsulot qo'shish</button></div>
    <div class="filters">
      <select class="input" id="pCat" style="max-width:240px;margin-left:0">
        <option value="">Barcha kategoriyalar</option>
        ${D.categories.map((c) => `<option value="${c.id}" ${c.id === productCat ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}
      </select>
      <input class="input" id="pSearch" placeholder="Nomi yoki brend bo'yicha qidirish" value="${esc(productSearch)}">
    </div>
    ${list.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Mahsulot</th><th class="hide-sm">Kategoriya</th><th>Narx</th><th>Ombor</th><th class="hide-sm">Holat</th><th></th></tr></thead>
      <tbody>${list.map((p) => `<tr>
        <td><div class="pname">${thumb(p)}<div><b>${esc(p.name)}</b><small class="muted">${esc(p.brand)}</small></div></div></td>
        <td class="hide-sm">${esc(catById(p.categoryId)?.name || '—')}</td>
        <td class="nowrap"><b>${money(p.price)}</b>${p.oldPrice > p.price ? `<br><s class="muted">${money(p.oldPrice)}</s>` : ''}</td>
        <td>${p.stock == null ? '<span class="tag">∞</span>' : `<span class="tag ${p.stock <= 0 ? 'red' : ''}">${p.stock} dona</span>`}</td>
        <td class="hide-sm">${p.active ? '<span class="tag" style="background:#e5f7ec;color:#15803d">Saytda</span>' : '<span class="tag">Yashirin</span>'} ${p.featured ? `<span class="tag red">${I('flame')} Top</span>` : ''}</td>
        <td><div class="actions"><button class="btn btn-sm" data-edit="${p.id}" title="Tahrirlash">${I('pencil')}</button><button class="btn btn-sm btn-danger" data-del="${p.id}" title="O'chirish">${I('trash')}</button></div></td>
      </tr>`).join('')}</tbody></table></div>` : `<div class="card empty"><div>${T('box', 'gray', 'lg')}</div>Mahsulot topilmadi</div>`}`;
  $('#addProd').onclick = () => productForm();
  $('#pCat').onchange = (e) => { productCat = e.target.value; renderProducts(); };
  const s = $('#pSearch');
  s.oninput = () => { productSearch = s.value; renderProducts(); const n = $('#pSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  $$('[data-edit]').forEach((b) => (b.onclick = () => productForm(D.products.find((p) => p.id === b.dataset.edit))));
  $$('[data-del]').forEach((b) => (b.onclick = async () => {
    const p = D.products.find((x) => x.id === b.dataset.del);
    if (!confirm(`"${p.name}" mahsulotini o'chirasizmi?`)) return;
    try { await api(`/api/admin/products/${p.id}`, 'DELETE'); D.products = D.products.filter((x) => x !== p); toast("✓ O'chirildi"); renderProducts(); }
    catch (e) { toast(e.message, true); }
  }));
}

function productForm(p) {
  const isNew = !p;
  p = p || { name: '', categoryId: productCat || D.categories[0]?.id, price: '', oldPrice: '', stock: '', images: [], brand: '', description: '', specs: '', featured: false, active: true };
  let images = [...(p.images || [])];
  openModal(`
    <div class="modal-head"><h2>${isNew ? "Yangi mahsulot" : 'Mahsulotni tahrirlash'}</h2><button class="x" data-close>✕</button></div>
    <form id="pForm">
      <div class="field"><span>Rasmlar</span><div class="imgs" id="imgs"></div><small>Birinchi rasm — asosiy. Bir nechta rasmni birdan tanlash mumkin.</small></div>
      <label class="field"><span>Nomi *</span><input class="input" name="name" required value="${esc(p.name)}" placeholder="Masalan: Logitech G Pro X Superlight 2"></label>
      <div class="grid2">
        <label class="field"><span>Kategoriya *</span><select class="input" name="categoryId">${D.categories.map((c) => `<option value="${c.id}" ${c.id === p.categoryId ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Brend</span><input class="input" name="brand" value="${esc(p.brand)}" placeholder="Logitech"></label>
      </div>
      <div class="grid3">
        <label class="field"><span>Narx (so'm) *</span><input class="input" name="price" inputmode="numeric" required value="${esc(p.price)}" placeholder="250000"></label>
        <label class="field"><span>Eski narx (chegirma)</span><input class="input" name="oldPrice" inputmode="numeric" value="${esc(p.oldPrice || '')}" placeholder="300000"></label>
        <label class="field"><span>Omborda (dona)</span><input class="input" name="stock" inputmode="numeric" value="${p.stock == null ? '' : esc(p.stock)}" placeholder="Bo'sh = cheksiz"></label>
      </div>
      <label class="field"><span>Tavsif</span><textarea class="input" name="description" rows="3" placeholder="Mahsulot haqida qisqacha">${esc(p.description)}</textarea></label>
      <label class="field"><span>Xususiyatlari</span><textarea class="input" name="specs" rows="5" placeholder="Har qatorda bitta: Nomi: qiymati&#10;Ulanish: Bluetooth 5.3&#10;Vazni: 60 g">${esc(p.specs)}</textarea>
        <small>Har bir qatorga "Nomi: qiymati" ko'rinishida yozing — saytda jadval bo'lib chiqadi.</small></label>
      <label class="chk"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}> ${I('flame')} Bosh sahifada "Ommabop" bo'limida ko'rsatish</label>
      <label class="chk"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Saytda ko'rinsin (o'chirilsa — yashiriladi)</label>
      <div class="err" id="pErr"></div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Bekor qilish</button><button class="btn btn-primary" id="pSave">Saqlash</button></div>
    </form>`);

  const drawImages = () => {
    $('#imgs').innerHTML = images.map((u, i) => `
      <div class="img-item"><img src="${esc(u)}" alt="">${i === 0 ? '<span class="main">Asosiy</span>' : ''}
        <div class="ctrl">${i > 0 ? `<button type="button" data-main="${i}" title="Asosiy qilish">${I('star')}</button>` : '<span></span>'}<button type="button" data-rm="${i}" title="Olib tashlash">${I('x')}</button></div></div>`).join('') +
      `<label class="img-add"><input type="file" accept="image/*" multiple id="imgInput"><span>${I('image')}<br>Rasm qo'shish</span></label>`;
    $$('[data-rm]').forEach((b) => (b.onclick = () => { images.splice(Number(b.dataset.rm), 1); drawImages(); }));
    $$('[data-main]').forEach((b) => (b.onclick = () => { const [x] = images.splice(Number(b.dataset.main), 1); images.unshift(x); drawImages(); }));
    $('#imgInput').onchange = async (e) => {
      const files = [...e.target.files];
      const label = $('.img-add span');
      for (let k = 0; k < files.length; k++) {
        label.innerHTML = `Yuklanmoqda<br>${k + 1}/${files.length}`;
        try {
          const dataUrl = await compressImage(files[k]);
          const { url } = await api('/api/admin/upload', 'POST', { dataUrl });
          images.push(url);
        } catch (err) { toast(err.message, true); }
      }
      drawImages();
    };
  };
  drawImages();

  $('#pForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = {
      name: f.name.value, categoryId: f.categoryId.value, brand: f.brand.value,
      price: f.price.value, oldPrice: f.oldPrice.value, stock: f.stock.value.replace(/\s/g, ''),
      description: f.description.value, specs: f.specs.value,
      featured: f.featured.checked, active: f.active.checked, images,
    };
    $('#pSave').disabled = true;
    try {
      const saved = await api(isNew ? '/api/admin/products' : `/api/admin/products/${p.id}`, isNew ? 'POST' : 'PUT', body);
      if (isNew) D.products.unshift(saved); else D.products[D.products.findIndex((x) => x.id === p.id)] = saved;
      toast('✓ Saqlandi'); closeModal(); if (currentView() === 'products') renderProducts();
    } catch (err) { $('#pErr').textContent = err.message; $('#pSave').disabled = false; }
  };
}

// ---------- Kategoriyalar ----------
function renderCategories() {
  const count = (id) => D.products.filter((p) => p.categoryId === id).length;
  view.innerHTML = `
    <div class="page-head"><h1>Kategoriyalar</h1><button class="btn btn-primary" id="addCat">+ Kategoriya qo'shish</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th></th><th>Nomi</th><th>Mahsulotlar</th><th class="hide-sm">PC konfigurator</th><th class="hide-sm">Tartib</th><th></th></tr></thead>
      <tbody>${D.categories.map((c) => `<tr>
        <td style="width:56px">${Icons.catTile(c, 'sm')}</td><td><b>${esc(c.name)}</b></td><td>${count(c.id)}</td>
        <td class="hide-sm">${c.pcPart ? '<span class="tag green">Ha</span>' : '—'}</td><td class="hide-sm">${c.sort}</td>
        <td><div class="actions"><button class="btn btn-sm" data-edit="${c.id}" title="Tahrirlash">${I('pencil')}</button><button class="btn btn-sm btn-danger" data-del="${c.id}" title="O'chirish">${I('trash')}</button></div></td>
      </tr>`).join('')}</tbody></table></div>
    <p class="muted">"PC konfigurator" belgilangan kategoriyalar (protsessor, videokarta va h.k.) saytdagi "PC yig'ish" sahifasida tanlov sifatida chiqadi.</p>`;
  $('#addCat').onclick = () => categoryForm();
  $$('[data-edit]').forEach((b) => (b.onclick = () => categoryForm(D.categories.find((c) => c.id === b.dataset.edit))));
  $$('[data-del]').forEach((b) => (b.onclick = async () => {
    const c = D.categories.find((x) => x.id === b.dataset.del);
    if (!confirm(`"${c.name}" kategoriyasini o'chirasizmi?`)) return;
    try { await api(`/api/admin/categories/${c.id}`, 'DELETE'); D.categories = D.categories.filter((x) => x !== c); toast("✓ O'chirildi"); renderCategories(); }
    catch (e) { toast(e.message, true); }
  }));
}
function categoryForm(c) {
  const isNew = !c;
  c = c || { name: '', icon: 'box', color: 'blue', pcPart: false, sort: D.categories.length + 1 };
  let [icon, color] = Icons.catIcon(c);
  openModal(`
    <div class="modal-head"><h2>${isNew ? 'Yangi kategoriya' : 'Kategoriyani tahrirlash'}</h2><button class="x" data-close>✕</button></div>
    <form id="cForm">
      <div class="cat-preview"><span id="cPrev"></span><label class="field" style="flex:1;margin:0"><span>Nomi *</span><input class="input" name="name" required value="${esc(c.name)}"></label></div>
      <div class="field"><span>Ikonka</span><div class="ico-picker" id="icoPick">${Icons.PICKABLE.map((n) => `<button type="button" data-pick="${n}" title="${n}">${I(n)}</button>`).join('')}</div></div>
      <div class="field"><span>Rang</span><div class="color-picker" id="colPick">${Object.entries(Icons.COLORS).map(([k, v]) => `<button type="button" data-col="${k}" title="${k}" style="background:linear-gradient(165deg,${v[0]},${v[1]})"></button>`).join('')}</div></div>
      <label class="field"><span>Tartib raqami</span><input class="input" name="sort" type="number" value="${esc(c.sort)}"><small>Kichik raqam — ro'yxatda yuqorida</small></label>
      <label class="chk"><input type="checkbox" name="pcPart" ${c.pcPart ? 'checked' : ''}> PC konfiguratorda qism sifatida ko'rsatish</label>
      <div class="err" id="cErr"></div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Bekor qilish</button><button class="btn btn-primary">Saqlash</button></div>
    </form>`);
  const drawPick = () => {
    $('#cPrev').innerHTML = T(icon, color, 'lg');
    $$('[data-pick]').forEach((b) => b.classList.toggle('active', b.dataset.pick === icon));
    $$('[data-col]').forEach((b) => b.classList.toggle('active', b.dataset.col === color));
  };
  $$('[data-pick]').forEach((b) => (b.onclick = () => { icon = b.dataset.pick; drawPick(); }));
  $$('[data-col]').forEach((b) => (b.onclick = () => { color = b.dataset.col; drawPick(); }));
  drawPick();
  $('#cForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = { name: f.name.value, icon, color, sort: f.sort.value, pcPart: f.pcPart.checked };
    try {
      const saved = await api(isNew ? '/api/admin/categories' : `/api/admin/categories/${c.id}`, isNew ? 'POST' : 'PUT', body);
      if (isNew) D.categories.push(saved); else Object.assign(c, saved);
      D.categories.sort((a, b) => a.sort - b.sort);
      toast('✓ Saqlandi'); closeModal(); renderCategories();
    } catch (err) { $('#cErr').textContent = err.message; }
  };
}

// ---------- Sozlamalar ----------
function renderSettings() {
  const s = D.settings;
  const inp = (k, label, extra = '') => `<label class="field"><span>${label}</span><input class="input" name="${k}" value="${esc(s[k])}" ${extra}></label>`;
  const area = (k, label, rows = 2) => `<label class="field"><span>${label}</span><textarea class="input" name="${k}" rows="${rows}">${esc(s[k])}</textarea></label>`;
  view.innerHTML = `
    <div class="page-head"><h1>Sozlamalar</h1></div>
    <form id="sForm">
      <div class="card"><h3 class="h-ico">${T('store', 'purple', 'sm')} Do'kon ma'lumotlari</h3>
        <div class="grid2">${inp('shopName', "Do'kon nomi")}${inp('tagline', 'Qisqa shior')}</div>
        <div class="grid2">${inp('phone', 'Telefon')}${inp('workHours', 'Ish vaqti')}</div>
        ${inp('address', 'Manzil')}
        <div class="grid2">${inp('telegram', 'Telegram kanal havolasi')}${inp('instagram', 'Instagram havolasi')}</div>
      </div>
      <div class="card"><h3 class="h-ico">${T('card', 'indigo', 'sm')} To'lov kartasi (mijozlar shu kartaga to'laydi)</h3>
        <div class="grid3">${inp('cardNumber', 'Karta raqami', 'placeholder="8600 1234 5678 9012"')}${inp('cardHolder', 'Karta egasi')}${inp('cardBank', 'Karta turi (Uzcard / Humo / Visa)')}</div>
        ${area('paymentNote', "To'lov sahifasidagi izoh")}
      </div>
      <div class="card"><h3 class="h-ico">${T('truck', 'blue', 'sm')} Yetkazib berish va xizmatlar</h3>
        <div class="grid3">${inp('deliveryFee', "Yetkazib berish narxi (so'm)", 'inputmode="numeric"')}${inp('freeDeliveryFrom', "Bepul yetkazish (so'm dan)", 'inputmode="numeric"')}${inp('assemblyFee', "PC yig'ish xizmati (so'm)", 'inputmode="numeric"')}</div>
        ${inp('deliveryNote', 'Yetkazib berish haqida qisqa matn')}
        <small class="muted">0 kiritilsa — bepul / o'chiq.</small>
      </div>
      <div class="card"><h3 class="h-ico">${T('home', 'orange', 'sm')} Bosh sahifa matnlari</h3>
        ${inp('heroTitle', 'Sarlavha')}${area('heroText', 'Matn')}${area('wholesaleText', 'Optom bo\'limi matni')}
      </div>
      <div class="card"><h3 class="h-ico">${T('send', 'teal', 'sm')} Telegram bildirishnomalar</h3>
        <p class="muted" style="margin-top:-6px">Har bir yangi buyurtma Telegramingizga ham darhol keladi.<br>
        1) Telegramda <b>@BotFather</b> → /newbot → bot yarating va tokenni oling.<br>
        2) Botingizga /start yozing, so'ng <b>@userinfobot</b> dan o'z ID raqamingizni oling (guruh uchun botni guruhga qo'shing).<br>
        3) Quyiga kiriting va "Sinab ko'rish" ni bosing.</p>
        <div class="grid2">${inp('tgBotToken', 'Bot token', 'placeholder="123456:ABC-DEF..." autocomplete="off"')}${inp('tgChatId', 'Chat ID', 'placeholder="123456789"')}</div>
        <button type="button" class="btn" id="tgTest">${I('send')} Sinab ko'rish</button>
      </div>
      <div style="position:sticky;bottom:0;padding:14px 0;background:linear-gradient(transparent,var(--bg) 30%)"><button class="btn btn-primary" style="padding:12px 28px">${I('check')} Sozlamalarni saqlash</button></div>
    </form>
    <form class="card" id="pwForm"><h3 class="h-ico">${T('lock', 'graphite', 'sm')} Admin parolini o'zgartirish</h3>
      <div class="grid3">
        <label class="field"><span>Joriy parol</span><input class="input" type="password" name="current" autocomplete="current-password" required></label>
        <label class="field"><span>Yangi parol</span><input class="input" type="password" name="next" autocomplete="new-password" minlength="6" required></label>
        <label class="field"><span>Yangi parol (takror)</span><input class="input" type="password" name="next2" autocomplete="new-password" required></label>
      </div>
      <button class="btn btn-primary">Parolni o'zgartirish</button>
    </form>`;
  $('#sForm').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try { D.settings = await api('/api/admin/settings', 'PUT', body); $('#shopName').textContent = D.settings.shopName; toast('✓ Sozlamalar saqlandi'); }
    catch (err) { toast(err.message, true); }
  };
  $('#tgTest').onclick = async () => {
    const f = $('#sForm');
    try { await api('/api/admin/telegram-test', 'POST', { tgBotToken: f.tgBotToken.value, tgChatId: f.tgChatId.value }); toast('✓ Xabar yuborildi — Telegramni tekshiring. Endi "Saqlash" ni bosing.'); }
    catch (err) { toast(err.message, true); }
  };
  $('#pwForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.next.value !== f.next2.value) return toast('Yangi parollar mos emas', true);
    try {
      await api('/api/admin/password', 'POST', { current: f.current.value, next: f.next.value });
      f.reset(); $('#pwWarn').hidden = true; toast("✓ Parol o'zgartirildi");
    } catch (err) { toast(err.message, true); }
  };
}

start();
