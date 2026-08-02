// ==================== ANTI DEVTOOLS ====================
document.addEventListener('keydown', function(e) {
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I') || (e.ctrlKey && e.key === 'U')) {
        e.preventDefault();
        return false;
    }
});

document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    return false;
});

var devtoolsOpen = false;
setInterval(function() {
    if (window.outerWidth - window.innerWidth > 160 || window.outerHeight - window.innerHeight > 160) {
        if (!devtoolsOpen) {
            devtoolsOpen = true;
            document.body.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;background:#1a1a2e;color:#fff;font-size:18px;font-family:sans-serif">DevTools terdeteksi! Tutup untuk melanjutkan.</div>';
        }
    } else {
        devtoolsOpen = false;
    }
}, 1000);

// ==================== CONFIG ====================
var API_URL = '/api/revanstore';
var ADMIN_KEY = 'dhagwxwhu:f4afc5aa03e73130f5e055dfe6a708c4dc40759b';
var API_KEY = '835a198a-7843-4e13-a085-331eb891100e';

var currentAdmin = null;
var allUsers = [];
var allBlockedIPs = [];
var fingerprint = '';
var keyAttempts = 0;
var loginAttempts = 0;
var loginBlocked = false;
var blockTimer = null;
var sessionTimer = null;
var alertTimeout = null;

// ==================== FINGERPRINT ====================
async function getFingerprint() {
    var fp = '';
    fp += navigator.userAgent || '';
    fp += navigator.language || '';
    fp += (screen.width || 0) + 'x' + (screen.height || 0);
    fp += screen.colorDepth || '';
    fp += new Date().getTimezoneOffset();
    fp += navigator.hardwareConcurrency || '';
    fp += navigator.deviceMemory || '';
    fp += navigator.platform || '';
    return CryptoJS.MD5(fp).toString();
}

// ==================== ALERT ====================
function showAlert(t, m, type) {
    var overlay = document.getElementById('alertOverlay');
    var icon = document.getElementById('alertIcon');
    var title = document.getElementById('alertTitle');
    var msg = document.getElementById('alertMessage');
    if (!overlay) return;

    title.textContent = t;
    msg.textContent = m;
    icon.innerHTML = '';

    if (type === 'loading') {
        icon.innerHTML = '<div class="spinner"></div>';
    } else if (type === 'success') {
        icon.innerHTML = '<div style="font-size:44px;color:#10b981"><i class="fas fa-check-circle"></i></div>';
    } else if (type === 'error') {
        icon.innerHTML = '<div style="font-size:44px;color:#ef4444"><i class="fas fa-times-circle"></i></div>';
    } else {
        icon.innerHTML = '<div style="font-size:44px;color:#00bfff"><i class="fas fa-info-circle"></i></div>';
    }

    overlay.classList.add('show');
    if (alertTimeout) clearTimeout(alertTimeout);
    if (type !== 'loading') {
        alertTimeout = setTimeout(function() { overlay.classList.remove('show'); }, 1800);
    }
}

function hideAlert() {
    document.getElementById('alertOverlay').classList.remove('show');
}

