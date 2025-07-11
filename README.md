# 🛠️ Panel Admin Top Up (Firebase + Vercel)

Panel admin web sederhana untuk mengatur:
- 💰 Harga
- 🌟 Testimoni
- 🎁 Promo

Semua data disimpan di Firebase Realtime Database.

---

## 🔧 Fitur Utama

- Edit dan lihat harga real-time
- Tambah dan hapus testimoni
- Tambah dan hapus promo
- Terhubung langsung ke Firebase
- Anti error (dengan validasi dan handler)
- Bisa di-deploy ke Vercel (static hosting)

---

## 🚀 Cara Pakai

### 1. Edit Firebase Config
Buka file `firebase.js` dan ganti bagian berikut jika pakai Firebase project lain:

```js
const firebaseConfig = {
  apiKey: "AIzaSyBd2z5p0G93InmRC_RFEhV2WfcAqYE9V_k",
  authDomain: "https://paneladmin-83c8a.firebaseapp.com",
  databaseURL: "https://paneladmin-83c8a-default-rtdb.firebaseio.com",
  ...
};
