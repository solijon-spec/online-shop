'use strict';
// MobilePlus — mijozlar uchun do'kon (hash-router asosidagi SPA)

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm";
const app = $('#app');

let S = { settings: {}, categories: [], products: [] };
let cart = loadCart();

// ---------- Savat ----------
function loadCart() {
  try {
    const c = JSON.parse(localStorage.getItem('mp_cart'));
    if (c && Array.isArray(c.items)) return c;
  } catch {}
  return { items: [], assembly: false };
}
function saveCart() {
  try { localStorage.setItem('mp_cart', JSON.stringify(cart)); } catch {}
  updateCartBadge();
}
function cleanCart() {
  cart.items = cart.items.filter((i) => S.products.some((p) => p.id === i.id));
  if (!cart.items.length) cart.assembly = false;
  saveCart();
}
function updateCartBadge() {
  const n = cart.items.reduce((s, i) => s + i.qty, 0);
  const el = $('#cartCount');
  el.textContent = n;
  el.classList.toggle('zero', n === 0);
}
function addToCart(id, qty = 1, silent, fromEl) {
  const p = prodById(id);
  if (!p) return;
  const it = cart.items.find((i) => i.id === id);
  const cur = it ? it.qty : 0;
  const max = p.stock == null ? 99 : p.stock;
  if (cur + qty > max) return toast(`Omborda faqat ${max} dona bor`, true);
  if (it) it.qty += qty; else cart.items.push({ id, qty });
  saveCart();
  if (!silent) toast("✓ Savatga qo'shildi");
  flyToCart(fromEl);
}
// Tugmadan savatga uchib boruvchi nur
function flyToCart(fromEl) {
  const cartEl = $('.cart-btn');
  const bump = () => { cartEl.classList.remove('bump'); void cartEl.offsetWidth; cartEl.classList.add('bump'); };
  if (!fromEl || !fromEl.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return bump();
  const a = fromEl.getBoundingClientRect(), b = cartEl.getBoundingClientRect();
  const sx = a.left + a.width / 2, sy = a.top + a.height / 2, ex = b.left + b.width / 2, ey = b.top + b.height / 2;
  const dot = document.createElement('div');
  dot.className = 'fly-dot';
  document.body.appendChild(dot);
  dot.animate([
    { transform: `translate(${sx}px, ${sy}px) scale(1)` },
    { transform: `translate(${(sx + ex) / 2}px, ${Math.min(sy, ey) - 140}px) scale(1.5)`, offset: 0.45 },
    { transform: `translate(${ex}px, ${ey}px) scale(.35)`, opacity: 0.7 },
  ], { duration: 750, easing: 'cubic-bezier(.45,0,.3,1)' }).onfinish = () => { dot.remove(); bump(); };
}
// Kategoriya bo'yicha qaysi 3D model ko'rsatiladi
function model3dKind(p) {
  const c = catById(p.categoryId);
  const byId = { keyboard: 'keyboard', mouse: 'mouse', headphones: 'headset', monitor: 'monitor', watch: 'watch', camera: 'camera', charger: 'charger' };
  const byIcon = { '⌨️': 'keyboard', '🖱️': 'mouse', '🎧': 'headset', '📺': 'monitor', '⌚': 'watch', '📷': 'camera', '🔌': 'charger' };
  return byId[c?.id] || byIcon[c?.icon] || 'pc';
}
function totals(delivery = 'pickup') {
  const lines = cart.items.map((i) => ({ ...i, p: prodById(i.id) })).filter((l) => l.p);
  const subtotal = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const st = S.settings;
  const assembly = cart.assembly && st.assemblyFee > 0 ? st.assemblyFee : 0;
  let deliveryFee = 0;
  if (delivery === 'delivery' && !(st.freeDeliveryFrom > 0 && subtotal >= st.freeDeliveryFrom)) deliveryFee = st.deliveryFee || 0;
  return { lines, subtotal, assembly, deliveryFee, total: subtotal + assembly + deliveryFee };
}

// ---------- Yordamchilar ----------
const prodById = (id) => S.products.find((p) => p.id === id);
const catById = (id) => S.categories.find((c) => c.id === id);
function toast(msg, isError) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.className = 'toast'), 2600);
}
function img(p, i = 0) {
  const src = p.images && p.images[i];
  if (src) return `<img src="${esc(src)}" alt="${esc(p.name)}" loading="lazy">`;
  return `<div class="ph"><span>${esc(catById(p.categoryId)?.icon || '📦')}</span></div>`;
}
function stockText(p) {
  if (p.stock == null) return '<span class="stock-ok">● Mavjud</span>';
  if (p.stock <= 0) return '<span class="stock-no">● Tugagan</span>';
  if (p.stock <= 3) return `<span class="stock-low">● Kam qoldi: ${p.stock} dona</span>`;
  return '<span class="stock-ok">● Mavjud</span>';
}
function card(p) {
  const out = p.stock != null && p.stock <= 0;
  const sale = p.oldPrice > p.price;
  return `<article class="card">
    <a href="#/product/${p.id}" class="card-img">${img(p)}
      ${sale ? `<span class="badge sale">-${Math.round(100 - (p.price * 100) / p.oldPrice)}%</span>` : ''}
      ${out ? '<span class="badge out">Tugagan</span>' : ''}</a>
    <div class="card-body">
      <div class="card-cat">${esc(catById(p.categoryId)?.name)}</div>
      <a href="#/product/${p.id}" class="card-title">${esc(p.name)}</a>
      <div class="price-row"><b>${money(p.price)}</b>${sale ? `<s>${money(p.oldPrice)}</s>` : ''}</div>
      <button class="btn btn-primary btn-block" data-add="${p.id}" ${out ? 'disabled' : ''}>${out ? 'Tugagan' : '🛒 Savatga'}</button>
    </div></article>`;
}
function normPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 9) d = '998' + d;
  const codes = ['20', '33', '50', '55', '61', '62', '65', '66', '67', '69', '70', '71', '72', '73', '74', '75', '76', '77', '78', '79', '87', '88', '90', '91', '93', '94', '95', '97', '98', '99'];
  if (d.length !== 12 || !d.startsWith('998') || !codes.includes(d.slice(3, 5)) || /^(\d)\1+$/.test(d.slice(5))) return '';
  return d;
}
function maskPhone(input) {
  input.addEventListener('input', () => {
    let d = input.value.replace(/\D/g, '');
    if (d.startsWith('998') && d.length > 9) d = d.slice(3);
    d = d.slice(0, 9);
    const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
    input.value = parts.join(' ');
  });
}
function compressImage(file, maxSide = 1600) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Faqat rasm yuklang'));
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
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      im.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function copyText(text, label) {
  try { await navigator.clipboard.writeText(text); toast(`✓ ${label} nusxalandi`); }
  catch { toast(text); }
}
const statusList = [['new', 'Qabul qilindi'], ['confirmed', "To'lov tasdiqlandi"], ['shipping', "Yo'lda"], ['done', 'Yetkazildi']];

