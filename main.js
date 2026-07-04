var API_REVANSTORE = '/api/revanstore';
var ADMIN_KEY = 'dhagwxwhu:f4afc5aa03e73130f5e055dfe6a708c4dc40759b';

var currentAdmin = null;
var allUsers = [];
var loginAttempts = 0;
var loginBlocked = false;
var blockTimer = null;
var sessionTimer = null;
var csrfToken = '';

csrfToken = CryptoJS.SHA256(Date.now() + Math.random().toString()).toString();

function parseDate(d) {
    if (!d) return null;
    var p = d.split('/');
    if (p.length !== 3) return null;
    var m = parseInt(p[0]) - 1;
    var day = parseInt(p[1]);
    var y = parseInt(p[2]);
    if (isNaN(day) || isNaN(m) || isNaN(y)) return null;
    if (m < 0 || m > 11 || day < 1 || day > 31 || y < 1000 || y > 9999) return null;
    var dt = new Date(y, m, day);
    if (y === 9999) return dt;
    if (dt.getMonth() !== m || dt.getDate() !== day || dt.getFullYear() !== y) return null;
    return dt;
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
    if (d === 999999) return { text: 'PERMANENT', class: 'status-permanent', icon: '♾️' };
    if (d <= 0) return { text: 'EXPIRED', class: 'status-expired', icon: '⏰' };
    if (d <= 3) return { text: 'SEGERA HABIS', class: 'status-warning', icon: '⚠️' };
    return { text: 'AKTIF', class: 'status-aktif', icon: '✅' };
}

function esc(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function showAlert(t, m, type) {
    var b = document.getElementById('alertBox');
    document.getElementById('alertTitle').textContent = t;
    document.getElementById('alertMessage').textContent = m;
    b.className = 'alert-box alert-' + type + ' show';
    setTimeout(function() { b.classList.remove('show'); }, 5000);
}

function setQuickDate(t, p) {
    var f = t === 'new' ? 'newExpiryDate' : 'editExpiryDate';
    var d;
    if (p === 'permanent') d = '12/31/9999';
    else if (p === 'week') { d = new Date(); d.setDate(d.getDate() + 7); d = formatDate(d); }
    else if (p === 'month') { d = new Date(); d.setMonth(d.getMonth() + 1); d = formatDate(d); }
    else if (p === 'year') { d = new Date(); d.setFullYear(d.getFullYear() + 1); d = formatDate(d); }
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
    if (!u) return showAlert('Error', 'User tidak ditemukan', 'error');
    document.getElementById('editUserId').value = id;
    document.getElementById('editUsername').value = u.username;
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
            return u.username.toLowerCase().includes(t) || u.role.toLowerCase().includes(t) || u.expiry_date.includes(t);
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
        var cd = u.created ? new Date(u.created).toLocaleDateString('id-ID') : '-';
        var dt = d === 999999 ? 'PERMANENT' : (d < 0 ? Math.abs(d) + ' hari lalu' : d + ' hari tersisa');
        
        h += '<div class="user-item">';
        h += '<div class="user-name"><span>' + esc(u.username) + '</span><span class="user-status ' + s.class + '">' + s.icon + ' ' + s.text + '</span></div>';
        h += '<div class="user-details">Password: ' + esc(u.password) + ' &bull; Role: ' + esc(u.role) + '</div>';
        h += '<div class="user-details">Aktif: ' + esc(u.expiry_date) + ' &bull; ' + dt + '</div>';
        h += '<div class="user-details" style="font-size:11px;opacity:0.6;">Dibuat: ' + cd + ' &bull; Oleh: ' + esc(u.created_by) + '</div>';
        h += '<div class="action-buttons">';
        h += '<button class="btn-small btn-orange" onclick="openEditModal(\'' + u.id + '\')">Edit</button>';
        h += '<button class="btn-small btn-purple" onclick="setSingleUserPermanent(\'' + u.id + '\',\'' + esc(u.username) + '\')">Permanent</button>';
        h += '<button class="btn-small btn-red" onclick="deleteUserConfirm(\'' + u.id + '\',\'' + esc(u.username) + '\')">Hapus</button>';
        h += '</div></div>';
    });
    
    c.innerHTML = h;
}

async function apiCall(path, method, data) {
    var payload = CryptoJS.AES.encrypt(JSON.stringify({
        path: path,
        method: method,
        data: data,
        csrf: csrfToken,
        timestamp: Date.now()
    }), ADMIN_KEY).toString();
    
    var res = await fetch(API_REVANSTORE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: payload })
    });
    
    var result = await res.json();
    
    if (result.encrypted) {
        var dec = CryptoJS.AES.decrypt(result.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
        return JSON.parse(dec);
    }
    return result;
}