// ==================== HELPERS ====================
function parseDate(d) { if (!d) return null; var p = d.split('/'); if (p.length !== 3) return null; return new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1])); }
function formatDate(d) { return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') + '/' + d.getFullYear(); }
function calculateDaysLeft(e) { var ex = parseDate(e); if (!ex) return -9999; if (ex.getFullYear() === 9999) return 999999; var n = new Date(); n.setHours(0, 0, 0, 0); return Math.floor((ex - n) / (1000 * 60 * 60 * 24)); }
function getStatus(d) { if (d === 999999) return { text: 'PERMANENT', class: 'badge-permanent' }; if (d <= 0) return { text: 'EXPIRED', class: 'badge-expired' }; if (d <= 3) return { text: 'SEGERA HABIS', class: 'badge-warning' }; return { text: 'AKTIF', class: 'badge-active' }; }
function esc(s) { if (!s) return ''; return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function setQuickDate(t, p) {
    var f = t === 'new' ? 'newExpiryDate' : 'editExpiryDate';
    var d;
    if (p === 'permanent') d = '12/31/9999';
    else if (p === 'week') { d = new Date(); d.setDate(d.getDate() + 7); d = formatDate(d); }
    else if (p === 'month') { d = new Date(); d.setMonth(d.getMonth() + 1); d = formatDate(d); }
    else if (p === 'year') { d = new Date(); d.setFullYear(d.getFullYear() + 1); d = formatDate(d); }
    document.getElementById(f).value = d;
}

// ==================== API CALL ====================
async function apiCall(path, method, data) {
    if (!fingerprint) fingerprint = await getFingerprint();
    var payload = CryptoJS.AES.encrypt(JSON.stringify({ path: path, method: method, data: data }), ADMIN_KEY).toString();
    var res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'X-Fingerprint': fingerprint },
        body: JSON.stringify({ data: payload })
    });
    if (!res.ok) throw new Error('Server error: ' + res.status);
    var result = await res.json();
    if (result.error) throw new Error(result.error);
    if (result.encrypted) { var dec = CryptoJS.AES.decrypt(result.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8); return JSON.parse(dec); }
    return result;
}

// ==================== VERIFY KEY ====================
async function verifyKey() {
    var key = document.getElementById('accessKey').value.trim();
    if (!key) return showAlert('Error', 'Key wajib diisi', 'error');
    showAlert('Verifikasi', 'Memeriksa key...', 'loading');
    try {
        var r = await apiCall('access_key', 'GET');
        if (r && r.key === key) {
            keyAttempts = 0;
            document.getElementById('keyScreen').style.display = 'none';
            document.getElementById('loginScreen').style.display = 'block';
            document.getElementById('accessKey').value = '';
            hideAlert();
            showAlert('Berhasil', 'Key valid!', 'success');
        } else {
            keyAttempts++;
            document.getElementById('accessKey').value = '';
            hideAlert();
            if (keyAttempts >= 3) {
                showAlert('Error', 'Key salah 3x! Akses diblokir.', 'error');
                setTimeout(async function() {
                    for (var i = 0; i < 5; i++) { await apiCall('admin/login_failed', 'POST', {}); }
                    showBlockedScreen();
                }, 1500);
                return;
            }
            showAlert('Error', 'Key salah! Sisa ' + (3 - keyAttempts), 'error');
        }
    } catch (e) { hideAlert(); showAlert('Error', 'Gagal verifikasi key', 'error'); }
}

function showBlockedScreen() {
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:20px;font-family:\'Segoe UI\',sans-serif;position:fixed;top:0;left:0;width:100%;height:100vh;background:#f8fafc"><div style="background:#fff;border-radius:20px;padding:40px 30px;max-width:420px;width:100%;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.04);border:1px solid #e2e8f0"><div style="font-size:56px;color:#ef4444;margin-bottom:18px"><i class="fas fa-lock"></i></div><h1 style="color:#1a1a2e;font-size:22px;margin-bottom:8px">AKSES DITOLAK</h1><p style="color:#64748b;font-size:14px">Maaf, akses Anda telah diblokir permanen.</p></div></div>';
}

