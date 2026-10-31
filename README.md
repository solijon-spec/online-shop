# MobilePlus — onlayn do'kon

Kompyuter texnikasi, aksessuarlar va PC yig'ish uchun onlayn do'kon + admin panel.
Hech qanday qo'shimcha kutubxona kerak emas — faqat **Node.js 18+**.

## Ishga tushirish

```bash
node server.js
```

- Do'kon: http://localhost:3000
- Admin panel: http://localhost:3000/admin
- Birinchi parol: `admin123` (kirgandan keyin **Sozlamalar → Parolni o'zgartirish**)

Boshqa parol bilan boshlash: `ADMIN_PASSWORD=MeningParolim node server.js` (faqat baza birinchi marta yaratilganda).

## Mijoz uchun imkoniyatlar
- Bosh sahifa, kategoriyalar, qidiruv, saralash, chegirmalar
- Mahsulot sahifasi: bir nechta rasm, tavsif, xususiyatlar jadvali, ombor qoldig'i
- **PC konfigurator** — qismlarni tanlab, yig'ish xizmati bilan buyurtma
- Savat → rasmiylashtirish: ism, **majburiy ishlaydigan telefon** (+998, operator kodi tekshiriladi), olib ketish yoki yetkazib berish
- **Kartaga to'lov**: do'kon karta raqami va summa ko'rsatiladi (nusxalash tugmalari), mijoz **chek skrinshotini majburiy yuklaydi**
- Buyurtma holatini raqam + telefon orqali kuzatish

## Admin panel
- **Bosh sahifa**: yangi leadlar, bugungi buyurtmalar, oylik tushum, kam qolgan tovarlar, ko'p sotilganlar
- **Buyurtmalar (leadlar)**: mijoz ismi, telefoni (qo'ng'iroq / Telegram tugmasi), manzil, tovarlar, to'lov cheki rasmi, holat (Yangi → To'lov tasdiqlandi → Yo'lda → Yetkazildi / Bekor), izoh, Excel (CSV) eksport. Yangi buyurtma kelsa — ovozli signal.
- **Mahsulotlar**: qo'shish/tahrirlash/o'chirish, rasmlar yuklash (bir nechta), narx, eski narx, ombor soni, "Ommabop"ga chiqarish, yashirish
- **Kategoriyalar**: nom, emoji, tartib, PC konfiguratorga qo'shish
- **Sozlamalar**: do'kon ma'lumotlari, **karta raqami**, yetkazib berish narxi, yig'ish xizmati narxi, bosh sahifa matnlari, **Telegram bot bildirishnoma**, parol

## Muhim
1. Admin panel → Sozlamalar'da **haqiqiy karta raqamingizni** kiriting (hozir `8600 0000 0000 0000` turibdi).
2. Demo mahsulotlarni o'z tovarlaringiz, narxlar va rasmlar bilan almashtiring.
3. Barcha ma'lumotlar `data/db.json` faylida, rasmlar `uploads/` papkasida — ularni muntazam zaxiralang.

## Internetga joylash
Node.js ishlaydigan har qanday VPS (masalan, Ubuntu server) yoki Render / Railway kabi xizmatlar mos keladi.
`data/` va `uploads/` papkalari doimiy diskda saqlanishi shart. Domen ulab, HTTPS (masalan Nginx + Let's Encrypt) yoqing.