// ---------- Sahifalar ----------
function renderHome() {
  const st = S.settings;
  const featured = S.products.filter((p) => p.featured).slice(0, 10);
  const newest = [...S.products].sort((a, b) => b.createdAt - a.createdAt).filter((p) => !p.featured).slice(0, 10);
  const mainCats = S.categories.filter((c) => !c.pcPart);
  const brands = [...new Set(S.products.map((p) => p.brand).filter(Boolean))];
  const count = (id) => S.products.filter((p) => p.categoryId === id).length;
  app.innerHTML = `
    <section class="hero">
      <div>
        <h1>${esc(st.heroTitle)}</h1>
        <p>${esc(st.heroText)}</p>
        <div class="hero-actions">
          <a href="#/catalog" class="btn btn-primary btn-lg">Katalogga o'tish</a>
          <a href="#/build" class="btn btn-lg">🛠️ PC yig'ish</a>
        </div>
      </div>
      <div class="hero-3d" id="hero3d">
        <div class="hero-art hero-fallback">🖥️<small>⌨️🖱️🎧</small></div>
        <span class="drag-hint">↔ Aylantiring · 👆 Bosib ko'ring</span>
      </div>
    </section>
    <div class="perks">
      <div class="perk"><span>✅</span><div><b>Kafolat</b><small>Barcha tovarlarga</small></div></div>
      <div class="perk"><span>🚚</span><div><b>Yetkazib berish</b><small>${esc(st.deliveryNote)}</small></div></div>
      <div class="perk"><span>💳</span><div><b>Kartaga to'lov</b><small>${esc(st.cardBank)} / Humo</small></div></div>
      <div class="perk"><span>📦</span><div><b>Optom narxlar</b><small>Ulgurji xaridorlarga</small></div></div>
    </div>

    <section class="section">
      <div class="section-head"><h2>Kategoriyalar</h2><a href="#/catalog">Barchasi →</a></div>
      <div class="cats">
        ${mainCats.map((c) => `<a class="cat" href="#/catalog?cat=${c.id}"><div class="ico">${esc(c.icon)}</div><b>${esc(c.name)}</b><small>${count(c.id)} ta mahsulot</small></a>`).join('')}
        <a class="cat" href="#/build"><div class="ico">🛠️</div><b>PC qismlari</b><small>O'zingiz yig'ing</small></a>
      </div>
    </section>

    ${brands.length ? `<section class="section marquee" aria-label="Brendlar">
      <div class="marquee-track">${[0, 1].map((half) => `<div class="marquee-half" ${half ? 'aria-hidden="true"' : ''}>${brands.map((b) => `<a href="#/catalog?q=${encodeURIComponent(b)}" tabindex="${half ? -1 : 0}">${esc(b)}</a><span>✦</span>`).join('')}</div>`).join('')}</div>
    </section>` : ''}

    ${featured.length ? `<section class="section">
      <div class="section-head"><h2>🔥 Ommabop mahsulotlar</h2><a href="#/catalog">Barchasi →</a></div>
      <div class="grid">${featured.map(card).join('')}</div></section>` : ''}

    <section class="section">
      <div class="banner banner-build">
        <div><h3>🛠️ Kompyuterni o'zingiz yig'ing</h3>
        <p>Protsessor, videokarta, xotira va boshqa qismlarni tanlang — mutaxassislarimiz yig'ib, sozlab beradi${st.assemblyFee ? ` (yig'ish xizmati ${money(st.assemblyFee)})` : ''}.</p></div>
        <a href="#/build" class="btn btn-primary btn-lg">Konfigurator</a>
      </div>
    </section>

    ${newest.length ? `<section class="section">
      <div class="section-head"><h2>Yangi kelganlar</h2><a href="#/catalog?sort=new">Barchasi →</a></div>
      <div class="grid">${newest.map(card).join('')}</div></section>` : ''}

    <section class="section">
      <div class="section-head"><h2>Qanday buyurtma beriladi?</h2></div>
      <div class="steps">
        <div class="step"><span>🛒</span><b>Tanlang</b><p>Mahsulotni savatga qo'shing yoki PC yig'ing</p></div>
        <div class="step"><span>📝</span><b>Ma'lumot kiriting</b><p>Ism va ishlaydigan telefon raqamingiz</p></div>
        <div class="step"><span>💳</span><b>Kartaga to'lang</b><p>Do'kon kartasiga o'tkazib, chekni yuklang</p></div>
        <div class="step"><span>🚚</span><b>Qabul qiling</b><p>Operator qo'ng'iroq qiladi va yetkazib beradi</p></div>
      </div>
    </section>

    <section class="section">
      <div class="banner">
        <div><h3>📦 Optom xaridlar</h3><p>${esc(st.wholesaleText)}</p></div>
        <div class="hero-actions">
          ${st.telegram ? `<a href="${esc(st.telegram)}" target="_blank" rel="noopener" class="btn btn-primary">✈️ Telegram kanal</a>` : ''}
          <a href="tel:${esc(String(st.phone).replace(/[^\d+]/g, ''))}" class="btn">📞 ${esc(st.phone)}</a>
        </div>
      </div>
    </section>`;
  whenMP3D((m) => m.mountHero($('#hero3d')));
}

function renderCatalog(params) {
  const cat = params.get('cat') || '';
  const q = (params.get('q') || '').trim();
  const sort = params.get('sort') || 'popular';
  let list = S.products.filter((p) => (!cat || p.categoryId === cat));
  if (q) {
    const words = q.toLowerCase().split(/\s+/);
    list = S.products.filter((p) => {
      const hay = `${p.name} ${p.brand} ${catById(p.categoryId)?.name || ''} ${p.specs}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }
  const inStock = (p) => (p.stock == null || p.stock > 0 ? 1 : 0);
  const sorters = {
    popular: (a, b) => inStock(b) - inStock(a) || b.featured - a.featured || b.createdAt - a.createdAt,
    cheap: (a, b) => a.price - b.price,
    expensive: (a, b) => b.price - a.price,
    new: (a, b) => b.createdAt - a.createdAt,
  };
  list.sort(sorters[sort] || sorters.popular);
  const link = (c) => `#/catalog?${new URLSearchParams({ ...(c ? { cat: c } : {}), ...(sort !== 'popular' ? { sort } : {}) })}`;
  const count = (id) => S.products.filter((p) => p.categoryId === id).length;
  const title = q ? `"${esc(q)}" bo'yicha qidiruv` : cat ? esc(catById(cat)?.name || 'Katalog') : 'Barcha mahsulotlar';
  const catLinks = (arr) => arr.map((c) => `<a href="${link(c.id)}" class="${c.id === cat ? 'active' : ''}">${esc(c.icon)} ${esc(c.name)}<small>${count(c.id)}</small></a>`).join('');
  app.innerHTML = `
    <div class="catalog">
      <aside class="sidebar">
        <a href="${link('')}" class="${!cat && !q ? 'active' : ''}">🗂️ Barchasi<small>${S.products.length}</small></a>
        <hr>${catLinks(S.categories.filter((c) => !c.pcPart))}
        <hr><div class="sb-title">PC qismlari</div>${catLinks(S.categories.filter((c) => c.pcPart))}
      </aside>
      <div>
        <div class="chips">
          <a class="chip ${!cat ? 'active' : ''}" href="${link('')}">Barchasi</a>
          ${S.categories.map((c) => `<a class="chip ${c.id === cat ? 'active' : ''}" href="${link(c.id)}">${esc(c.icon)} ${esc(c.name)}</a>`).join('')}
        </div>
        <div class="toolbar">
          <h1>${title} <small class="muted" style="font-size:14px;font-weight:500">${list.length} ta</small></h1>
          <select class="input" id="sortSel">
            <option value="popular">Ommabop</option>
            <option value="cheap">Avval arzonlari</option>
            <option value="expensive">Avval qimmatlari</option>
            <option value="new">Yangilari</option>
          </select>
        </div>
        ${list.length ? `<div class="grid">${list.map(card).join('')}</div>`
          : `<div class="empty"><div class="big">🔎</div><p>Hech narsa topilmadi</p><a href="#/catalog" class="btn">Barcha mahsulotlar</a></div>`}
      </div>
    </div>`;
  const sel = $('#sortSel');
  sel.value = sort;
  sel.onchange = () => {
    const np = new URLSearchParams(params);
    np.set('sort', sel.value);
    location.hash = '#/catalog?' + np;
  };
}