// ==================== LOGIN ====================
async function login() {
    if (loginBlocked) {
        var remaining = blockTimer ? Math.ceil((blockTimer - Date.now()) / 1000 / 60) : 0;
        if (remaining <= 0) { loginBlocked = false; loginAttempts = 0; blockTimer = null; }
        else return showAlert('Diblokir', 'Coba lagi dalam ' + remaining + ' menit.', 'error');
    }
    var email = document.getElementById('loginEmail').value.trim();
    var pass = document.getElementById('loginPassword').value.trim();
    if (!email || !pass) return showAlert('Error', 'Email dan password wajib diisi', 'error');
    showAlert('Memverifikasi', 'Mohon tunggu...', 'loading');
    try {
        var r = await apiCall('admin/auth', 'GET');
        if (r && r.blocked) { hideAlert(); showBlockedScreen(); return; }
        if (r && r.email === email && r.password === pass) {
            await apiCall('admin/login_success', 'POST', {});
            loginAttempts = 0; loginBlocked = false; blockTimer = null; currentAdmin = email;
            document.getElementById('loggedUser').textContent = email;
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('adminPanel').style.display = 'block';
            document.getElementById('mainContainer').style.maxWidth = '920px';
            hideAlert(); showAlert('Berhasil', 'Login berhasil!', 'success');
            if (sessionTimer) clearTimeout(sessionTimer);
            sessionTimer = setTimeout(function() { if (currentAdmin) { logout(); showAlert('Sesi Berakhir', 'Tidak ada aktivitas selama 30 menit.', 'info'); } }, 30 * 60 * 1000);
            await loadUsers();
        } else {
            var track = await apiCall('admin/login_failed', 'POST', {});
            if (track && track.blocked) { hideAlert(); showBlockedScreen(); return; }
            showAlert('Gagal', 'Email atau password salah. Sisa ' + (track ? track.remaining : '?'), 'error');
        }
    } catch (e) { showAlert('Error', e.message, 'error'); }
}

function logout() {
    currentAdmin = null;
    if (sessionTimer) clearTimeout(sessionTimer);
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('keyScreen').style.display = 'none';
    document.getElementById('loginPassword').value = '';
    document.getElementById('mainContainer').style.maxWidth = '440px';
    showAlert('Logout', 'Anda telah logout.', 'info');
}

// ==================== TABS ====================
function switchTab(t) {
    var tabs = document.querySelectorAll('.tab');
    var contents = document.querySelectorAll('.tab-content');
    tabs.forEach(function(x) { x.classList.remove('active'); });
    contents.forEach(function(x) { x.classList.remove('active'); });
    if (t === 'adduser') { tabs[0].classList.add('active'); document.getElementById('adduser').classList.add('active'); }
    else if (t === 'users') { tabs[1].classList.add('active'); document.getElementById('users').classList.add('active'); loadUsers(); }
    else if (t === 'banned') { tabs[2].classList.add('active'); document.getElementById('banned').classList.add('active'); loadUsers(); }
    else if (t === 'blocked') { tabs[3].classList.add('active'); document.getElementById('blocked').classList.add('active'); loadBlockedIPs(); }
}

// ==================== USERS ====================
async function loadUsers() {
    try {
        var data = await apiCall('users', 'GET');
        allUsers = [];
        for (var key in data) { if (data[key] && data[key].username) { data[key].id = key; allUsers.push(data[key]); } }
        displayUsers(allUsers.filter(function(u) { return !u.banned; }));
        displayBannedUsers(allUsers.filter(function(u) { return u.banned; }));
    } catch (e) { showAlert('Error', 'Gagal memuat data user.', 'error'); }
}

