// ==================== ANTI DEVTOOLS ====================
document.addEventListener('keydown', function(e) {
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I') || (e.ctrlKey && e.key === 'U')) { e.preventDefault(); return false; }
});
document.addEventListener('contextmenu', function(e) { e.preventDefault(); return false; });
var devtoolsOpen = false;
setInterval(function() {
    if (window.outerWidth - window.innerWidth > 160 || window.outerHeight - window.innerHeight > 160) {
        if (!devtoolsOpen) { devtoolsOpen = true; document.body.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;background:#1a1a2e;color:#fff;font-size:18px;font-family:sans-serif">DevTools terdeteksi! Tutup untuk melanjutkan.</div>'; }
    } else { devtoolsOpen = false; }
}, 1000);

// ==================== CONFIG ====================
var API_URL = '/api/revanstore';
var ADMIN_KEY = 'dhagwxwhu:f4afc5aa03e73130f5e055dfe6a708c4dc40759b';
var API_KEY = '835a198a-7843-4e13-a085-331eb891100e';
var currentAdmin = null, allUsers = [], allBlockedIPs = [], fingerprint = '';
var keyAttempts = 0, loginAttempts = 0, loginBlocked = false, blockTimer = null, sessionTimer = null, alertTimeout = null;
var refreshInterval = null, clockInterval = null;
var pendingRequests = {}; // debounce tracker

// ==================== FINGERPRINT ====================
async function getFingerprint() {
    var fp = ''; fp += navigator.userAgent || ''; fp += navigator.language || ''; fp += (screen.width || 0) + 'x' + (screen.height || 0);
    fp += screen.colorDepth || ''; fp += new Date().getTimezoneOffset(); fp += navigator.hardwareConcurrency || ''; fp += navigator.deviceMemory || ''; fp += navigator.platform || '';
    return CryptoJS.MD5(fp).toString();
}

// ==================== ALERT ====================
function showAlert(t, m, type) {
    var overlay = document.getElementById('alertOverlay'), icon = document.getElementById('alertIcon'), title = document.getElementById('alertTitle'), msg = document.getElementById('alertMessage');
    if (!overlay) return;
    title.textContent = t; msg.textContent = m; icon.innerHTML = '';
    if (type === 'loading') icon.innerHTML = '<div class="spinner"></div>';
    else if (type === 'success') icon.innerHTML = '<div style="font-size:40px;color:#10b981"><i class="fas fa-check-circle"></i></div>';
    else if (type === 'error') icon.innerHTML = '<div style="font-size:40px;color:#ef4444"><i class="fas fa-times-circle"></i></div>';
    else icon.innerHTML = '<div style="font-size:40px;color:#00bfff"><i class="fas fa-info-circle"></i></div>';
    overlay.classList.add('show');
    if (alertTimeout) clearTimeout(alertTimeout);
    if (type !== 'loading') alertTimeout = setTimeout(function() { overlay.classList.remove('show'); }, 1800);
}
function hideAlert() { document.getElementById('alertOverlay').classList.remove('show'); }

// ==================== HELPERS ====================
function parseDate(d) { if (!d) return null; var p = d.split('/'); if (p.length !== 3) return null; return new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1])); }
function formatDate(d) { return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') + '/' + d.getFullYear(); }
function calculateDaysLeft(e) { var ex = parseDate(e); if (!ex) return -9999; if (ex.getFullYear() === 9999) return 999999; var n = new Date(); n.setHours(0, 0, 0, 0); return Math.floor((ex - n) / (1000 * 60 * 60 * 24)); }
function getStatus(d) { if (d === 999999) return { text: 'PERMANENT', class: 'badge-permanent' }; if (d <= 0) return { text: 'EXPIRED', class: 'badge-expired' }; if (d <= 3) return { text: 'SEGERA HABIS', class: 'badge-warning' }; return { text: 'AKTIF', class: 'badge-active' }; }
function esc(s) { if (!s) return ''; return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function setQuickDate(t, p) {
    var f = t === 'new' ? 'newExpiryDate' : 'editExpiryDate', d;
    if (p === 'permanent') d = '12/31/9999';
    else if (p === 'week') { d = new Date(); d.setDate(d.getDate() + 7); d = formatDate(d); }
    else if (p === 'month') { d = new Date(); d.setMonth(d.getMonth() + 1); d = formatDate(d); }
    else if (p === 'year') { d = new Date(); d.setFullYear(d.getFullYear() + 1); d = formatDate(d); }
    document.getElementById(f).value = d;
}

// ==================== DEBOUNCE ====================
function debounce(key, fn, delay) {
    if (pendingRequests[key]) return;
    pendingRequests[key] = true;
    fn().finally(function() { setTimeout(function() { pendingRequests[key] = false; }, delay || 1500); });
}

// ==================== API CALL ====================
async function apiCall(path, method, data) {
    if (!fingerprint) fingerprint = await getFingerprint();
    var payload = CryptoJS.AES.encrypt(JSON.stringify({ path: path, method: method, data: data }), ADMIN_KEY).toString();
    var res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'X-Fingerprint': fingerprint }, body: JSON.stringify({ data: payload }) });
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
            keyAttempts = 0; document.getElementById('keyScreen').style.display = 'none'; document.getElementById('loginScreen').style.display = 'block';
            document.getElementById('accessKey').value = ''; hideAlert(); showAlert('Berhasil', 'Key valid!', 'success');
        } else {
            keyAttempts++; document.getElementById('accessKey').value = ''; hideAlert();
            if (keyAttempts >= 3) { showAlert('Error', 'Key salah 3x! Akses diblokir.', 'error'); setTimeout(async function() { for (var i = 0; i < 5; i++) { await apiCall('admin/login_failed', 'POST', {}); } showBlockedScreen(); }, 1500); return; }
            showAlert('Error', 'Key salah! Sisa ' + (3 - keyAttempts), 'error');
        }
    } catch (e) { hideAlert(); showAlert('Error', 'Gagal verifikasi key', 'error'); }
}
function showBlockedScreen() {
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:20px;font-family:\'Segoe UI\',sans-serif;position:fixed;top:0;left:0;width:100%;height:100vh;background:#f8fafc"><div style="background:#fff;border-radius:20px;padding:40px 30px;max-width:420px;width:100%;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.04);border:1px solid #e2e8f0"><div style="font-size:56px;color:#ef4444;margin-bottom:18px"><i class="fas fa-lock"></i></div><h1 style="color:#1a1a2e;font-size:22px;margin-bottom:8px">AKSES DITOLAK</h1><p style="color:#64748b;font-size:14px">Maaf, akses Anda telah diblokir permanen.</p></div></div>';
}