function renderProduct(id) {
  const p = prodById(id);
  if (!p) { app.innerHTML = `<div class="empty"><div class="big">😕</div><p>Mahsulot topilmadi</p><a href="#/catalog" class="btn">Katalog</a></div>`; return; }
  const c = catById(p.categoryId);
  const out = p.stock != null && p.stock <= 0;
  const specs = String(p.specs || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf(':');
    return i > 0 ? `<tr><td>${esc(l.slice(0, i))}</td><td>${esc(l.slice(i + 1).trim())}</td></tr>` : `<tr><td colspan="2">${esc(l)}</td></tr>`;
  }).join('');
  const related = S.products.filter((x) => x.categoryId === p.categoryId && x.id !== p.id).slice(0, 5);
  const st = S.settings;
  app.innerHTML = `
    <div class="crumbs"><a href="#/">Bosh sahifa</a> / <a href="#/catalog?cat=${esc(p.categoryId)}">${esc(c?.name)}</a> / ${esc(p.name)}</div>
    <div class="product">
      <div>
        <div class="gallery-main tilt" id="gMain">${img(p)}</div>
        <div class="thumbs">${p.images.map((u, i) => `<button data-i="${i}" class="${i ? '' : 'active'}"><img src="${esc(u)}" alt=""></button>`).join('')}
          <button class="thumb-3d ${p.images.length ? '' : 'active'}" data-3d title="3D ko'rinish"><b>3D</b><small>360°</small></button></div>
      </div>
      <div class="p-info">
        <h1>${esc(p.name)}</h1>
        <div class="p-meta">${stockText(p)}${p.brand ? `<span>Brend: <b style="color:var(--text)">${esc(p.brand)}</b></span>` : ''}<span>Kod: ${esc(p.id)}</span></div>
        <div class="p-price"><b>${money(p.price)}</b>${p.oldPrice > p.price ? `<s>${money(p.oldPrice)}</s>` : ''}</div>
        <div class="buy-row">
          <div class="qty"><button data-q="-1">−</button><input id="qty" type="number" value="1" min="1"><button data-q="1">+</button></div>
          <button class="btn btn-primary btn-lg" id="addBtn" ${out ? 'disabled' : ''}>🛒 Savatga</button>
          <button class="btn btn-lg" id="buyBtn" ${out ? 'disabled' : ''}>Hozir sotib olish</button>
        </div>
        <div class="trust">
          <div>✅ Rasmiy kafolat</div>
          <div>🚚 ${esc(st.deliveryNote)}</div>
          <div>💳 Kartaga to'lov (${esc(st.cardBank)})</div>
          <div>📍 ${esc(st.address)}</div>
        </div>
        ${p.description ? `<div class="panel" style="margin-top:18px"><h3>Tavsif</h3><div class="desc">${esc(p.description)}</div></div>` : ''}
        ${specs ? `<div class="panel"><h3>Xususiyatlari</h3><table class="specs">${specs}</table></div>` : ''}
      </div>
    </div>
    ${related.length ? `<section class="section"><div class="section-head"><h2>O'xshash mahsulotlar</h2></div><div class="grid">${related.map(card).join('')}</div></section>` : ''}`;

  const gMain = $('#gMain');
  const show3d = () => {
    gMain.innerHTML = `${img(p)}<span class="drag-hint">↔ Aylantiring · bosing</span>`;
    whenMP3D((m) => {
      if (!gMain.isConnected || !$('.thumb-3d.active')) return;
      gMain.innerHTML = '<span class="drag-hint">↔ Aylantiring · bosing</span>';
      gMain.classList.add('is-3d');
      if (!m.mountProduct(gMain, model3dKind(p))) { gMain.classList.remove('is-3d'); gMain.innerHTML = img(p); }
    });
  };
  $$('.thumbs button').forEach((b) => (b.onclick = () => {
    $$('.thumbs button').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    gMain.classList.remove('is-3d', 'ready');
    if ('3d' in b.dataset) return show3d();
    gMain.innerHTML = img(p, Number(b.dataset.i));
  }));
  if (!p.images.length) show3d();
  const qty = $('#qty');
  const max = p.stock == null ? 99 : Math.max(1, p.stock);
  const clamp = () => (qty.value = Math.min(max, Math.max(1, Math.round(Number(qty.value)) || 1)));
  $$('[data-q]').forEach((b) => (b.onclick = () => { qty.value = Number(qty.value) + Number(b.dataset.q); clamp(); }));
  qty.onchange = clamp;
  $('#addBtn').onclick = () => addToCart(p.id, Number(qty.value), false, $('#addBtn'));
  $('#buyBtn').onclick = () => {
    if (!cart.items.some((i) => i.id === p.id)) addToCart(p.id, Number(qty.value), true);
    location.hash = '#/checkout';
  };
}