function displayUsers(users) {
    var c = document.getElementById('userListContainer');
    document.getElementById('totalUsers').textContent = users.length;
    document.getElementById('userCount').textContent = users.length;
    if (!users.length) { c.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-text">Tidak ada user</div></div>'; return; }
    users.sort(function(a, b) { return a.username.localeCompare(b.username); });
    var h = '';
    users.forEach(function(u) {
        var d = calculateDaysLeft(u.expiry_date);
        var s = getStatus(d);
        var dt = d === 999999 ? 'PERMANENT' : (d < 0 ? Math.abs(d) + ' hari lalu' : d + ' hari tersisa');
        var initial = u.username.charAt(0).toUpperCase();
        h += '<div class="user-card">';
        h += '<div class="user-card-top">';
        h += '<div class="user-card-name"><div class="avatar">' + initial + '</div>' + esc(u.username) + '</div>';
        h += '<span class="user-badge ' + s.class + '">' + s.text + '</span>';
        h += '</div>';
        h += '<div class="user-card-info">';
        h += '<span><i class="fas fa-phone"></i> ' + esc(u.phone || '-') + '</span>';
        h += '<span><i class="fas fa-key"></i> ' + esc(u.password) + '</span>';
        h += '<span><i class="fas fa-user-tag"></i> ' + esc(u.role) + '</span>';
        h += '<span><i class="fas fa-calendar"></i> ' + esc(u.expiry_date) + '</span>';
        h += '<span><i class="fas fa-clock"></i> ' + dt + '</span>';
        h += '</div>';
        h += '<div class="user-card-actions">';
        h += '<button class="btn-sm btn-primary" onclick="openEditModal(\'' + u.id + '\')"><i class="fas fa-edit"></i> Edit</button>';
        h += '<button class="btn-sm btn-purple" onclick="setSingleUserPermanent(\'' + u.id + '\',\'' + esc(u.username) + '\')"><i class="fas fa-infinity"></i> Permanent</button>';
        h += '<button class="btn-sm btn-orange" onclick="banUserConfirm(\'' + u.id + '\',\'' + esc(u.username) + '\')"><i class="fas fa-ban"></i> Ban</button>';
        h += '<button class="btn-sm btn-red" onclick="deleteUserConfirm(\'' + u.id + '\',\'' + esc(u.username) + '\')"><i class="fas fa-trash"></i> Hapus</button>';
        h += '</div></div>';
    });
    c.innerHTML = h;
}

function displayBannedUsers(users) {
    var c = document.getElementById('bannedListContainer');
    document.getElementById('bannedCount').textContent = users.length;
    if (!users.length) { c.innerHTML = '<div class="empty-state"><div class="empty-icon">🚫</div><div class="empty-text">Tidak ada user dibanned</div></div>'; return; }
    var h = '';
    users.forEach(function(u) {
        var initial = u.username.charAt(0).toUpperCase();
        h += '<div class="user-card banned">';
        h += '<div class="user-card-top">';
        h += '<div class="user-card-name"><div class="avatar banned-av">' + initial + '</div>' + esc(u.username) + '</div>';
        h += '<span class="user-badge badge-banned">BANNED</span>';
        h += '</div>';
        h += '<div class="user-card-info">';
        h += '<span><i class="fas fa-phone"></i> ' + esc(u.phone || '-') + '</span>';
        h += '<span><i class="fas fa-user-tag"></i> ' + esc(u.role) + '</span>';
        h += '</div>';
        h += '<div class="user-card-actions">';
        h += '<button class="btn-sm btn-green" onclick="unbanUserConfirm(\'' + u.id + '\',\'' + esc(u.username) + '\')"><i class="fas fa-check"></i> Unban</button>';
        h += '<button class="btn-sm btn-red" onclick="deleteUserConfirm(\'' + u.id + '\',\'' + esc(u.username) + '\')"><i class="fas fa-trash"></i> Hapus</button>';
        h += '</div></div>';
    });
    c.innerHTML = h;
}

function searchUsers() {
    var t = document.getElementById('searchUser').value.toLowerCase();
    var filtered = allUsers.filter(function(u) {
        return u.username.toLowerCase().includes(t) || u.role.toLowerCase().includes(t) || u.expiry_date.includes(t) || (u.phone && u.phone.includes(t));
    });
    displayUsers(filtered.filter(function(u) { return !u.banned; }));
}

// ==================== BAN / UNBAN ====================
function banUserConfirm(id, name) {
    showConfirm('Ban user "' + name + '"? Mereka tidak bisa login.', function() { banUser(id); });
}

function unbanUserConfirm(id, name) {
    showConfirm('Unban user "' + name + '"?', function() { unbanUser(id); });
}

async function banUser(id) {
    showAlert('Proses', 'Memblokir user...', 'loading');
    try {
        await apiCall('users/' + id, 'PATCH', { banned: true });
        showAlert('Berhasil', 'User berhasil dibanned!', 'success');
        await loadUsers();
    } catch (e) { showAlert('Error', 'Gagal banned user.', 'error'); }
}

async function unbanUser(id) {
    showAlert('Proses', 'Membuka blokir...', 'loading');
    try {
        await apiCall('users/' + id, 'PATCH', { banned: false });
        showAlert('Berhasil', 'User berhasil di-unban!', 'success');
        await loadUsers();
    } catch (e) { showAlert('Error', 'Gagal unban user.', 'error'); }
}

// ==================== ADD USER ====================
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
        await apiCall('users', 'POST', { username: u, phone: ph, password: p, role: r, expiry_date: e });
        document.getElementById('newUser').value = '';
        document.getElementById('newPhone').value = '';
        document.getElementById('newPass').value = '';
        showAlert('Berhasil', 'User berhasil ditambahkan!', 'success');
        await loadUsers();
        switchTab('users');
    } catch (e) { showAlert('Error', e.message, 'error'); }
}

