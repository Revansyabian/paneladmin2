var API_REVANSTORE = 'api/revanstore';
var ADMIN_KEY = 'dhagwxwhu:f4afc5aa03e73130f5e055dfe6a708c4dc40759b';
var API_KEY = '835a198a-7843-4e13-a085-331eb891100e';

var currentAdmin = null;
var allUsers = [];
var loginAttempts = 0;
var loginBlocked = false;
var blockTimer = null;
var sessionTimer = null;
var alertTimeout = null;

function showAlert(t, m, type) {
    var overlay = document.getElementById('alertOverlay');
    var icon = document.getElementById('alertIcon');
    var title = document.getElementById('alertTitle');
    var msg = document.getElementById('alertMessage');
    
    if (!overlay || !icon || !title || !msg) return;
    
    title.textContent = t;
    msg.textContent = m;
    icon.innerHTML = '';
    icon.className = '';
    
    if (type === 'loading') {
        icon.innerHTML = '<div class="spinner"></div>';
    } else if (type === 'success') {
        icon.innerHTML = '<div class="checkmark"></div>';
    } else if (type === 'error') {
        icon.innerHTML = '<div class="crossmark"></div>';
    } else {
        icon.innerHTML = '<div class="info-icon">i</div>';
    }
    
    overlay.classList.add('show');
    
    if (alertTimeout) clearTimeout(alertTimeout);
    
    if (type !== 'loading') {
        alertTimeout = setTimeout(function() {
            overlay.classList.remove('show');
        }, 1000);
    }
}

function hideAlert() {
    var overlay = document.getElementById('alertOverlay');
    if (overlay) overlay.classList.remove('show');
}

function parseDate(d) {
    if (!d) return null;
    var p = d.split('/');
    if (p.length !== 3) return null;
    var m = parseInt(p[0]) - 1;
    var day = parseInt(p[1]);
    var y = parseInt(p[2]);
    if (isNaN(day) || isNaN(m) || isNaN(y)) return null;
    return new Date(y, m, day);
}

function formatDate(d) {
    return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') + '/' + d.getFullYear();
}

function calculateDaysLeft(e) {
    var ex = parseDate(e);
    if (!ex) return -9999;
    if (ex.getFullYear() === 9999) return 999999;
    var n = new Date();
    n.setHours(0, 0, 0, 0);
    return Math.floor((ex - n) / (1000 * 60 * 60 * 24));
}

function getStatus(d) {
    if (d === 999999) return { text: 'PERMANENT', class: 'status-permanent' };
    if (d <= 0) return { text: 'EXPIRED', class: 'status-expired' };
    if (d <= 3) return { text: 'SEGERA HABIS', class: 'status-warning' };
    return { text: 'AKTIF', class: 'status-aktif' };
}