// ==================== LOGIN ====================
async function login() {
    if (loginBlocked) { var remaining = blockTimer ? Math.ceil((blockTimer - Date.now()) / 1000 / 60) : 0; if (remaining <= 0) { loginBlocked = false; loginAttempts = 0; blockTimer = null; } else return showAlert('Diblokir', 'Coba lagi dalam ' + remaining + ' menit.', 'error'); }
    var email = document.getElementById('loginEmail').value.trim(), pass = document.getElementById('loginPassword').value.trim();
    if (!email || !pass) return showAlert('Error', 'Email dan password wajib diisi', 'error');
    showAlert('Memverifikasi', 'Mohon tunggu...', 'loading');
    try {
        var r = await apiCall('admin/auth', 'GET');
        if (r && r.blocked) { hideAlert(); showBlockedScreen(); return; }
        if (r && r.email === email && r.password === pass) {
            await apiCall('admin/login_success', 'POST', {});
            loginAttempts = 0; loginBlocked = false; blockTimer = null; currentAdmin = email;
            document.getElementById('loggedUser').textContent = email;
            document.getElementById('loginScreen').style.display = 'none'; document.getElementById('adminPanel').style.display = 'block';
            document.getElementById('mainContainer').style.maxWidth = '960px';
            hideAlert(); showAlert('Berhasil', 'Login berhasil!', 'success');
            startAutoRefresh();
            if (sessionTimer) clearTimeout(sessionTimer);
            sessionTimer = setTimeout(function() { if (currentAdmin) { logout(); showAlert('Sesi Berakhir', 'Tidak ada aktivitas selama 30 menit.', 'info'); } }, 30 * 60 * 1000);
            await loadUsers(); updateStats();
        } else {
            var track = await apiCall('admin/login_failed', 'POST', {});
            if (track && track.blocked) { hideAlert(); showBlockedScreen(); return; }
            showAlert('Gagal', 'Email atau password salah. Sisa ' + (track ? track.remaining : '?'), 'error');
        }
    } catch (e) { showAlert('Error', e.message, 'error'); }
}
function logout() {
    currentAdmin = null; stopAutoRefresh();
    if (sessionTimer) clearTimeout(sessionTimer);
    document.getElementById('adminPanel').style.display = 'none'; document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('keyScreen').style.display = 'none'; document.getElementById('loginPassword').value = '';
    document.getElementById('mainContainer').style.maxWidth = '440px';
    showAlert('Logout', 'Anda telah logout.', 'info');
}