// ==================== EDIT USER ====================
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

function closeEditModal() { document.getElementById('editModal').classList.remove('show'); }

async function saveUserChanges() {
    var id = document.getElementById('editUserId').value;
    var u = document.getElementById('editUsername').value.trim();
    var ph = document.getElementById('editPhone').value.trim();
    var p = document.getElementById('editPassword').value.trim();
    var r = document.getElementById('editRole').value;
    var e = document.getElementById('editExpiryDate').value.trim();
    if (!id || !u || !e) return showAlert('Error', 'Username dan masa aktif wajib diisi', 'error');
    showAlert('Proses', 'Menyimpan...', 'loading');
    var data = { username: u, phone: ph, role: r, expiry_date: e };
    if (p) data.password = p;
    try {
        await apiCall('users/' + id, 'PATCH', data);
        closeEditModal();
        showAlert('Berhasil', 'User berhasil diperbarui!', 'success');
        await loadUsers();
    } catch (e) { showAlert('Error', e.message, 'error'); }
}

// ==================== DELETE ====================
function deleteUserConfirm(id, name) {
    showConfirm('Yakin hapus user "' + name + '"? Data tidak bisa dikembalikan.', function() { deleteUser(id); });
}

async function deleteUser(id) {
    showAlert('Proses', 'Menghapus user...', 'loading');
    try { await apiCall('users/' + id, 'DELETE'); showAlert('Berhasil', 'User berhasil dihapus!', 'success'); await loadUsers(); }
    catch (e) { showAlert('Error', 'Gagal menghapus user.', 'error'); }
}

// ==================== PERMANENT ====================
async function setSingleUserPermanent(id, name) {
    showConfirm('Jadikan "' + name + '" PERMANENT?', async function() {
        showAlert('Proses', 'Mengubah...', 'loading');
        try { await apiCall('users/' + id, 'PATCH', { expiry_date: '12/31/9999' }); showAlert('Berhasil', name + ' sekarang PERMANENT!', 'success'); await loadUsers(); }
        catch (e) { showAlert('Error', 'Gagal.', 'error'); }
    });
}

async function setAllUsersPermanent() {
    showConfirm('Jadikan SEMUA user PERMANENT?', async function() {
        showAlert('Proses', 'Mengubah semua...', 'loading');
        try {
            var count = 0;
            for (var i = 0; i < allUsers.length; i++) { await apiCall('users/' + allUsers[i].id, 'PATCH', { expiry_date: '12/31/9999' }); count++; }
            showAlert('Berhasil', count + ' user jadi PERMANENT!', 'success');
            await loadUsers();
        } catch (e) { showAlert('Error', 'Gagal.', 'error'); }
    });
}

// ==================== BLOCKED IPs ====================
async function loadBlockedIPs() {
    try {
        var data = await apiCall('blocked_ips', 'GET');
        allBlockedIPs = [];
        for (var key in data) { if (data[key] && data[key].ip) { data[key].dbKey = key; allBlockedIPs.push(data[key]); } }
        displayBlockedIPs(allBlockedIPs);
    } catch (e) { showAlert('Error', 'Gagal memuat data IP', 'error'); }
}