function cartLinesHtml(t, editable) {
  return t.lines.map((l) => `
    <div class="cart-item">
      <a href="#/product/${l.p.id}" class="cart-thumb">${img(l.p)}</a>
      <div><a href="#/product/${l.p.id}" class="cart-name">${esc(l.p.name)}</a>
        <div class="muted" style="font-size:13px">${money(l.p.price)} × ${l.qty}</div></div>
      <div class="cart-right">
        ${editable ? `<div class="qty"><button data-dec="${l.p.id}">−</button><input value="${l.qty}" readonly><button data-inc="${l.p.id}">+</button></div>` : ''}
        <b>${money(l.p.price * l.qty)}</b>
        ${editable ? `<button class="link-btn" data-del="${l.p.id}">✕ O'chirish</button>` : ''}
      </div>
    </div>`).join('');
}
function summaryHtml(t, showDelivery) {
  return `
    <div class="sum-row"><span>Mahsulotlar (${t.lines.reduce((s, l) => s + l.qty, 0)} ta)</span><span>${money(t.subtotal)}</span></div>
    ${t.assembly ? `<div class="sum-row"><span>PC yig'ish xizmati</span><span>${money(t.assembly)}</span></div>` : ''}
    ${showDelivery ? `<div class="sum-row"><span>Yetkazib berish</span><span>${t.deliveryFee ? money(t.deliveryFee) : 'Bepul'}</span></div>` : ''}
    <div class="sum-row total"><span>Jami</span><span>${money(t.total)}</span></div>`;
}

function renderCart() {
  const t = totals();
  if (!t.lines.length) {
    app.innerHTML = `<div class="empty"><div class="big">🛒</div><h2>Savat bo'sh</h2><p>Katalogdan kerakli mahsulotlarni tanlang</p><a href="#/catalog" class="btn btn-primary">Katalogga o'tish</a></div>`;
    return;
  }
  const st = S.settings;
  app.innerHTML = `
    <h1 style="margin-bottom:18px">Savat</h1>
    <div class="layout-2">
      <div class="panel">
        ${cartLinesHtml(t, true)}
        ${st.assemblyFee > 0 ? `<label class="check" style="margin-top:16px"><input type="checkbox" id="asmChk" ${cart.assembly ? 'checked' : ''}>
          <span>🛠️ <b>PC yig'ish xizmati</b> — tanlangan qismlardan kompyuterni yig'ib, Windows o'rnatib beramiz (+${money(st.assemblyFee)})</span></label>` : ''}
      </div>
      <aside class="panel summary">
        <h3>Buyurtma</h3>
        ${summaryHtml(t, false)}
        <a href="#/checkout" class="btn btn-primary btn-block btn-lg" style="margin-top:16px">Rasmiylashtirish →</a>
        <a href="#/catalog" class="btn btn-block" style="margin-top:10px">Xaridni davom ettirish</a>
      </aside>
    </div>`;
  app.onclick = null;
  $$('[data-inc]').forEach((b) => (b.onclick = () => { addToCart(b.dataset.inc, 1, true); renderCart(); }));
  $$('[data-dec]').forEach((b) => (b.onclick = () => {
    const it = cart.items.find((i) => i.id === b.dataset.dec);
    if (it && it.qty > 1) { it.qty--; saveCart(); renderCart(); }
  }));
  $$('[data-del]').forEach((b) => (b.onclick = () => { cart.items = cart.items.filter((i) => i.id !== b.dataset.del); cleanCart(); renderCart(); }));
  const asm = $('#asmChk');
  if (asm) asm.onchange = () => { cart.assembly = asm.checked; saveCart(); renderCart(); };
}

function renderCheckout() {
  if (!totals().lines.length) { location.hash = '#/cart'; return; }
  const st = S.settings;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('mp_customer')) || {}; } catch {}
  app.innerHTML = `
    <h1 style="margin-bottom:18px">Buyurtmani rasmiylashtirish</h1>
    <form class="layout-2" id="coForm" novalidate>
      <div>
        <div class="panel">
          <h3>1. Shaxsiy ma'lumotlar</h3>
          <div class="row">
            <div class="field"><label>Ism familiya <span class="req">*</span></label>
              <input class="input" name="name" required maxlength="80" placeholder="Masalan: Aziz Karimov" value="${esc(saved.name)}"></div>
            <div class="field"><label>Telefon raqam <span class="req">*</span></label>
              <div class="phone-wrap"><span>+998</span><input class="input" name="phone" inputmode="numeric" placeholder="90 123 45 67" value="${esc(saved.phone)}"></div>
              <span class="hint">Faqat <b>ishlaydigan</b> raqam — operator shu raqamga qo'ng'iroq qiladi</span></div>
          </div>
          <div class="field"><label>Qo'shimcha telefon (ixtiyoriy)</label>
            <div class="phone-wrap"><span>+998</span><input class="input" name="phone2" inputmode="numeric" placeholder="93 123 45 67" value="${esc(saved.phone2)}"></div></div>
        </div>

        <div class="panel">
          <h3>2. Qabul qilish usuli</h3>
          <div class="seg">
            <label><input type="radio" name="delivery" value="pickup" checked><b>🏬 Do'kondan olib ketish</b><small>${esc(st.address)} — bepul</small></label>
            <label><input type="radio" name="delivery" value="delivery"><b>🚚 Yetkazib berish</b><small>${st.deliveryFee ? money(st.deliveryFee) : 'Bepul'}${st.freeDeliveryFrom ? `, ${money(st.freeDeliveryFrom)} dan bepul` : ''}</small></label>
          </div>
          <div id="addrBox" hidden>
            <div class="row">
              <div class="field"><label>Shahar / viloyat</label><input class="input" name="city" maxlength="80" placeholder="Toshkent" value="${esc(saved.city)}"></div>
              <div class="field"><label>Manzil <span class="req">*</span></label><input class="input" name="address" maxlength="300" placeholder="Ko'cha, uy, xonadon, mo'ljal" value="${esc(saved.address)}"></div>
            </div>
          </div>
          <div class="field"><label>Izoh (ixtiyoriy)</label><textarea class="input" name="comment" rows="2" maxlength="1000" placeholder="Qo'shimcha istaklar"></textarea></div>
        </div>

        <div class="panel">
          <h3>3. To'lov — kartaga o'tkazma</h3>
          <div class="pay-card">
            <div class="bank">${esc(st.cardBank)} · ${esc(st.shopName)}</div>
            <div class="num">${esc(st.cardNumber)}</div>
            <div class="holder">${esc(st.cardHolder)}</div>
            <div class="copy-row"><button type="button" class="btn btn-sm" id="cpCard">📋 Karta raqamini nusxalash</button></div>
          </div>
          <div class="amount-box"><span class="muted">To'lanadigan summa:</span><b id="payAmount"></b>
            <button type="button" class="btn btn-sm" id="cpAmount">📋 Nusxalash</button></div>
          <p class="muted" style="font-size:14px;margin-top:0">${esc(st.paymentNote)}</p>
          <label class="upload" id="upBox">
            <input type="file" accept="image/*" id="receiptInput">
            <div id="upText">📎 <b>To'lov chekini yuklang</b> <span class="req">*</span><br><span class="hint">Click / Payme / bank ilovasidan skrinshot</span></div>
          </label>
          <label class="check"><input type="checkbox" id="agree"> <span>Ko'rsatilgan summani kartaga o'tkazdim va ma'lumotlarim to'g'riligini tasdiqlayman</span></label>
          <div class="err" id="formErr"></div>
        </div>
      </div>

      <aside class="panel summary">
        <h3>Buyurtmangiz</h3>
        <div id="coLines"></div>
        <div id="coSum"></div>
        <button class="btn btn-primary btn-block btn-lg" id="submitBtn" style="margin-top:16px">✅ Buyurtma berish</button>
        <p class="hint" style="text-align:center;margin-bottom:0">Buyurtma berilgach operator siz bilan bog'lanadi</p>
      </aside>
    </form>`;

  const form = $('#coForm');
  let receipt = '';
  const delivery = () => form.delivery.value;
  const refresh = () => {
    const t = totals(delivery());
    $('#coLines').innerHTML = t.lines.map((l) => `<div class="sum-row" style="font-size:13px"><span>${esc(l.p.name)} × ${l.qty}</span><span>${money(l.p.price * l.qty)}</span></div>`).join('');
    $('#coSum').innerHTML = summaryHtml(t, delivery() === 'delivery');
    $('#payAmount').textContent = money(t.total);
    $('#addrBox').hidden = delivery() !== 'delivery';
  };
  refresh();
  $$('input[name=delivery]', form).forEach((r) => (r.onchange = refresh));
  maskPhone(form.phone); maskPhone(form.phone2);
  form.phone.dispatchEvent(new Event('input')); form.phone2.dispatchEvent(new Event('input'));
  $('#cpCard').onclick = () => copyText(String(st.cardNumber).replace(/\s/g, ''), 'Karta raqami');
  $('#cpAmount').onclick = () => copyText(String(totals(delivery()).total), 'Summa');
  $('#receiptInput').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      receipt = await compressImage(f);
      $('#upBox').classList.add('has');
      $('#upText').innerHTML = `✅ <b>Chek yuklandi</b> <span class="hint">(almashtirish uchun bosing)</span><img src="${receipt}" alt="Chek">`;
    } catch (err) { toast(err.message, true); }
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const errEl = $('#formErr');
    errEl.textContent = '';
    $$('.invalid', form).forEach((x) => x.classList.remove('invalid'));
    const bad = (el, msg) => { if (el) { el.classList.add('invalid'); el.focus(); } errEl.textContent = msg; toast(msg, true); };
    const name = form.name.value.trim();
    if (name.length < 2) return bad(form.name, 'Ismingizni kiriting');
    const phone = normPhone(form.phone.value);
    if (!phone) return bad(form.phone, "Telefon raqam noto'g'ri. Masalan: 90 123 45 67");
    if (form.phone2.value.trim() && !normPhone(form.phone2.value)) return bad(form.phone2, "Qo'shimcha telefon noto'g'ri");
    if (delivery() === 'delivery' && form.address.value.trim().length < 5) return bad(form.address, "Yetkazib berish manzilini to'liq kiriting");
    if (!receipt) return bad(null, "To'lov chekini (skrinshot) yuklang");
    if (!$('#agree').checked) return bad(null, "To'lov qilganingizni tasdiqlang");

    const customer = { name, phone: '+' + phone, phone2: form.phone2.value.trim() ? '+' + normPhone(form.phone2.value) : '', city: form.city.value, address: form.address.value, comment: form.comment.value };
    const btn = $('#submitBtn');
    btn.disabled = true; btn.textContent = 'Yuborilmoqda…';
    try {
      const r = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer, delivery: delivery(), items: cart.items, assembly: cart.assembly, receipt }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Xatolik yuz berdi');
      try {
        localStorage.setItem('mp_customer', JSON.stringify({ name, phone: form.phone.value, phone2: form.phone2.value, city: customer.city, address: customer.address }));
        localStorage.setItem('mp_last_order', JSON.stringify({ number: d.number, total: d.total, phone: phone.slice(3) }));
      } catch {}
      cart = { items: [], assembly: false };
      saveCart();
      location.hash = '#/success/' + d.number;
      loadShop(); // ombor qoldiqlarini yangilash
    } catch (err) {
      errEl.textContent = err.message; toast(err.message, true);
      btn.disabled = false; btn.textContent = '✅ Buyurtma berish';
    }
  };
}

function renderSuccess(number) {
  let last = {};
  try { last = JSON.parse(localStorage.getItem('mp_last_order')) || {}; } catch {}
  const st = S.settings;
  app.innerHTML = `
    <div class="success panel">
      <div class="big">🎉</div>
      <h1>Rahmat! Buyurtmangiz qabul qilindi</h1>
      <div class="order-no">#${esc(number)}</div>
      ${String(last.number) === String(number) ? `<p>To'langan summa: <b>${money(last.total)}</b></p>` : ''}
      <p class="muted">Operatorimiz to'lovni tekshirib, tez orada siz bilan bog'lanadi. Buyurtma raqamini saqlab qo'ying.</p>
      <div class="hero-actions" style="justify-content:center;margin-top:20px">
        <a href="#/track?number=${esc(number)}" class="btn btn-primary">Buyurtma holati</a>
        <a href="#/" class="btn">Bosh sahifa</a>
      </div>
      <p class="muted" style="margin-top:20px;font-size:14px">Savollar bo'lsa: <a href="tel:${esc(String(st.phone).replace(/[^\d+]/g, ''))}" style="color:var(--text);font-weight:600">${esc(st.phone)}</a></p>
    </div>`;
}

function renderBuild() {
  const parts = S.categories.filter((c) => c.pcPart);
  const st = S.settings;
  const chosen = {};
  app.innerHTML = `
    <h1>🛠️ PC konfigurator</h1>
    <p class="muted" style="margin-top:6px">Har bir bo'limdan kerakli qismni tanlang. Biz yig'ib, sinovdan o'tkazib, Windows o'rnatib beramiz.</p>
    <div class="layout-2 build-layout" style="margin-top:18px">
      <div class="panel">
        ${parts.map((c) => {
          const list = S.products.filter((p) => p.categoryId === c.id && (p.stock == null || p.stock > 0));
          return `<div class="build-row">
            <div class="ico">${esc(c.icon)}</div><b>${esc(c.name)}</b>
            <select class="input" data-part="${c.id}" ${list.length ? '' : 'disabled'}>
              <option value="">${list.length ? '— Tanlang —' : "Hozircha mavjud emas"}</option>
              ${list.map((p) => `<option value="${p.id}">${esc(p.name)} — ${money(p.price)}</option>`).join('')}
            </select>
            <div class="price" data-price="${c.id}">—</div></div>`;
        }).join('')}
      </div>
      <aside class="panel summary">
        <h3>Sizning yig'ma</h3>
        <div class="build-3d" id="build3d"><span class="drag-hint">Tanlangan qismlar korpusga o'rnatiladi</span></div>
        <div id="bSum"></div>
        <button class="btn btn-primary btn-block btn-lg" id="bAdd" style="margin-top:16px" disabled>🛒 Savatga qo'shish</button>
        <p class="hint" style="margin-bottom:0">Moslik bo'yicha savollar bo'lsa, operatorimiz buyurtmadan keyin maslahat beradi.</p>
      </aside>
    </div>`;
  let build3d = null;
  const update = () => {
    if (build3d) build3d.set(new Set(Object.keys(chosen).filter((k) => chosen[k])));
    const ids = Object.values(chosen).filter(Boolean);
    const sub = ids.reduce((s, id) => s + prodById(id).price, 0);
    const fee = ids.length && st.assemblyFee > 0 ? st.assemblyFee : 0;
    $('#bSum').innerHTML = `
      <div class="sum-row"><span>Tanlangan qismlar</span><span>${ids.length} / ${parts.length}</span></div>
      <div class="sum-row"><span>Qismlar narxi</span><span>${money(sub)}</span></div>
      ${fee ? `<div class="sum-row"><span>Yig'ish xizmati</span><span>${money(fee)}</span></div>` : ''}
      <div class="sum-row total"><span>Jami</span><span>${money(sub + fee)}</span></div>`;
    $('#bAdd').disabled = !ids.length;
  };
  $$('[data-part]').forEach((sel) => (sel.onchange = () => {
    chosen[sel.dataset.part] = sel.value;
    $(`[data-price="${sel.dataset.part}"]`).textContent = sel.value ? money(prodById(sel.value).price) : '—';
    update();
  }));
  $('#bAdd').onclick = () => {
    Object.values(chosen).filter(Boolean).forEach((id) => addToCart(id, 1, true));
    cart.assembly = true; saveCart();
    toast("✓ Yig'ma savatga qo'shildi");
    location.hash = '#/cart';
  };
  update();
  whenMP3D((m) => { build3d = m.mountBuilder($('#build3d')); update(); });
}

function renderTrack(params) {
  let last = {};
  try { last = JSON.parse(localStorage.getItem('mp_last_order')) || {}; } catch {}
  const number = params.get('number') || last.number || '';
  app.innerHTML = `
    <div style="max-width:640px;margin:0 auto">
      <h1 style="margin-bottom:18px">📦 Buyurtma holati</h1>
      <form class="panel" id="trForm">
        <div class="row">
          <div class="field"><label>Buyurtma raqami</label><input class="input" name="number" inputmode="numeric" placeholder="1001" value="${esc(number)}"></div>
          <div class="field"><label>Telefon raqam</label><div class="phone-wrap"><span>+998</span><input class="input" name="phone" inputmode="numeric" placeholder="90 123 45 67" value="${esc(String(last.number) === String(number) ? last.phone : '')}"></div></div>
        </div>
        <button class="btn btn-primary btn-block">Tekshirish</button>
      </form>
      <div id="trResult"></div>
    </div>`;
  const f = $('#trForm');
  maskPhone(f.phone); f.phone.dispatchEvent(new Event('input'));
  f.onsubmit = async (e) => {
    e.preventDefault();
    const box = $('#trResult');
    try {
      const r = await fetch(`/api/orders/track?${new URLSearchParams({ number: f.number.value.trim(), phone: f.phone.value })}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const idx = statusList.findIndex((s) => s[0] === d.status);
      box.innerHTML = `<div class="panel">
        <h3>Buyurtma #${d.number}</h3>
        <p class="muted" style="margin-top:-8px">${new Date(d.createdAt).toLocaleString('uz-UZ')}</p>
        ${d.status === 'cancelled' ? '<div class="notice">❌ Buyurtma bekor qilingan. Savollar bo\'lsa biz bilan bog\'laning.</div>'
          : `<div class="timeline">${statusList.map((s, i) => `<div class="${i <= idx ? 'on' : ''}">${s[1]}</div>`).join('')}</div>`}
        ${d.items.map((i) => `<div class="sum-row"><span>${esc(i.name)} × ${i.qty}</span><span>${money(i.price * i.qty)}</span></div>`).join('')}
        ${d.extras.map((x) => `<div class="sum-row"><span>${esc(x.name)}</span><span>${money(x.price)}</span></div>`).join('')}
        <div class="sum-row total"><span>Jami</span><span>${money(d.total)}</span></div></div>`;
    } catch (err) {
      box.innerHTML = `<div class="notice" style="margin-top:16px">${esc(err.message || 'Xatolik')}</div>`;
    }
  };
  if (number && f.phone.value) f.requestSubmit();
}