// ==================== AUTO REFRESH ====================
function startAutoRefresh() {
    updateClock(); clockInterval = setInterval(updateClock, 30000);
    refreshInterval = setInterval(function() { if (currentAdmin) { loadUsers(); updateStats(); } }, 30000);
}
function stopAutoRefresh() { if (refreshInterval) clearInterval(refreshInterval); if (clockInterval) clearInterval(clockInterval); }
function updateClock() { var d = new Date(); document.getElementById('clockDisplay').textContent = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); }

// ==================== TABS ====================
function switchTab(t) {
    var tabs = document.querySelectorAll('.tab'), contents = document.querySelectorAll('.tab-content');
    tabs.forEach(function(x) { x.classList.remove('active'); }); contents.forEach(function(x) { x.classList.remove('active'); });
    var map = { 'adduser': 0, 'users': 1, 'banned': 2, 'blocked': 3, 'activity': 4 };
    if (map[t] !== undefined) { tabs[map[t]].classList.add('active'); document.getElementById(t).classList.add('active'); }
    if (t === 'users' || t === 'banned') loadUsers();
    if (t === 'blocked') loadBlockedIPs();
    if (t === 'activity') loadActivity();
}

// ==================== STATS ====================
function updateStats() {
    document.getElementById('statTotal').textContent = allUsers.length;
    document.getElementById('statActive').textContent = allUsers.filter(function(u) { return !u.banned && calculateDaysLeft(u.expiry_date) > 0; }).length;
    document.getElementById('statBanned').textContent = allUsers.filter(function(u) { return u.banned; }).length;
    document.getElementById('statExpired').textContent = allUsers.filter(function(u) { return !u.banned && calculateDaysLeft(u.expiry_date) <= 0 && calculateDaysLeft(u.expiry_date) !== 999999; }).length;
}

