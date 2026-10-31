'use strict';
// Birinchi ishga tushganda yaratiladigan boshlang'ich (demo) ma'lumotlar.
// Admin panel orqali hammasini o'zgartirish / o'chirish mumkin.

function createSeed(passwordHash) {
  const now = Date.now();
  const categories = [
    { id: 'pc', name: 'Tayyor kompyuterlar', icon: '🖥️', pcPart: false, sort: 1 },
    { id: 'keyboard', name: 'Klaviaturalar', icon: '⌨️', pcPart: false, sort: 2 },
    { id: 'mouse', name: 'Sichqonchalar', icon: '🖱️', pcPart: false, sort: 3 },
    { id: 'headphones', name: 'Quloqchinlar', icon: '🎧', pcPart: false, sort: 4 },
    { id: 'monitor', name: 'Monitorlar', icon: '📺', pcPart: false, sort: 5 },
    { id: 'camera', name: 'Kameralar', icon: '📷', pcPart: false, sort: 6 },
    { id: 'watch', name: 'Smart soatlar', icon: '⌚', pcPart: false, sort: 7 },
    { id: 'charger', name: 'Zaryadkalar', icon: '🔌', pcPart: false, sort: 8 },
    { id: 'cpu', name: 'Protsessorlar', icon: '🧠', pcPart: true, sort: 20 },
    { id: 'motherboard', name: 'Ona platalar', icon: '🧩', pcPart: true, sort: 21 },
    { id: 'ram', name: 'Operativ xotira', icon: '💾', pcPart: true, sort: 22 },
    { id: 'gpu', name: 'Videokartalar', icon: '🎮', pcPart: true, sort: 23 },
    { id: 'ssd', name: 'SSD xotira', icon: '💽', pcPart: true, sort: 24 },
    { id: 'psu', name: 'Blok pitaniya', icon: '⚡', pcPart: true, sort: 25 },
    { id: 'case', name: 'Korpuslar', icon: '🗄️', pcPart: true, sort: 26 },
    { id: 'cooler', name: 'Sovutish', icon: '❄️', pcPart: true, sort: 27 },
  ];

  const p = (id, categoryId, name, price, extra = {}) => ({
    id, categoryId, name, price,
    oldPrice: 0, stock: 10, images: [], brand: '', description: '', specs: '',
    featured: false, active: true, createdAt: now, ...extra,
  });

  const products = [
    p('p1', 'pc', 'Gaming PC "Red Storm" — i5-14400F / RTX 5060 / 32GB', 14900000, {
      oldPrice: 15900000, featured: true, stock: 3,
      description: "O'yinlar va montaj uchun tayyor yig'ilgan kompyuter. Windows o'rnatilgan, 1 yil kafolat.",
      specs: "Protsessor: Intel Core i5-14400F\nVideokarta: GeForce RTX 5060 8GB\nOperativ xotira: 32GB DDR5 6000MHz\nSSD: 1TB NVMe M.2\nBlok pitaniya: 650W 80+ Bronze\nKafolat: 12 oy",
    }),
    p('p2', 'pc', 'Office PC — i3-14100 / 16GB / SSD 512GB', 5900000, {
      stock: 5,
      description: "Ofis, o'qish va internet uchun tez va tejamkor kompyuter.",
      specs: "Protsessor: Intel Core i3-14100\nOperativ xotira: 16GB DDR4\nSSD: 512GB NVMe\nKafolat: 12 oy",
    }),
    p('p3', 'keyboard', 'Aula F75 mexanik klaviatura (RGB, simsiz)', 690000, {
      oldPrice: 790000, featured: true, brand: 'Aula',
      description: "75% formatdagi mexanik klaviatura: 3 rejim (USB-C, 2.4G, Bluetooth), hot-swap, RGB yoritish.",
      specs: "Format: 75%\nUlanish: USB-C / 2.4G / Bluetooth 5.0\nSvichlar: Hot-swap\nAkkumulyator: 4000 mAh\nYoritish: RGB",
    }),
    p('p4', 'keyboard', 'Attack Shark K86 mexanik klaviatura', 520000, { brand: 'Attack Shark', specs: "Format: TKL\nUlanish: USB-C / 2.4G / Bluetooth\nYoritish: RGB" }),
    p('p5', 'mouse', 'Attack Shark X11 simsiz gaming sichqoncha', 290000, {
      featured: true, brand: 'Attack Shark',
      description: "Yengil (59 g) simsiz sichqoncha, PAW3311 sensor, zaryadlash dok-stansiyasi bilan.",
      specs: "Sensor: PAW3311, 22000 DPI\nVazni: 59 g\nUlanish: 2.4G / Bluetooth / USB-C\nAkkumulyator: 70 soatgacha",
    }),
    p('p6', 'mouse', 'Logitech G102 Lightsync', 230000, { brand: 'Logitech', specs: "Sensor: 8000 DPI\nUlanish: USB simli\nYoritish: RGB" }),
    p('p7', 'headphones', 'HyperX Cloud III gaming quloqchin', 1150000, {
      featured: true, brand: 'HyperX', stock: 4,
      specs: "Drayver: 53 mm\nMikrofon: olinadigan, shovqinni pasaytiruvchi\nUlanish: USB / 3.5 mm",
    }),
    p('p8', 'headphones', 'Apple AirPods Pro 2 (USB-C)', 2650000, { brand: 'Apple', oldPrice: 2900000 }),
    p('p9', 'monitor', 'Xiaomi G27i 27" IPS 165Hz gaming monitor', 2350000, {
      featured: true, brand: 'Xiaomi',
      specs: "Diagonal: 27\"\nMatritsa: Fast IPS\nRuxsat: 1920x1080\nChastota: 165 Hz\nJavob vaqti: 1 ms",
    }),
    p('p10', 'camera', 'Xiaomi Smart Camera C300 (2K, Wi-Fi)', 420000, { brand: 'Xiaomi', specs: "Ruxsat: 2K\nAylanish: 360°\nTungi rejim: bor" }),
    p('p11', 'watch', 'Apple Watch Series 10 46mm', 5200000, { brand: 'Apple', stock: 2 }),
    p('p12', 'watch', 'Xiaomi Redmi Watch 5 Active', 450000, { brand: 'Xiaomi', featured: true }),
    p('p13', 'charger', 'Apple 20W USB-C zaryadlovchi (original)', 260000, { brand: 'Apple' }),
    p('p14', 'charger', 'Baseus 65W GaN tez zaryadlovchi (2C+1A)', 380000, { brand: 'Baseus', featured: true }),
    p('c1', 'cpu', 'Intel Core i5-14400F', 2350000, { brand: 'Intel', specs: "Yadrolar: 10 (6P+4E)\nChastota: 4.7 GHz gacha\nSoket: LGA1700" }),
    p('c2', 'cpu', 'AMD Ryzen 7 7800X3D', 5300000, { brand: 'AMD', specs: "Yadrolar: 8 / 16 oqim\nChastota: 5.0 GHz gacha\nSoket: AM5" }),
    p('m1', 'motherboard', 'MSI PRO B760M-A WiFi DDR5', 1850000, { brand: 'MSI', specs: "Soket: LGA1700\nXotira: DDR5\nWi-Fi: bor" }),
    p('m2', 'motherboard', 'ASUS TUF Gaming B650-Plus WiFi', 2600000, { brand: 'ASUS', specs: "Soket: AM5\nXotira: DDR5\nWi-Fi: bor" }),
    p('r1', 'ram', 'Kingston Fury Beast 32GB (2x16) DDR5 6000MHz', 1450000, { brand: 'Kingston' }),
    p('g1', 'gpu', 'MSI GeForce RTX 5060 Ventus 2X 8GB', 4600000, { brand: 'MSI' }),
    p('g2', 'gpu', 'Gigabyte GeForce RTX 5070 Windforce 12GB', 8400000, { brand: 'Gigabyte' }),
    p('s1', 'ssd', 'Samsung 990 EVO Plus 1TB NVMe', 1100000, { brand: 'Samsung' }),
    p('u1', 'psu', 'DeepCool PK650D 650W 80+ Bronze', 720000, { brand: 'DeepCool' }),
    p('k1', 'case', 'Montech XR korpus (oq, 3 ARGB kuler)', 980000, { brand: 'Montech' }),
    p('f1', 'cooler', 'DeepCool AK400 Digital', 450000, { brand: 'DeepCool' }),
  ];

  return {
    meta: { lastOrderNo: 1000, createdAt: now },
    admin: { passwordHash },
    settings: {
      shopName: 'MobilePlus',
      tagline: 'Kompyuter texnikasi va aksessuarlar',
      phone: '+998 33 881 87 88',
      address: 'Izza ShowRoom',
      workHours: '09:00 – 20:00, har kuni',
      telegram: 'https://t.me/+alpqQbcHotplNzcy',
      instagram: 'https://instagram.com/mobileplus_izza',
      cardNumber: '8600 0000 0000 0000',
      cardHolder: 'ISM FAMILIYA',
      cardBank: 'Uzcard',
      paymentNote: "To'lovni kartaga o'tkazing va chek (skrinshot)ni yuklang. Operator 15 daqiqa ichida qo'ng'iroq qiladi.",
      deliveryFee: 30000,
      freeDeliveryFrom: 1000000,
      deliveryNote: "Toshkent bo'ylab 24 soat ichida, viloyatlarga 1–3 kun",
      assemblyFee: 200000,
      heroTitle: "Kompyuter texnikasi, aksessuarlar va PC yig'ish",
      heroText: "Klaviatura, sichqoncha, quloqchin, monitor va o'yin kompyuterlari — kafolat bilan. Optom va chakana narxlarda.",
      wholesaleText: "Optom xaridlar uchun maxsus narxlar. Telegram kanalimizda barcha tovarlar narxlari bilan.",
      tgBotToken: '',
      tgChatId: '',
    },
    categories,
    products,
    orders: [],
  };
}

module.exports = { createSeed };