// ---------- 3D va animatsiyalar ----------
// scene3d.js (Three.js) modul sifatida keyinroq yuklanadi; yuklanmasa — oddiy rasm qoladi
function whenMP3D(fn) {
  if (window.MP3D) fn(window.MP3D);
  else window.addEventListener('mp3d-ready', () => fn(window.MP3D), { once: true });
}

const revealObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); revealObserver.unobserve(e.target); }
  }), { rootMargin: '0px 0px -40px 0px' })
  : null;
function revealOnScroll() {
  $$('.hero, .perk, .section-head, .card, .cat, .step, .banner, .panel, .gallery-main').forEach((el) => {
    const i = [...el.parentElement.children].indexOf(el);
    el.style.setProperty('--d', Math.min(i, 8) * 0.06 + 's');
    el.classList.add('reveal');
    if (revealObserver) revealObserver.observe(el); else el.classList.add('in');
  });
}

// Kartalar sichqoncha ortidan 3D egiladi
let tiltEl = null;
function resetTilt(el) {
  el.classList.remove('tilting');
  el.style.setProperty('--rx', '0deg');
  el.style.setProperty('--ry', '0deg');
}
if (matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest('.card, .tilt:not(.is-3d)');
    if (tiltEl && tiltEl !== el) resetTilt(tiltEl);
    tiltEl = el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.classList.add('tilting');
    el.style.setProperty('--ry', ((x - 0.5) * 12).toFixed(2) + 'deg');
    el.style.setProperty('--rx', ((0.5 - y) * 12).toFixed(2) + 'deg');
    el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
    el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
  });
}