// ==================== USERS ====================
async function loadUsers() {
    try {
        var data = await apiCall('users', 'GET');
        allUsers = [];
        for (var key in data) { if (data[key] && data[key].username) { data[key].id = key; allUsers.push(data[key]); } }
        displayUsers(allUsers.filter(function(u) { return !u.banned; }));
        displayBannedUsers(allUsers.filter(function(u) { return u.banned; }));
        updateStats();
    } catch (e) {}
}
function displayUsers(users) {
    var c = document.getElementById('userListContainer');
    document.getElementById('totalUsers').textContent = users.length; document.getElementById('userCount').textContent = users.length;
    if (!users.length) { c.innerHTML = '<div class="empty-state">Tidak ada user</div>'; return; }
    users.sort(function(a, b) { return a.username.localeCompare(b.username); });
    var h = '';
    users.forEach(function(u) {
        var d = calculateDaysLeft(u.expiry_date), s = getStatus(d);
        var dt = d === 999999 ? 'PERMANENT' : (d < 0 ? Math.abs(d) + ' hari lalu' : d + ' hari tersisa');
        var init = u.username.charAt(0).toUpperCase();
        var conflictBadge = u.forceLogout ? '<span class="user-badge badge-conflict">⚠️ CONFLICT</span>' : '';
        h += '<div class="user-card' + (u.banned ? ' banned' : '') + (u.forceLogout ? ' conflict' : '') + '">';
        h += '<div class="user-card-top"><div class="user-card-name"><div class="avatar' + (u.banned ? ' banned-av' : '') + (u.forceLogout ? ' conflict-av' : '') + '">' + init + '</div>' + esc(u.username) + conflictBadge + '</div><span class="user-badge ' + s.class + '">' + s.text + '</span></div>';
        h += '<div class="user-card-info"><span><i class="fas fa-phone"></i> ' + esc(u.phone || '-') + '</span><span><i class="fas fa-key"></i> ' + esc(u.password) + '</span><span><i class="fas fa-user-tag"></i> ' + esc(u.role) + '</span><span><i class="fas fa-calendar"></i> ' + esc(u.expiry_date) + '</span><span><i class="fas fa-clock"></i> ' + dt + '</span></div>';
        h += '<div class="user-card-actions">';
        h += '<button class="btn-sm btn-primary" onclick="openEditModal(\'' + u.id + '\')"><i class="fas fa-edit"></i> Edit</button>';
        h += '<button class="btn-sm btn-purple" onclick="setSingleUserPermanent(\'' + u.id + '\',\'' + esc(u.username) + '\')"><i class="fas fa-infinity"></i> Permanent</button>';
        if (u.forceLogout) {
            h += '<button class="btn-sm btn-green" onclick="unforceUserConfirm(\'' + u.id + '\',\'' + esc(u.username) + '\')"><i class="fas fa-unlock"></i> Izinkan Login</button>';
        } else {
            h += '<button class="btn-sm btn-orange" onclick="forceUserConfirm(\'' + u.id + '\',\'' + esc(u.username) + '\')"><i class="fas fa-eject"></i> Force Logout</button>';
        }
        h += '<button class="btn-sm btn-orange" onclick="banUserConfirm(\'' + u.id + '\',\'' + esc(u.username) + '\')"><i class="fas fa-ban"></i> Ban</button>';
        h += '<button class="btn-sm btn-red" onclick="deleteUserConfirm(\'' + u.id + '\',\'' + esc(u.username) + '\')"><i class="fas fa-trash"></i> Hapus</button>';
        h += '</div></div>';
    });
    c.innerHTML = h;
}
function displayBannedUsers(users) {
    var c = document.getElementById('bannedListContainer'); document.getElementById('bannedCount').textContent = users.length;
    if (!users.length) { c.innerHTML = '<div class="empty-state">Tidak ada user dibanned</div>'; return; }
    var h = '';
    users.forEach(function(u) {
        var init = u.username.charAt(0).toUpperCase();
        h += '<div class="user-card banned"><div class="user-card-top"><div class="user-card-name"><div class="avatar banned-av">' + init + '</div>' + esc(u.username) + '</div><span class="user-badge badge-banned">BANNED</span></div>';
        h += '<div class="user-card-info"><span><i class="fas fa-phone"></i> ' + esc(u.phone || '-') + '</span><span><i class="fas fa-user-tag"></i> ' + esc(u.role) + '</span></div>';
        h += '<div class="user-card-actions"><button class="btn-sm btn-green" onclick="unbanUserConfirm(\'' + u.id + '\',\'' + esc(u.username) + '\')"><i class="fas fa-check"></i> Unban</button><button class="btn-sm btn-red" onclick="deleteUserConfirm(\'' + u.id + '\',\'' + esc(u.username) + '\')"><i class="fas fa-trash"></i> Hapus</button></div></div>';
    });
    c.innerHTML = h;
}
function searchUsers() {
    var t = document.getElementById('searchUser').value.toLowerCase();
    var filtered = allUsers.filter(function(u) { return u.username.toLowerCase().includes(t) || u.role.toLowerCase().includes(t) || u.expiry_date.includes(t) || (u.phone && u.phone.includes(t)); });
    displayUsers(filtered.filter(function(u) { return !u.banned; }));
}

