<script type="module">
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
  import { getDatabase, ref, onValue, set, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

  const isAdmin = new URLSearchParams(location.search).get("admin") === "true";

  const promoTopEl = document.getElementById("promo-top");
  const promoRef = ref(db, "promo_banner");

  // Ambil data promo dari Firebase
  onValue(promoRef, (snapshot) => {
    const data = snapshot.val();
    if (data && data.teks && data.aktif) {
      promoTopEl.innerText = data.teks;
      promoTopEl.classList.add("show", "kedip"); // tambahkan animasi
    } else {
      promoTopEl.innerText = "";
      promoTopEl.classList.remove("show", "kedip");
    }
  }, (error) => {
    console.error("❌ Gagal memuat promo atas:", error);
  });

  // Maintenance
  const maintenanceRef = ref(db, "maintenance");
  const statusHeader = document.getElementById("statusHeader");
  const statusText = document.getElementById("maintenanceStatus");

  onValue(maintenanceRef, (snapshot) => {
    const aktif = snapshot.val();
    statusText.textContent = aktif ? "🔧 Maintenance: AKTIF" : "✅ Maintenance: NONAKTIF";
    if (!isAdmin) {
      statusHeader.textContent = aktif ? "🔧 Maintenance: AKTIF" : "✅ Maintenance: NONAKTIF";
    }
  });

  // Fungsi Update Promo Aktif/Nonaktif via Panel Admin
  window.togglePromo = function () {
    const promoToggle = document.getElementById("promoToggle");
    update(promoRef, {
      aktif: promoToggle.checked
    }).then(() => {
      alert("✅ Promo berhasil diperbarui");
    }).catch((err) => {
      alert("❌ Gagal update promo: " + err.message);
    });
  }

  // Tampilkan panel admin jika ada ?admin=true
  if (isAdmin) {
    document.getElementById("adminPanel").style.display = "block";
  }
</script>