// Kursor ortidan yuruvchi yumshoq qizil nur
if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  const spot = $('#spot');
  let raf = 0, sx = 0, sy = 0;
  document.addEventListener('pointermove', (e) => {
    sx = e.clientX; sy = e.clientY;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; spot.style.setProperty('--x', sx + 'px'); spot.style.setProperty('--y', sy + 'px'); spot.classList.add('on'); });
  });
  document.addEventListener('pointerleave', () => spot.classList.remove('on'));
}

// ---------- Router ----------
function route() {
  const h = location.hash.slice(1) || '/';
  const [path, qs] = h.split('?');
  const params = new URLSearchParams(qs || '');
  const parts = path.split('/').filter(Boolean);
  $('#nav').classList.remove('open');
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#/' + (parts[0] || '')));
  if (parts[0] !== 'catalog') $('#searchInput').value = '';
  window.scrollTo(0, 0);
  renderPage(parts, params);
  revealOnScroll();
}
function renderPage(parts, params) {
  switch (parts[0]) {
    case 'catalog': return renderCatalog(params);
    case 'product': return renderProduct(parts[1]);
    case 'cart': return renderCart();
    case 'checkout': return renderCheckout();
    case 'success': return renderSuccess(parts[1]);
    case 'build': return renderBuild();
    case 'track': return renderTrack(params);
    default: return renderHome();
  }
}

