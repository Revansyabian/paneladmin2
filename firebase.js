 // Firebase config (pakai punyamu langsung)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAjlRquB8ofAAMeQ37KR1-dyrzBK9bgRGM",
  authDomain: "paneladmin-83c8a.firebaseapp.com",
  databaseURL: "https://paneladmin-83c8a-default-rtdb.firebaseio.com",
  projectId: "paneladmin-83c8a",
  storageBucket: "paneladmin-83c8a.appspot.com",
  messagingSenderId: "131199963153",
  appId: "1:131199963153:web:5dd60a1527f0cb86e44676"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Notifikasi
function showToast(msg, success = true) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.style.background = success ? "#28a745" : "#dc3545";
  toast.style.display = "block";
  setTimeout(() => { toast.style.display = "none"; }, 3000);
}

// Simpan Harga
window.simpanHarga = () => {
  const val = document.getElementById("hargaInput").value;
  if (!val.trim()) return showToast("Input harga kosong!", false);
  set(ref(db, 'harga'), val)
    .then(() => showToast("Harga berhasil disimpan!"))
    .catch(() => showToast("Gagal simpan harga!", false));
};

// Simpan Promo
window.simpanPromo = () => {
  const val = document.getElementById("promoInput").value;
  if (!val.trim()) return showToast("Input promo kosong!", false);
  set(ref(db, 'promo'), val)
    .then(() => showToast("Promo berhasil disimpan!"))
    .catch(() => showToast("Gagal simpan promo!", false));
};

// Simpan Testimoni
window.simpanTestimoni = () => {
  const val = document.getElementById("testimoniInput").value;
  if (!val.trim()) return showToast("Input testimoni kosong!", false);
  set(ref(db, 'testimoni'), val)
    .then(() => showToast("Testimoni berhasil disimpan!"))
    .catch(() => showToast("Gagal simpan testimoni!", false));
};

// 🔄 Real-time promo banner dari atas
  const promoTopEl = document.getElementById("promo-top");

  db.collection("promo_banner").onSnapshot((querySnapshot) => {
    if (querySnapshot.empty) {
      promoTopEl.classList.remove("show");
      promoTopEl.innerText = "";
    } else {
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        promoTopEl.innerText = data.teks || "🔥 Promo Menarik Menantimu!";
        promoTopEl.classList.add("show");
      });
    }
  }, (error) => {
    showToast("❌ Gagal memuat promo atas");
    console.error("Error promo atas:", error);
  });