function displayBlockedIPs(ips) {
    var c = document.getElementById('blockedListContainer');
    document.getElementById('blockedCount').textContent = ips.length;
    if (!ips.length) { c.innerHTML = '<div class="empty-state"><div class="empty-icon">🌐</div><div class="empty-text">Tidak ada IP diblokir</div></div>'; return; }
    var h = '';
    ips.forEach(function(item) {
        h += '<div class="user-card">';
        h += '<div class="user-card-top"><div class="user-card-name"><div class="avatar banned-av"><i class="fas fa-globe"></i></div>' + esc(item.ip || 'Unknown') + '</div><span class="user-badge badge-banned">DIBLOKIR</span></div>';
        h += '<div class="user-card-info"><span><i class="fas fa-calendar"></i> Sejak: ' + (item.blocked_at ? new Date(item.blocked_at).toLocaleString('id-ID') : '-') + '</span></div>';
        h += '<div class="user-card-actions"><button class="btn-sm btn-green" onclick="unblockIP(\'' + item.dbKey + '\',\'' + esc(item.ip || 'Unknown') + '\')"><i class="fas fa-check"></i> Unblock</button></div>';
        h += '</div>';
    });
    c.innerHTML = h;
}

function searchBlocked() {
    var t = document.getElementById('searchBlocked').value.toLowerCase();
    if (t) { displayBlockedIPs(allBlockedIPs.filter(function(item) { return (item.ip || '').toLowerCase().includes(t); })); }
    else { displayBlockedIPs(allBlockedIPs); }
}

async function unblockIP(dbKey, ip) {
    showConfirm('Unblock IP "' + ip + '"?', async function() {
        showAlert('Proses', 'Membuka blokir...', 'loading');
        try { await apiCall('blocked_ips/' + dbKey, 'DELETE'); showAlert('Berhasil', 'IP berhasil di-unblock!', 'success'); await loadBlockedIPs(); }
        catch (e) { showAlert('Error', 'Gagal unblock', 'error'); }
    });
}

// ==================== CONFIRM MODAL ====================
function showConfirm(msg, callback) {
    var overlay = document.getElementById('confirmOverlay');
    var msgEl = document.getElementById('confirmMessage');
    var yesBtn = document.getElementById('confirmYes');
    var noBtn = document.getElementById('confirmNo');
    if (!overlay) { if (confirm(msg)) callback(); return; }
    msgEl.textContent = msg;
    overlay.style.display = 'flex';
    yesBtn.onclick = function() { overlay.style.display = 'none'; callback(); };
    noBtn.onclick = function() { overlay.style.display = 'none'; };
    overlay.onclick = function(e) { if (e.target === overlay) overlay.style.display = 'none'; };
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async function() {
    var nm = new Date(); nm.setMonth(nm.getMonth() + 1);
    var newExpiry = document.getElementById('newExpiryDate');
    if (newExpiry) newExpiry.value = formatDate(nm);

    var loginPass = document.getElementById('loginPassword');
    if (loginPass) loginPass.addEventListener('keypress', function(e) { if (e.key === 'Enter') login(); });

    var accessKey = document.getElementById('accessKey');
    if (accessKey) accessKey.addEventListener('keypress', function(e) { if (e.key === 'Enter') verifyKey(); });

    document.addEventListener('click', function() {
        if (currentAdmin && sessionTimer) { clearTimeout(sessionTimer); sessionTimer = setTimeout(function() { if (currentAdmin) { logout(); showAlert('Sesi Berakhir', 'Tidak ada aktivitas selama 30 menit.', 'info'); } }, 30 * 60 * 1000); }
    });

    var editModal = document.getElementById('editModal');
    if (editModal) editModal.addEventListener('click', function(e) { if (e.target === this) closeEditModal(); });

    if (!fingerprint) fingerprint = await getFingerprint();
    try { var checkResult = await apiCall('check_blocked', 'POST', { fingerprint: fingerprint }); if (checkResult && checkResult.blocked) { showBlockedScreen(); return; } } catch(e) {}
});