function fillLayout() {
  const st = S.settings;
  const tel = 'tel:' + String(st.phone).replace(/[^\d+]/g, '');
  document.title = `${st.shopName} — ${st.tagline}`;
  $('#tb-address').textContent = '📍 ' + st.address;
  $('#tb-hours').textContent = '🕘 ' + st.workHours;
  $('#tb-phone').textContent = '📞 ' + st.phone; $('#tb-phone').href = tel;
  $('#ft-tagline').textContent = st.tagline;
  $('#ft-phone').textContent = '📞 ' + st.phone; $('#ft-phone').href = tel;
  $('#ft-address').textContent = '📍 ' + st.address;
  $('#ft-hours').textContent = '🕘 ' + st.workHours;
  $('#ft-tg').href = st.telegram || '#'; $('#ft-tg').hidden = !st.telegram;
  $('#ft-ig').href = st.instagram || '#'; $('#ft-ig').hidden = !st.instagram;
  $('#ft-copy').textContent = `© ${new Date().getFullYear()} ${st.shopName}. Barcha huquqlar himoyalangan.`;
}

async function loadShop() {
  const r = await fetch('/api/shop');
  S = await r.json();
  cleanCart();
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-add]');
  if (b) { e.preventDefault(); addToCart(b.dataset.add, 1, false, b); }
});
$('#menuBtn').onclick = () => $('#nav').classList.toggle('open');
$('#searchForm').onsubmit = (e) => {
  e.preventDefault();
  const q = $('#searchInput').value.trim();
  location.hash = q ? '#/catalog?q=' + encodeURIComponent(q) : '#/catalog';
};
window.addEventListener('hashchange', route);

loadShop().then(() => { fillLayout(); route(); }).catch(() => {
  app.innerHTML = `<div class="empty"><div class="big">⚠️</div><p>Serverga ulanib bo'lmadi. Sahifani yangilang.</p></div>`;
});
updateCartBadge();