function esc(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setQuickDate(t, p) {
    var f = t === 'new' ? 'newExpiryDate' : 'editExpiryDate';
    var d;
    if (p === 'permanent') {
        d = '12/31/9999';
    } else if (p === 'week') {
        d = new Date();
        d.setDate(d.getDate() + 7);
        d = formatDate(d);
    } else if (p === 'month') {
        d = new Date();
        d.setMonth(d.getMonth() + 1);
        d = formatDate(d);
    } else if (p === 'year') {
        d = new Date();
        d.setFullYear(d.getFullYear() + 1);
        d = formatDate(d);
    }
    document.getElementById(f).value = d;
}

function switchTab(t) {
    document.querySelectorAll('.tab').forEach(function(x) { x.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function(x) { x.classList.remove('active'); });
    if (t === 'adduser') {
        document.querySelectorAll('.tab')[0].classList.add('active');
        document.getElementById('adduser').classList.add('active');
    } else {
        document.querySelectorAll('.tab')[1].classList.add('active');
        document.getElementById('users').classList.add('active');
        loadUsers();
    }
}

function openEditModal(id) {
    var u = allUsers.find(function(x) { return x.id === id; });
    if (!u) return;
    document.getElementById('editUserId').value = id;
    document.getElementById('editUsername').value = u.username;
    document.getElementById('editPhone').value = u.phone || '';
    document.getElementById('editPassword').value = '';
    document.getElementById('editRole').value = u.role;
    document.getElementById('editExpiryDate').value = u.expiry_date;
    document.getElementById('editModal').classList.add('show');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('show');
}

function searchUsers() {
    var t = document.getElementById('searchUser').value.toLowerCase();
    if (t) {
        displayUsers(allUsers.filter(function(u) {
            return u.username.toLowerCase().includes(t) ||
                   u.role.toLowerCase().includes(t) ||
                   u.expiry_date.includes(t) ||
                   (u.phone && u.phone.includes(t));
        }));
    } else {
        displayUsers(allUsers);
    }
}

function displayUsers(users) {
    var c = document.getElementById('userListContainer');
    document.getElementById('totalUsers').textContent = users.length;
    document.getElementById('userCount').textContent = users.length;
    
    if (!users.length) {
        c.innerHTML = '<div style="text-align:center;padding:40px;color:#aabbcc;">Tidak ada user</div>';
        return;
    }
    
    users.sort(function(a, b) { return a.username.localeCompare(b.username); });
    
    var h = '';
    users.forEach(function(u) {
        var d = calculateDaysLeft(u.expiry_date);
        var s = getStatus(d);
        var dt = d === 999999 ? 'PERMANENT' : (d < 0 ? Math.abs(d) + ' hari lalu' : d + ' hari tersisa');
        
        h += '<div class="user-item">';
        h += '<div class="user-name"><span>' + esc(u.username) + '</span><span class="user-status ' + s.class + '">' + s.text + '</span></div>';
        h += '<div class="user-details">📱 ' + esc(u.phone || '-') + ' | 🔑 ' + esc(u.password) + ' | 🎭 ' + esc(u.role) + '</div>';
        h += '<div class="user-details">📅 Aktif: ' + esc(u.expiry_date) + ' | ⏰ ' + dt + '</div>';
        h += '<div class="action-buttons">';
        h += '<button class="btn-small btn-orange" onclick="openEditModal(\'' + u.id + '\')">Edit</button>';
        h += '<button class="btn-small btn-purple" onclick="setSingleUserPermanent(\'' + u.id + '\',\'' + esc(u.username) + '\')">Permanent</button>';
        h += '<button class="btn-small btn-red" onclick="deleteUserConfirm(\'' + u.id + '\',\'' + esc(u.username) + '\')">Hapus</button>';
        h += '</div></div>';
    });
    
    c.innerHTML = h;
}

async function apiCall(path, method, data) {
    var payload = CryptoJS.AES.encrypt(JSON.stringify({ path: path, method: method, data: data }), ADMIN_KEY).toString();
    
    var res = await fetch(API_REVANSTORE, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY
        },
        body: JSON.stringify({ data: payload })
    });
    
    if (!res.ok) {
        throw new Error('Server error: ' + res.status);
    }
    
    var result = await res.json();
    
    if (result.error) {
        throw new Error(result.error);
    }
    
    if (result.encrypted) {
        var dec = CryptoJS.AES.decrypt(result.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
        return JSON.parse(dec);
    }
    
    return result;
}

async function login() {
    if (loginBlocked) {
        var remaining = Math.ceil((blockTimer - Date.now()) / 1000 / 60);
        if (remaining <= 0) {
            loginBlocked = false;
            loginAttempts = 0;
            blockTimer = null;
        } else {
            return showAlert('Diblokir', 'Coba lagi dalam ' + remaining + ' menit.', 'error');
        }
    }
    
    var email = document.getElementById('loginEmail').value.trim();
    var pass = document.getElementById('loginPassword').value.trim();
    
    if (!email || !pass) return showAlert('Error', 'Email dan password wajib diisi', 'error');
    
    showAlert('Memverifikasi', 'Mohon tunggu sebentar...', 'loading');
    
    try {
        var r = await apiCall('admin/auth', 'GET');
        
        if (r && r.email === email && r.password === pass) {
            loginAttempts = 0;
            loginBlocked = false;
            blockTimer = null;
            currentAdmin = email;
            
            document.getElementById('loggedUser').textContent = email;
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('adminPanel').style.display = 'block';
            document.querySelector('.container').style.maxWidth = '850px';
            
            hideAlert();
            showAlert('Berhasil', 'Login berhasil!', 'success');
            
            if (sessionTimer) clearTimeout(sessionTimer);
            sessionTimer = setTimeout(function() {
                if (currentAdmin) {
                    logout();
                    showAlert('Sesi Berakhir', 'Tidak ada aktivitas selama 30 menit.', 'info');
                }
            }, 30 * 60 * 1000);
            
            await loadUsers();
        } else {
            loginAttempts++;
            if (loginAttempts >= 5) {
                loginBlocked = true;
                blockTimer = Date.now() + (15 * 60 * 1000);
                showAlert('Diblokir', 'Terlalu banyak percobaan. Akun diblokir 15 menit.', 'error');
            } else {
                showAlert('Gagal', 'Email atau password salah. Sisa percobaan: ' + (5 - loginAttempts), 'error');
            }
        }
    } catch (e) {
        showAlert('Error', e.message, 'error');
    }
}

function logout() {
    currentAdmin = null;
    if (sessionTimer) clearTimeout(sessionTimer);
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('loginPassword').value = '';
    document.querySelector('.container').style.maxWidth = '420px';
    showAlert('Logout', 'Anda telah logout.', 'info');
}

async function loadUsers() {
    try {
        var data = await apiCall('users', 'GET');
        allUsers = [];
        for (var key in data) {
            if (data[key] && data[key].username) {
                data[key].id = key;
                allUsers.push(data[key]);
            }
        }
        displayUsers(allUsers);
    } catch (e) {
        showAlert('Error', 'Gagal memuat data user.', 'error');
    }
}

async function addUserNow() {
    var u = document.getElementById('newUser').value.trim();
    var ph = document.getElementById('newPhone').value.trim();
    var p = document.getElementById('newPass').value.trim();
    var r = document.getElementById('newRole').value;
    var e = document.getElementById('newExpiryDate').value.trim();
    
    if (!u || !p || !e) return showAlert('Error', 'Username, password, dan masa aktif wajib diisi', 'error');
    if (p.length < 6) return showAlert('Error', 'Password minimal 6 karakter', 'error');
    
    showAlert('Proses', 'Menambahkan user...', 'loading');
    
    try {
        await apiCall('users', 'POST', {
            username: u,
            phone: ph,
            password: p,
            role: r,
            expiry_date: e
        });
        
        document.getElementById('newUser').value = '';
        document.getElementById('newPhone').value = '';
        document.getElementById('newPass').value = '';
        
        showAlert('Berhasil', 'User berhasil ditambahkan!', 'success');
        await loadUsers();
        switchTab('users');
    } catch (e) {
        showAlert('Error', e.message, 'error');
    }
}

async function saveUserChanges() {
    var id = document.getElementById('editUserId').value;
    var u = document.getElementById('editUsername').value.trim();
    var ph = document.getElementById('editPhone').value.trim();
    var p = document.getElementById('editPassword').value.trim();
    var r = document.getElementById('editRole').value;
    var e = document.getElementById('editExpiryDate').value.trim();
    
    if (!id || !u || !e) return showAlert('Error', 'Username dan masa aktif wajib diisi', 'error');
    
    showAlert('Proses', 'Menyimpan perubahan...', 'loading');
    
    var data = { username: u, phone: ph, role: r, expiry_date: e };
    if (p) data.password = p;
    
    try {
        await apiCall('users/' + id, 'PATCH', data);
        closeEditModal();
        showAlert('Berhasil', 'User berhasil diperbarui!', 'success');
        await loadUsers();
    } catch (e) {
        showAlert('Error', e.message, 'error');
    }
}

function deleteUserConfirm(id, name) {
    if (confirm('Yakin hapus user "' + name + '"?')) {
        deleteUser(id);
    }
}

async function deleteUser(id) {
    showAlert('Proses', 'Menghapus user...', 'loading');
    try {
        await apiCall('users/' + id, 'DELETE');
        showAlert('Berhasil', 'User berhasil dihapus!', 'success');
        await loadUsers();
    } catch (e) {
        showAlert('Error', 'Gagal menghapus user.', 'error');
    }
}

async function setSingleUserPermanent(id, name) {
    if (!confirm('Jadikan "' + name + '" PERMANENT?')) return;
    
    showAlert('Proses', 'Mengubah status...', 'loading');
    try {
        await apiCall('users/' + id, 'PATCH', { expiry_date: '12/31/9999' });
        showAlert('Berhasil', name + ' sekarang PERMANENT!', 'success');
        await loadUsers();
    } catch (e) {
        showAlert('Error', 'Gagal mengubah status.', 'error');
    }
}

async function setAllUsersPermanent() {
    if (!confirm('Jadikan SEMUA user PERMANENT?')) return;
    
    showAlert('Proses', 'Mengubah semua user...', 'loading');
    try {
        var count = 0;
        for (var i = 0; i < allUsers.length; i++) {
            await apiCall('users/' + allUsers[i].id, 'PATCH', { expiry_date: '12/31/9999' });
            count++;
        }
        showAlert('Berhasil', count + ' user jadi PERMANENT!', 'success');
        await loadUsers();
    } catch (e) {
        showAlert('Error', 'Gagal mengubah semua user.', 'error');
    }
}

// Init
document.addEventListener('DOMContentLoaded', function() {
    var nm = new Date();
    nm.setMonth(nm.getMonth() + 1);
    document.getElementById('newExpiryDate').value = formatDate(nm);
    
    document.getElementById('loginPassword').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') login();
    });
    
    // Reset session timer on any click
    document.addEventListener('click', function() {
        if (currentAdmin && sessionTimer) {
            clearTimeout(sessionTimer);
            sessionTimer = setTimeout(function() {
                if (currentAdmin) {
                    logout();
                    showAlert('Sesi Berakhir', 'Tidak ada aktivitas selama 30 menit.', 'info');
                }
            }, 30 * 60 * 1000);
        }
    });
    
    // Close modal on outside click
    document.getElementById('editModal').addEventListener('click', function(e) {
        if (e.target === this) closeEditModal();
    });
});