// ==================== BAN / UNBAN ====================
function banUserConfirm(id, name) { showConfirm('Ban user "' + name + '"?', function() { debounce('ban'+id, function() { return banUser(id); }); }); }
function unbanUserConfirm(id, name) { showConfirm('Unban user "' + name + '"?', function() { debounce('unban'+id, function() { return unbanUser(id); }); }); }
async function banUser(id) { showAlert('Proses', 'Memblokir...', 'loading'); try { await apiCall('users/' + id, 'PATCH', { banned: true }); showAlert('Berhasil', 'User dibanned!', 'success'); await loadUsers(); } catch (e) { showAlert('Error', 'Gagal.', 'error'); } }
async function unbanUser(id) { showAlert('Proses', 'Membuka blokir...', 'loading'); try { await apiCall('users/' + id, 'PATCH', { banned: false }); showAlert('Berhasil', 'User di-unban!', 'success'); await loadUsers(); } catch (e) { showAlert('Error', 'Gagal.', 'error'); } }

// ==================== FORCE LOGOUT / UNFORCE ====================
function forceUserConfirm(id, name) { showConfirm('Force logout "' + name + '"? User tidak bisa login sampai di-unforce.', function() { debounce('force'+id, function() { return forceUser(id); }); }); }
function unforceUserConfirm(id, name) { showConfirm('Izinkan "' + name + '" login kembali?', function() { debounce('unforce'+id, function() { return unforceUser(id); }); }); }
async function forceUser(id) { showAlert('Proses', 'Force logout...', 'loading'); try { await apiCall('users/' + id, 'PATCH', { forceLogout: true, logoutTimestamp: Date.now() }); showAlert('Berhasil', 'User di-force logout!', 'success'); await loadUsers(); } catch (e) { showAlert('Error', 'Gagal.', 'error'); } }
async function unforceUser(id) { showAlert('Proses', 'Mengizinkan login...', 'loading'); try { await apiCall('users/' + id, 'PATCH', { forceLogout: false }); showAlert('Berhasil', 'User bisa login lagi!', 'success'); await loadUsers(); } catch (e) { showAlert('Error', 'Gagal.', 'error'); } }

// ==================== ADD USER ====================
async function addUserNow() {
    var u = document.getElementById('newUser').value.trim(), ph = document.getElementById('newPhone').value.trim(), p = document.getElementById('newPass').value.trim(), r = document.getElementById('newRole').value, e = document.getElementById('newExpiryDate').value.trim();
    if (!u || !p || !e) return showAlert('Error', 'Username, password, dan masa aktif wajib diisi', 'error');
    if (p.length < 6) return showAlert('Error', 'Password minimal 6 karakter', 'error');
    showAlert('Proses', 'Menambahkan...', 'loading');
    try { await apiCall('users', 'POST', { username: u, phone: ph, password: p, role: r, expiry_date: e }); document.getElementById('newUser').value = ''; document.getElementById('newPhone').value = ''; document.getElementById('newPass').value = ''; showAlert('Berhasil', 'User ditambahkan!', 'success'); await loadUsers(); switchTab('users'); }
    catch (e) { showAlert('Error', e.message, 'error'); }
}

