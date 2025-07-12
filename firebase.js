 import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

const promoTopEl = document.getElementById("promo-top");

const promoRef = ref(db, "promo_banner");
onValue(promoRef, (snapshot) => {
  const data = snapshot.val();
  if (data && data.teks) {
    promoTopEl.innerText = data.teks;
    promoTopEl.classList.add("show");
  } else {
    promoTopEl.innerText = "";
    promoTopEl.classList.remove("show");
  }
}, (error) => {
  showToast("❌ Gagal memuat promo atas");
  console.error("Error promo atas:", error);
const statusHeader = document.getElementById("statusHeader");
...
statusText.textContent = aktif ? "🔧 Maintenance: AKTIF" : "✅ Maintenance: NONAKTIF";
if (!isAdmin) {
  statusHeader.textContent = aktif ? "🔧 Maintenance: AKTIF" : "✅ Maintenance: NONAKTIF";
}
});