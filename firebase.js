import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, get, push, onValue, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Konfigurasi Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB_pWpsAfO0UZ0DC6StRG0IkkZ7kkH2whQ",
  authDomain: "paneladmin-83c8a.firebaseapp.com",
  databaseURL:
"https://paneladmin-83c8a-default-rtdb.firebaseio.com",",
  projectId: "paneladmin-83c8a",
  storageBucket: "paneladmin-83c8a.appspot.com",
  messagingSenderId: "338628300981",
  appId: "1:338628300981:web:a4cf7265c6c9835463103f"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const errorBox = document.getElementById("errorBox");

// --- Harga ---
document.getElementById("hargaBaru").addEventListener("change", function () {
  const harga = this.value;
  const hargaRef = ref(database, "harga");

  set(hargaRef, harga)
    .then(() => showToast("Harga otomatis disimpan!", "green"))
    .catch((error) => showToast("Gagal menyimpan: " + error.message, "red"));
});
get(hargaRef).then((snap) => {
  currentHarga.innerText = snap.exists() ? snap.val() : 'Belum diatur';
}).catch(handleError);

window.updateHarga = () => {
  const val = hargaInput.value.trim();
  if (!val || isNaN(val)) return showError("Harga harus berupa angka!");

  set(hargaRef, val)
    .then(() => {
      currentHarga.innerText = val;
      hargaInput.value = '';
      clearError();
    })
    .catch(handleError);
};

// --- Testimoni ---
const testimoniRef = ref(db, 'testimoni');
const testimoniList = document.getElementById('testimoniList');
const testimoniInput = document.getElementById('testimoniInput');

function loadTestimoni() {
  onValue(testimoniRef, (snapshot) => {
    testimoniList.innerHTML = '';
    snapshot.forEach((child) => {
      const li = document.createElement('li');
      li.textContent = child.val();
      li.title = 'Klik untuk hapus';
      li.onclick = () => {
        if (confirm("Hapus testimoni ini?")) {
          remove(ref(db, `testimoni/${child.key}`)).catch(handleError);
        }
      };
      testimoniList.appendChild(li);
    });
  }, handleError);
}
loadTestimoni();

window.tambahTestimoni = () => {
  const val = testimoniInput.value.trim();
  if (!val) return showError("Testimoni tidak boleh kosong.");

  push(testimoniRef, val)
    .then(() => {
      testimoniInput.value = '';
      clearError();
    })
    .catch(handleError);
};

// --- Promo ---
const promoRef = ref(db, 'promo');
const promoList = document.getElementById('promoList');
const promoInput = document.getElementById('promoInput');

function loadPromo() {
  onValue(promoRef, (snapshot) => {
    promoList.innerHTML = '';
    snapshot.forEach((child) => {
      const li = document.createElement('li');
      li.textContent = child.val();
      li.title = 'Klik untuk hapus';
      li.onclick = () => {
        if (confirm("Hapus promo ini?")) {
          remove(ref(db, `promo/${child.key}`)).catch(handleError);
        }
      };
      promoList.appendChild(li);
    });
  }, handleError);
}
loadPromo();

window.tambahPromo = () => {
  const val = promoInput.value.trim();
  if (!val) return showError("Promo tidak boleh kosong.");

  push(promoRef, val)
    .then(() => {
      promoInput.value = '';
      clearError();
    })
    .catch(handleError);
};

// --- Error Handling ---
function showError(msg) {
  errorBox.innerText = msg;
}
function clearError() {
  errorBox.innerText = '';
}
function handleError(error) {
  console.error(error);
  showError("Terjadi kesalahan saat memuat/menyimpan data.");
};

// Toast Notifikasi
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.innerText = message;
  toast.style.backgroundColor = type === "success" ? "green" : "red";
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
}

// Fungsi update harga
function updateHarga() {
  const harga = document.getElementById("hargaBaru").value;
  const hargaRef = ref(database, "harga");

  set(hargaRef, harga)
    .then(() => showToast("Harga berhasil diupdate!", "green"))
    .catch((error) => showToast("Gagal update: " + error.message, "red"));
}