// ==================== EDIT USER ====================
function openEditModal(id) { var u = allUsers.find(function(x) { return x.id === id; }); if (!u) return; document.getElementById('editUserId').value = id; document.getElementById('editUsername').value = u.username; document.getElementById('editPhone').value = u.phone || ''; document.getElementById('editPassword').value = ''; document.getElementById('editRole').value = u.role; document.getElementById('editExpiryDate').value = u.expiry_date; document.getElementById('editModal').classList.add('show'); }
function closeEditModal() { document.getElementById('editModal').classList.remove('show'); }
async function saveUserChanges() {
    var id = document.getElementById('editUserId').value, u = document.getElementById('editUsername').value.trim(), ph = document.getElementById('editPhone').value.trim(), p = document.getElementById('editPassword').value.trim(), r = document.getElementById('editRole').value, e = document.getElementById('editExpiryDate').value.trim();
    if (!id || !u || !e) return showAlert('Error', 'Username dan masa aktif wajib diisi', 'error');
    showAlert('Proses', 'Menyimpan...', 'loading');
    var data = { username: u, phone: ph, role: r, expiry_date: e }; if (p) data.password = p;
    try { await apiCall('users/' + id, 'PATCH', data); closeEditModal(); showAlert('Berhasil', 'User diperbarui!', 'success'); await loadUsers(); }
    catch (e) { showAlert('Error', e.message, 'error'); }
}

// ==================== DELETE ====================
function deleteUserConfirm(id, name) { showConfirm('Hapus user "' + name + '"? Data tidak bisa dikembalikan.', function() { debounce('del'+id, function() { return deleteUser(id); }); }); }
async function deleteUser(id) { showAlert('Proses', 'Menghapus...', 'loading'); try { await apiCall('users/' + id, 'DELETE'); showAlert('Berhasil', 'User dihapus!', 'success'); await loadUsers(); } catch (e) { showAlert('Error', 'Gagal.', 'error'); } }

// ==================== PERMANENT ====================
async function setSingleUserPermanent(id, name) { showConfirm('Jadikan "' + name + '" PERMANENT?', async function() { showAlert('Proses', 'Mengubah...', 'loading'); try { await apiCall('users/' + id, 'PATCH', { expiry_date: '12/31/9999' }); showAlert('Berhasil', name + ' PERMANENT!', 'success'); await loadUsers(); } catch (e) { showAlert('Error', 'Gagal.', 'error'); } }); }
async function setAllUsersPermanent() { showConfirm('Jadikan SEMUA user PERMANENT?', async function() { showAlert('Proses', 'Mengubah...', 'loading'); try { var count = 0; for (var i = 0; i < allUsers.length; i++) { await apiCall('users/' + allUsers[i].id, 'PATCH', { expiry_date: '12/31/9999' }); count++; } showAlert('Berhasil', count + ' user PERMANENT!', 'success'); await loadUsers(); } catch (e) { showAlert('Error', 'Gagal.', 'error'); } }); }

// ==================== BLOCKED IPs ====================
async function loadBlockedIPs() {
    try { var data = await apiCall('blocked_ips', 'GET'); allBlockedIPs = []; for (var key in data) { if (data[key] && data[key].ip) { data[key].dbKey = key; allBlockedIPs.push(data[key]); } } displayBlockedIPs(allBlockedIPs); } catch (e) {}
}
function displayBlockedIPs(ips) {
    var c = document.getElementById('blockedListContainer'); document.getElementById('blockedCount').textContent = ips.length;
    if (!ips.length) { c.innerHTML = '<div class="empty-state">Tidak ada IP diblokir</div>'; return; }
    var h = ''; ips.forEach(function(item) { h += '<div class="user-card"><div class="user-card-top"><div class="user-card-name"><div class="avatar banned-av"><i class="fas fa-globe"></i></div>' + esc(item.ip || 'Unknown') + '</div><span class="user-badge badge-banned">DIBLOKIR</span></div><div class="user-card-info"><span><i class="fas fa-calendar"></i> ' + (item.blocked_at ? new Date(item.blocked_at).toLocaleString('id-ID') : '-') + '</span></div><div class="user-card-actions"><button class="btn-sm btn-green" onclick="unblockIP(\'' + item.dbKey + '\',\'' + esc(item.ip || 'Unknown') + '\')"><i class="fas fa-check"></i> Unblock</button></div></div>'; });
    c.innerHTML = h;
}
function searchBlocked() { var t = document.getElementById('searchBlocked').value.toLowerCase(); displayBlockedIPs(t ? allBlockedIPs.filter(function(item) { return (item.ip || '').toLowerCase().includes(t); }) : allBlockedIPs); }
async function unblockIP(dbKey, ip) { showConfirm('Unblock IP "' + ip + '"?', async function() { showAlert('Proses', 'Membuka...', 'loading'); try { await apiCall('blocked_ips/' + dbKey, 'DELETE'); showAlert('Berhasil', 'IP di-unblock!', 'success'); await loadBlockedIPs(); } catch (e) { showAlert('Error', 'Gagal.', 'error'); } }); }