async function login() {
    if (loginBlocked) {
        var remaining = Math.ceil((blockTimer - Date.now()) / 1000 / 60);
        return showAlert('Diblokir', 'Terlalu banyak percobaan. Coba lagi dalam ' + remaining + ' menit.', 'error');
    }
    
    var email = document.getElementById('loginEmail').value.trim();
    var pass = document.getElementById('loginPassword').value.trim();
    
    if (!email || !pass) return showAlert('Error', 'Email dan password wajib diisi', 'error');
    
    showAlert('Info', 'Memverifikasi...', 'info');
    
    try {
        var r = await apiCall('login', 'POST', { email: email, password: pass });
        
        if (r.success) {
            loginAttempts = 0;
            currentAdmin = email;
            document.getElementById('loggedUser').textContent = email;
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('adminPanel').style.display = 'block';
            document.getElementById('adminPanel').style.maxWidth = '850px';
            document.querySelector('.container').style.maxWidth = '850px';
            showAlert('Berhasil', 'Login berhasil', 'success');
            
            if (sessionTimer) clearTimeout(sessionTimer);
            sessionTimer = setTimeout(function() {
                if (currentAdmin) {
                    logout();
                    showAlert('Sesi Berakhir', 'Sesi berakhir karena tidak ada aktivitas.', 'info');
                }
            }, 30 * 60 * 1000);
            
            await loadUsers();
        } else {
            loginAttempts++;
            if (loginAttempts >= 5) {
                loginBlocked = true;
                blockTimer = Date.now() + (15 * 60 * 1000);
                showAlert('Diblokir', 'Terlalu banyak percobaan login. Akun diblokir selama 15 menit.', 'error');
            } else {
                var sisa = 5 - loginAttempts;
                showAlert('Gagal', r.error || 'Login gagal. Sisa percobaan: ' + sisa, 'error');
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
    showAlert('Info', 'Berhasil logout', 'info');
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
        showAlert('Error', 'Gagal memuat data', 'error');
    }
}

async function addUserNow() {
    var u = document.getElementById('newUser').value.trim();
    var p = document.getElementById('newPass').value.trim();
    var r = document.getElementById('newRole').value;
    var e = document.getElementById('newExpiryDate').value.trim();
    
    if (!u || !p || !e) return showAlert('Error', 'Semua field wajib diisi', 'error');
    if (p.length < 8) return showAlert('Error', 'Password minimal 8 karakter', 'error');
    if (!/[a-zA-Z]/.test(p)) return showAlert('Error', 'Password harus mengandung huruf', 'error');
    if (!/[0-9]/.test(p)) return showAlert('Error', 'Password harus mengandung angka', 'error');
    if (!e.match(/^\d{2}\/\d{2}\/\d{4}$/)) return showAlert('Error', 'Format tanggal: MM/DD/YYYY', 'error');
    
    try {
        showAlert('Info', 'Menambahkan user...', 'info');
        await apiCall('users', 'POST', {
            username: u,
            password: p,
            role: r,
            expiry_date: e,
            created_by: currentAdmin
        });
        
        document.getElementById('newUser').value = '';
        document.getElementById('newPass').value = '';
        showAlert('Berhasil', 'User berhasil ditambahkan', 'success');
        await loadUsers();
        switchTab('users');
    } catch (e) {
        showAlert('Error', e.message, 'error');
    }
}

async function saveUserChanges() {
    var id = document.getElementById('editUserId').value;
    var u = document.getElementById('editUsername').value.trim();
    var p = document.getElementById('editPassword').value.trim();
    var r = document.getElementById('editRole').value;
    var e = document.getElementById('editExpiryDate').value.trim();
    
    if (!id || !u || !e) return showAlert('Error', 'Field wajib diisi', 'error');
    if (p && p.length < 8) return showAlert('Error', 'Password minimal 8 karakter', 'error');
    if (p && !/[a-zA-Z]/.test(p)) return showAlert('Error', 'Password harus mengandung huruf', 'error');
    if (p && !/[0-9]/.test(p)) return showAlert('Error', 'Password harus mengandung angka', 'error');
    
    var data = { username: u, role: r, expiry_date: e, updated_by: currentAdmin };
    if (p) data.password = p;
    
    try {
        await apiCall('users/' + id, 'PATCH', data);
        closeEditModal();
        showAlert('Berhasil', 'User berhasil diperbarui', 'success');
        await loadUsers();
    } catch (e) {
        showAlert('Error', e.message, 'error');
    }
}

function deleteUserConfirm(id, name) {
    if (confirm('Hapus user "' + name + '"?')) deleteUser(id);
}

async function deleteUser(id) {
    try {
        await apiCall('users/' + id, 'DELETE');
        showAlert('Berhasil', 'User berhasil dihapus', 'success');
        await loadUsers();
    } catch (e) {
        showAlert('Error', 'Gagal menghapus user', 'error');
    }
}

async function setSingleUserPermanent(id, name) {
    if (!confirm('Jadikan "' + name + '" PERMANENT?')) return;
    try {
        await apiCall('users/' + id, 'PATCH', { expiry_date: '12/31/9999' });
        showAlert('Berhasil', name + ' sekarang PERMANENT', 'permanent');
        await loadUsers();
    } catch (e) {
        showAlert('Error', 'Gagal', 'error');
    }
}

async function setAllUsersPermanent() {
    if (!confirm('Jadikan SEMUA user PERMANENT?')) return;
    try {
        var count = 0;
        for (var i = 0; i < allUsers.length; i++) {
            await apiCall('users/' + allUsers[i].id, 'PATCH', { expiry_date: '12/31/9999' });
            count++;
        }
        showAlert('Berhasil', count + ' user diubah menjadi PERMANENT', 'permanent');
        await loadUsers();
    } catch (e) {
        showAlert('Error', 'Gagal', 'error');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    var nm = new Date();
    nm.setMonth(nm.getMonth() + 1);
    document.getElementById('newExpiryDate').value = formatDate(nm);
    
    document.getElementById('loginPassword').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') login();
    });
    
    document.addEventListener('click', function() {
        if (currentAdmin) {
            if (sessionTimer) clearTimeout(sessionTimer);
            sessionTimer = setTimeout(function() {
                if (currentAdmin) {
                    logout();
                    showAlert('Sesi Berakhir', 'Sesi berakhir karena tidak ada aktivitas.', 'info');
                }
            }, 30 * 60 * 1000);
        }
    });
});