// ==================== ACTIVITY LOG ====================
async function loadActivity() {
    try {
        var filter = document.getElementById('activityFilter').value;
        var data = await apiCall('activity_logs', 'GET');
        var logs = [];
        for (var key in data) { if (data[key] && data[key].username) { data[key].id = key; logs.push(data[key]); } }
        if (filter !== 'all') logs = logs.filter(function(l) { return l.action === filter; });
        logs.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
        logs = logs.slice(0, 100);
        var c = document.getElementById('activityListContainer');
        if (!logs.length) { c.innerHTML = '<div class="empty-state">Tidak ada aktivitas</div>'; return; }
        var h = '';
        logs.forEach(function(l) {
            var time = l.timestamp ? new Date(l.timestamp).toLocaleString('id-ID') : '-';
            var actionLabel = { login: 'Login', topup: 'Top Up', kuras: 'Kuras', gantinama: 'Ganti Nama', hapus_riwayat: 'Hapus Riwayat' }[l.action] || l.action;
            h += '<div class="activity-item"><div class="activity-dot ' + (l.action || '') + '"></div><div class="activity-info"><div class="activity-user">' + esc(l.username) + '</div><div class="activity-action">' + actionLabel + (l.details ? ' — ' + l.details : '') + '</div></div><div class="activity-time">' + time + '</div></div>';
        });
        c.innerHTML = h;
    } catch (e) {}
}

// ==================== CONFIRM MODAL ====================
function showConfirm(msg, callback) {
    var overlay = document.getElementById('confirmOverlay'), msgEl = document.getElementById('confirmMessage'), yesBtn = document.getElementById('confirmYes'), noBtn = document.getElementById('confirmNo');
    if (!overlay) { if (confirm(msg)) callback(); return; }
    msgEl.textContent = msg; overlay.style.display = 'flex';
    yesBtn.onclick = function() { overlay.style.display = 'none'; callback(); };
    noBtn.onclick = function() { overlay.style.display = 'none'; };
    overlay.onclick = function(e) { if (e.target === overlay) overlay.style.display = 'none'; };
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async function() {
    var nm = new Date(); nm.setMonth(nm.getMonth() + 1);
    var newExpiry = document.getElementById('newExpiryDate'); if (newExpiry) newExpiry.value = formatDate(nm);
    var loginPass = document.getElementById('loginPassword'); if (loginPass) loginPass.addEventListener('keypress', function(e) { if (e.key === 'Enter') login(); });
    var accessKey = document.getElementById('accessKey'); if (accessKey) accessKey.addEventListener('keypress', function(e) { if (e.key === 'Enter') verifyKey(); });
    document.addEventListener('click', function() { if (currentAdmin && sessionTimer) { clearTimeout(sessionTimer); sessionTimer = setTimeout(function() { if (currentAdmin) { logout(); showAlert('Sesi Berakhir', 'Tidak ada aktivitas selama 30 menit.', 'info'); } }, 30 * 60 * 1000); } });
    var editModal = document.getElementById('editModal'); if (editModal) editModal.addEventListener('click', function(e) { if (e.target === this) closeEditModal(); });
    if (!fingerprint) fingerprint = await getFingerprint();
    try { var checkResult = await apiCall('check_blocked', 'POST', { fingerprint: fingerprint }); if (checkResult && checkResult.blocked) { showBlockedScreen(); return; } } catch(e) {}
});