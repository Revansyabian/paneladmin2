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
var currentAdmin = null;
var allUsers = [];
var allActivities = [];
var fingerprint = '';
var keyAttempts = 0;
var sessionTimer = null;
var pendingRequests = {};
var selectedBanUser = null;
var clockInterval = null;
var statsInterval = null;
var activityLoaded = false;
var settingsKeyVerified = false;

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

// ==================== CRYPTO ====================
function encryptData(payload) {
    return CryptoJS.AES.encrypt(JSON.stringify(payload), 'dhagwxwhu:f4afc5aa03e73130f5e055dfe6a708c4dc40759b').toString();
}

function decryptData(encryptedData) {
    var dec = CryptoJS.AES.decrypt(encryptedData, 'dhagwxwhu:f4afc5aa03e73130f5e055dfe6a708c4dc40759b').toString(CryptoJS.enc.Utf8);
    return JSON.parse(dec);
}

// ==================== ALERT ====================
function showAlert(title, msg, type) {
    var overlay = document.getElementById('alertOverlay');
    if (!overlay) {
        Swal.fire({
            icon: type === 'success' ? 'success' : type === 'error' ? 'error' : 'info',
            title: title,
            text: msg,
            confirmButtonColor: '#00BFFF'
        });
        return;
    }
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertMessage').textContent = msg;
    document.getElementById('alertIcon').innerHTML = type === 'success' ? '<i class="fas fa-check-circle" style="color:#10b981;"></i>' : type === 'error' ? '<i class="fas fa-times-circle" style="color:#ef4444;"></i>' : '<i class="fas fa-info-circle" style="color:#00BFFF;"></i>';
    overlay.classList.add('show');
    if (type !== 'loading') setTimeout(function() { overlay.classList.remove('show'); }, 2000);
}
function hideAlert() { var o = document.getElementById('alertOverlay'); if (o) o.classList.remove('show'); }

// ==================== HELPERS ====================
function formatDate(d) { return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') + '/' + d.getFullYear(); }
function calculateDaysLeft(e) { if (!e) return -9999; var p = e.split('/'); if (p.length !== 3) return -9999; var ex = new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1])); if (ex.getFullYear() === 9999) return 999999; var n = new Date(); n.setHours(0, 0, 0, 0); return Math.floor((ex - n) / (1000 * 60 * 60 * 24)); }
function esc(s) { if (!s) return ''; return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function closeModal(id) { var m = document.getElementById(id); if (m) m.classList.remove('show'); }

// ==================== API CALL ====================
async function apiCall(path, method, data) {
    if (!fingerprint) fingerprint = await getFingerprint();
    var payload = { path: path, method: method || 'GET', data: data || {}, timestamp: Date.now() };
    var encryptedPayload = encryptData(payload);
    var headers = { 'Content-Type': 'application/json', 'X-Fingerprint': fingerprint };
    if (currentAdmin) headers['X-Operator'] = encryptData({ value: currentAdmin });
    var res = await fetch(API_URL, { method: 'POST', headers: headers, body: JSON.stringify({ data: encryptedPayload }) });
    if (res.status === 429) throw new Error('Terlalu banyak request');
    var text = await res.text();
    if (!text || text === 'null') return null;
    var result = JSON.parse(text);
    if (result.data) { var decrypted = decryptData(result.data); return decrypted; }
    return result;
}

// ==================== NAVIGATION ====================
function switchPage(pageName) {
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    document.querySelectorAll('.sidebar-nav a').forEach(function(a) { a.classList.remove('active'); });
    var page = document.getElementById('page-' + pageName);
    if (page) page.classList.add('active');
    document.querySelectorAll('.sidebar-nav a').forEach(function(link) { if (link.getAttribute('data-page') === pageName) link.classList.add('active'); });
    if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');

    if (pageName === 'all-users') renderAllUsersTable();
    if (pageName === 'ban-user') searchBanUser();
    if (pageName === 'unbanned-users') renderUnbannedTable();
    if (pageName === 'banakses-users') renderBanAksesTable();
    if (pageName === 'unbanakses-users') renderUnbanAksesTable();
    if (pageName === 'force-users') renderForceTable();
    if (pageName === 'unforce-users') renderUnforceTable();
    if (pageName === 'problem-users') renderProblemTable();
    if (pageName === 'activity-log') renderActivityLogPage();
    if (pageName === 'suspicious-log') renderSuspiciousLogPage();
    if (pageName === 'web-stats') renderWebStats();

    if (pageName === 'settings') {
        document.getElementById('settingsKeyPage').style.display = 'flex';
        document.getElementById('settingsContent').style.display = 'none';
        document.getElementById('settingsKeyInput').value = '';
        document.getElementById('settingsKeyStatus').innerHTML = '';
        settingsKeyVerified = false;
    }
    if (pageName === 'maintenance') loadMaintenance();
    if (pageName === 'dashboard') { loadUsers(); loadActivity(); }
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

// ==================== VERIFY KEY & LOGIN ====================
function verifyKey() {
    var key = document.getElementById('accessKey').value.trim();
    if (!key) { showAlert('Error', 'Key wajib diisi!', 'error'); return; }
    showAlert('Verifikasi', 'Memeriksa key...', 'loading');
    apiCall('access_key', 'GET').then(function(r) {
        if (r && r.key === key) {
            keyAttempts = 0;
            document.getElementById('keyScreen').style.display = 'none';
            document.getElementById('loginScreen').style.display = 'block';
            hideAlert();
            showAlert('Berhasil', 'Key valid!', 'success');
        } else {
            keyAttempts++;
            hideAlert();
            if (keyAttempts >= 3) { showAlert('Error', 'Key salah 3x!', 'error'); return; }
            showAlert('Error', 'Key salah! Sisa ' + (3 - keyAttempts), 'error');
        }
    });
}

function login() {
    var email = document.getElementById('loginEmail').value.trim();
    var pass = document.getElementById('loginPassword').value.trim();
    if (!email || !pass) { showAlert('Error', 'Email & password wajib!', 'error'); return; }
    showAlert('Verifikasi', 'Mohon tunggu...', 'loading');
    apiCall('admin/auth', 'GET').then(function(r) {
        if (r && r.email === email && r.password === pass) {
            currentAdmin = email;
            document.getElementById('loggedUser').textContent = email;
            document.getElementById('navbarUserName').textContent = email;
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('loginWrapper').style.display = 'none';
            document.getElementById('appContainer').style.display = 'block';
            hideAlert();
            showAlert('Berhasil', 'Login berhasil!', 'success');
            startBg();
            loadUsers();
            loadActivity();
            switchPage('dashboard');
            if (sessionTimer) clearTimeout(sessionTimer);
            sessionTimer = setTimeout(function() { if (currentAdmin) { logout(); showAlert('Sesi Berakhir', '30 menit idle.', 'info'); } }, 1800000);
        } else {
            hideAlert();
            showAlert('Gagal', 'Email atau password salah!', 'error');
        }
    }).catch(function(e) { hideAlert(); showAlert('Error', e.message, 'error'); });
}

function logout() {
    currentAdmin = null; activityLoaded = false; settingsKeyVerified = false;
    if (sessionTimer) clearTimeout(sessionTimer);
    if (clockInterval) clearInterval(clockInterval);
    if (statsInterval) clearInterval(statsInterval);
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loginWrapper').style.display = 'flex';
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('keyScreen').style.display = 'none';
    showAlert('Logout', 'Anda telah logout.', 'info');
}

// ==================== BACKGROUND ====================
function startBg() { updateClock(); clockInterval = setInterval(updateClock, 60000); statsInterval = setInterval(function() { if (currentAdmin) loadUsers(); }, 60000); }
function updateClock() { var el = document.getElementById('clockDisplay'); if (el) el.textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); }

// ==================== USERS ====================
function loadUsers() {
    apiCall('users', 'GET').then(function(data) {
        allUsers = [];
        for (var key in data) {
            if (data[key] && data[key].username) {
                data[key].id = key;
                data[key].banned = data[key].banned || false;
                data[key].banAkses = data[key].banAkses || false;
                data[key].forceLogout = data[key].forceLogout || false;
                data[key].ip = data[key].ip || '';
                data[key].fingerprint = data[key].fingerprint || '';
                allUsers.push(data[key]);
            }
        }
        updateStats();
        renderAllUsersTable();
    }).catch(function() {});
}

function updateStats() {
    var total = allUsers.length;
    var active = allUsers.filter(function(u) { return !u.banned && !u.banAkses && !u.forceLogout && calculateDaysLeft(u.expiry_date) > 0; }).length;
    var banned = allUsers.filter(function(u) { return u.banned; }).length;
    var force = allUsers.filter(function(u) { return u.forceLogout; }).length;
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statActive').textContent = active;
    document.getElementById('statBanned').textContent = banned;
    document.getElementById('statForce').textContent = force;
}

// ==================== ACTIVITIES ====================
function loadActivity() {
    apiCall('activity_logs', 'GET').then(function(data) {
        allActivities = [];
        var logs = [];
        for (var key in data) { if (data[key] && data[key].username) { data[key].id = key; allActivities.push(data[key]); logs.push(data[key]); } }
        logs.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
        renderDashboardLog(logs.slice(0, 30));
        activityLoaded = true;
    }).catch(function() { activityLoaded = false; });
}

function renderDashboardLog(logs) {
    var c = document.getElementById('activityListContainer');
    if (!c) return;
    if (!logs || !logs.length) { c.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Belum ada aktivitas</div>'; return; }
    c.innerHTML = buildLogHTML(logs);
}

function renderActivityLogPage() {
    var c = document.getElementById('allActivityLog');
    if (!c) return;
    if (!allActivities.length) { c.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Tidak ada aktivitas</div>'; return; }
    c.innerHTML = buildLogHTML(allActivities);
}

function renderSuspiciousLogPage() {
    var c = document.getElementById('suspiciousActivityLog');
    if (!c) return;
    var suspicious = allActivities.filter(function(l) { return ['sharing_detected', 'ip_changed', 'fp_changed', 'login_failed'].includes(l.action); });
    if (!suspicious.length) { c.innerHTML = '<div class="empty-state"><i class="fas fa-shield-alt"></i> Tidak ada</div>'; return; }
    c.innerHTML = buildLogHTML(suspicious);
}

function buildLogHTML(logs) {
    var labels = { sharing_detected: '🔴 SHARING', banned: 'Ban', unbanned: 'Unban', ban_akses: 'Ban Akses', unban_akses: 'Unban Akses', force_logout: 'Force', unforce_logout: 'Unforce', topup: 'Top Up', kuras: 'Kuras', gantinama: 'Ganti Nama', login_success: 'Login', login_failed: 'Gagal Login' };
    var h = '';
    logs.forEach(function(l) {
        var time = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
        var lb = labels[l.action] || l.action;
        var cls = l.action === 'sharing_detected' ? ' suspicious' : '';
        h += '<div class="activity-item' + cls + '"><div class="activity-dot ' + (l.action || '') + '"></div><div class="activity-info"><span class="activity-user">' + esc(l.username) + '</span> <span class="activity-desc">' + lb + (l.details ? ' — ' + l.details : '') + '</span></div><div class="activity-time">' + time + '</div></div>';
    });
    return h;
}

function clearAllLogs() {
    showConfirm('Hapus SEMUA log?', function() {
        showAlert('Proses', 'Menghapus...', 'loading');
        apiCall('activity_logs', 'GET').then(function(data) {
            if (!data || Object.keys(data).length === 0) { hideAlert(); showAlert('Info', 'Log kosong!', 'info'); return; }
            var keys = Object.keys(data); var count = 0; var promises = [];
            keys.forEach(function(k) { promises.push(apiCall('activity_logs/' + k, 'DELETE').then(function() { count++; })); });
            Promise.all(promises).then(function() {
                allActivities = []; activityLoaded = false;
                document.getElementById('activityListContainer').innerHTML = '<div class="empty-state">Log kosong</div>';
                hideAlert(); showAlert('Berhasil', count + ' log dihapus!', 'success');
            });
        });
    });
}

function showConfirm(msg, cb) {
    var o = document.getElementById('confirmOverlay');
    if (!o) { if (confirm(msg)) cb(); return; }
    document.getElementById('confirmMessage').textContent = msg;
    o.style.display = 'flex';
    document.getElementById('confirmYes').onclick = function() { o.style.display = 'none'; cb(); };
    document.getElementById('confirmNo').onclick = function() { o.style.display = 'none'; };
}

// ==================== ADD USER ====================
function openAddUserModal() { var nm = new Date(); nm.setMonth(nm.getMonth() + 1); document.getElementById('newExpiryDate').value = formatDate(nm); document.getElementById('newUsername').value = ''; document.getElementById('newPassword').value = ''; document.getElementById('newRole').value = 'Operator'; document.getElementById('addUserModal').classList.add('show'); }
function addUserNow() { var u = document.getElementById('newUsername').value.trim(); var p = document.getElementById('newPassword').value.trim(); var ph = document.getElementById('newPhone').value.trim(); var r = document.getElementById('newRole').value; var e = document.getElementById('newExpiryDate').value.trim(); if (!u || !p || !e) { showAlert('Error', 'Wajib diisi!', 'error'); return; } if (p.length < 6) { showAlert('Error', 'Password min 6!', 'error'); return; } apiCall('users', 'POST', { username: u, password: p, phone: ph, role: r, expiry_date: e }).then(function() { showAlert('Berhasil', 'User ditambahkan!', 'success'); closeModal('addUserModal'); loadUsers(); }).catch(function(e) { showAlert('Error', e.message, 'error'); }); }

// ==================== DELETE USER ====================
function deleteUser(id) { var u = allUsers.find(function(x) { return x.id === id; }); if (!u) return; showConfirm('Hapus ' + u.username + '?', function() { apiCall('users/' + id, 'DELETE').then(function() { showAlert('Berhasil', 'Dihapus!', 'success'); loadUsers(); }); }); }

// ==================== EDIT USER ====================
function openEditUserModal(id) {
    var u = allUsers.find(function(x) { return x.id === id; }); if (!u) return;
    document.getElementById('editUserId').value = u.id;
    document.getElementById('editUsername').value = u.username || '';
    document.getElementById('editPhone').value = u.phone || '';
    document.getElementById('editRole').value = u.role || 'Operator';
    document.getElementById('editExpiryDate').value = u.expiry_date || '';
    document.getElementById('editIP').value = u.ip || '-';
    document.getElementById('editFP').value = (u.fingerprint || '').substring(0, 20) + '...';
    document.getElementById('editUserModal').classList.add('show');
}
function saveUserEdit() { var id = document.getElementById('editUserId').value; var u = document.getElementById('editUsername').value.trim(); var p = document.getElementById('editPassword').value.trim(); var ph = document.getElementById('editPhone').value.trim(); var r = document.getElementById('editRole').value; var e = document.getElementById('editExpiryDate').value.trim(); if (!u) { showAlert('Error', 'Username wajib!', 'error'); return; } var d = { username: u, role: r, expiry_date: e }; if (p) d.password = p; if (ph) d.phone = ph; apiCall('users/' + id, 'PATCH', d).then(function() { showAlert('Berhasil', 'Updated!', 'success'); closeModal('editUserModal'); loadUsers(); }); }

// ==================== BAN USER ====================
function searchBanUser() { var q = (document.getElementById('banUserSearch').value || '').toLowerCase(); var list = document.getElementById('banUserList'); var filtered = allUsers.filter(function(u) { return u.username.toLowerCase().includes(q) && !u.banned; }); list.innerHTML = filtered.length ? filtered.map(function(u) { return '<div class="user-check" onclick="selectBanUser(\'' + u.id + '\')">' + esc(u.username) + ' · ' + esc(u.role || '') + '</div>'; }).join('') : '<div style="padding:12px;">Tidak ditemukan</div>'; }
function selectBanUser(id) { selectedBanUser = allUsers.find(function(u) { return u.id === id; }); document.getElementById('banSelectedUser').textContent = selectedBanUser ? 'Dipilih: ' + selectedBanUser.username : ''; }
function executeBanUser() { if (!selectedBanUser) { showAlert('Error', 'Pilih user!', 'error'); return; } var dur = parseInt(document.getElementById('banDuration').value); showConfirm('Ban ' + selectedBanUser.username + '?', function() { apiCall('users/' + selectedBanUser.id, 'PATCH', { banned: true, bannedUntil: dur === 0 ? 0 : Date.now() + dur }).then(function() { showAlert('Berhasil', 'Di-ban!', 'success'); loadUsers(); selectedBanUser = null; searchBanUser(); }); }); }

// ==================== DO ACTION ====================
function doAction(action, target) {
    var patch = {};
    if (action === 'unban') patch = { banned: false, bannedUntil: 0 };
    else if (action === 'banakses') patch = { banAkses: true, banAksesUntil: Date.now() + 86400000 };
    else if (action === 'unbanakses') patch = { banAkses: false, banAksesUntil: 0 };
    else if (action === 'force') patch = { forceLogout: true };
    else if (action === 'unforce') patch = { forceLogout: false };
    apiCall('users/' + target.id, 'PATCH', patch).then(function() { showAlert('Berhasil', 'Sukses!', 'success'); loadUsers(); });
}

// ==================== TABLE RENDERS ====================
function renderAllUsersTable() {
    var t = document.getElementById('allUsersTable');
    if (!t) return;
    if (!allUsers.length) { t.innerHTML = '<tr><td colspan="7">Tidak ada user</td></tr>'; return; }
    t.innerHTML = allUsers.map(function(u) {
        var b = '';
        if (u.banned) b += '<span class="badge badge-red">BAN</span> ';
        if (u.banAkses) b += '<span class="badge badge-yellow">AKSES</span> ';
        if (u.forceLogout) b += '<span class="badge badge-orange">FORCE</span> ';
        return '<tr><td>' + esc(u.username) + '</td><td>' + esc(u.role || '') + '</td><td>' + b + '</td><td>' + (u.ip || '-') + '</td><td>' + (u.fingerprint ? u.fingerprint.substring(0, 12) + '...' : '-') + '</td><td>' + (u.expiry_date || '-') + '</td><td><button class="btn btn-outline btn-xs" onclick="openEditUserModal(\'' + u.id + '\')">Edit</button> <button class="btn btn-danger btn-xs" onclick="deleteUser(\'' + u.id + '\')">Hapus</button></td></tr>';
    }).join('');
}

function renderUnbannedTable() { var list = allUsers.filter(function(u) { return u.banned; }); var t = document.getElementById('unbannedUsersTable'); if (!t) return; t.innerHTML = list.length ? list.map(function(u) { return '<tr><td>' + esc(u.username) + '</td><td>' + (u.bannedUntil === 0 ? 'Permanen' : new Date(u.bannedUntil).toLocaleString()) + '</td><td><button class="btn btn-success btn-xs" onclick="doAction(\'unban\', allUsers.find(function(x){return x.id===\'' + u.id + '\'}))">Unban</button></td></tr>'; }).join('') : '<tr><td colspan="3">Tidak ada</td></tr>'; }
function renderBanAksesTable() { var list = allUsers.filter(function(u) { return !u.banAkses; }); var t = document.getElementById('banaksesUsersTable'); if (!t) return; t.innerHTML = list.length ? list.map(function(u) { return '<tr><td>' + esc(u.username) + '</td><td><button class="btn btn-danger btn-xs" onclick="doAction(\'banakses\', allUsers.find(function(x){return x.id===\'' + u.id + '\'}))">Ban Akses</button></td></tr>'; }).join('') : '<tr><td colspan="2">Tidak ada</td></tr>'; }
function renderUnbanAksesTable() { var list = allUsers.filter(function(u) { return u.banAkses; }); var t = document.getElementById('unbanaksesUsersTable'); if (!t) return; t.innerHTML = list.length ? list.map(function(u) { return '<tr><td>' + esc(u.username) + '</td><td><button class="btn btn-success btn-xs" onclick="doAction(\'unbanakses\', allUsers.find(function(x){return x.id===\'' + u.id + '\'}))">Unban</button></td></tr>'; }).join('') : '<tr><td colspan="2">Tidak ada</td></tr>'; }
function renderForceTable() { var list = allUsers.filter(function(u) { return !u.forceLogout; }); var t = document.getElementById('forceUsersTable'); if (!t) return; t.innerHTML = list.length ? list.map(function(u) { return '<tr><td>' + esc(u.username) + '</td><td><button class="btn btn-danger btn-xs" onclick="doAction(\'force\', allUsers.find(function(x){return x.id===\'' + u.id + '\'}))">Force</button></td></tr>'; }).join('') : '<tr><td colspan="2">Tidak ada</td></tr>'; }
function renderUnforceTable() { var list = allUsers.filter(function(u) { return u.forceLogout; }); var t = document.getElementById('unforceUsersTable'); if (!t) return; t.innerHTML = list.length ? list.map(function(u) { return '<tr><td>' + esc(u.username) + '</td><td><button class="btn btn-success btn-xs" onclick="doAction(\'unforce\', allUsers.find(function(x){return x.id===\'' + u.id + '\'}))">Unforce</button></td></tr>'; }).join('') : '<tr><td colspan="2">Tidak ada</td></tr>'; }
function renderProblemTable() { var list = allUsers.filter(function(u) { return u.banned || u.banAkses || u.forceLogout; }); var t = document.getElementById('problemUsersTable'); if (!t) return; t.innerHTML = list.length ? list.map(function(u) { var b = ''; if (u.banned) b += '<span class="badge badge-red">BAN</span> '; if (u.banAkses) b += '<span class="badge badge-yellow">AKSES</span> '; if (u.forceLogout) b += '<span class="badge badge-orange">FORCE</span> '; return '<tr><td>' + esc(u.username) + '</td><td>' + b + '</td></tr>'; }).join('') : '<tr><td colspan="2">Tidak ada</td></tr>'; }
function renderWebStats() { document.getElementById('webStatTotalUsers').textContent = allUsers.length; document.getElementById('webStatActiveUsers').textContent = allUsers.filter(function(u) { return !u.banned && !u.banAkses && !u.forceLogout; }).length; document.getElementById('webStatBannedUsers').textContent = allUsers.filter(function(u) { return u.banned || u.banAkses || u.forceLogout; }).length; }

// ==================== SETTINGS ====================
function verifySettingsKey() {
    var key = document.getElementById('settingsKeyInput').value.trim();
    if (!key) { document.getElementById('settingsKeyStatus').innerHTML = '<span style="color:#ef4444;">❌ Masukkan Key Aksi!</span>'; return; }
    apiCall('action_keys', 'GET').then(function(data) {
        var valid = false;
        for (var k in data) { if (data[k] && data[k].key === key) { valid = true; break; } }
        if (valid) {
            settingsKeyVerified = true;
            document.getElementById('settingsKeyPage').style.display = 'none';
            document.getElementById('settingsContent').style.display = 'block';
            loadSettingsData();
            showAlert('Berhasil', 'Key Aksi valid!', 'success');
        } else {
            document.getElementById('settingsKeyStatus').innerHTML = '<span style="color:#ef4444;">❌ Key Aksi salah!</span>';
            showAlert('Error', 'Key Aksi salah!', 'error');
        }
    });
}

function loadSettingsData() {
    apiCall('admin/auth', 'GET').then(function(r) {
        if (r) { document.getElementById('settingsEmail').value = r.email || ''; document.getElementById('settingsPassword').value = r.password || ''; }
    });
    loadActionKeys(); loadWhitelistIP(); loadWhitelistFP();
}

function togglePassword() { var el = document.getElementById('settingsPassword'); el.type = el.type === 'password' ? 'text' : 'password'; }
function openChangeEmailModal() { document.getElementById('newEmail').value = ''; document.getElementById('changeEmailModal').classList.add('show'); }
function changeEmail() { var email = document.getElementById('newEmail').value.trim(); if (!email) return; apiCall('admin/update_email', 'PATCH', { email: email }).then(function() { showAlert('Berhasil', 'Email diupdate!', 'success'); closeModal('changeEmailModal'); loadSettingsData(); }); }
function openChangePasswordModal() { document.getElementById('newPasswordSettings').value = ''; document.getElementById('confirmNewPassword').value = ''; document.getElementById('changePasswordModal').classList.add('show'); }
function changePassword() { var pass = document.getElementById('newPasswordSettings').value.trim(); var confirm = document.getElementById('confirmNewPassword').value.trim(); if (!pass || pass.length < 6 || pass !== confirm) { showAlert('Error', 'Password tidak valid!', 'error'); return; } apiCall('admin/update_password', 'PATCH', { password: pass }).then(function() { showAlert('Berhasil', 'Password diupdate!', 'success'); closeModal('changePasswordModal'); loadSettingsData(); }); }

function addActionKey() { var key = document.getElementById('newActionKey').value.trim(); if (!key) return; apiCall('action_keys', 'POST', { key: key, createdAt: Date.now() }).then(function() { showAlert('Berhasil', 'Key ditambahkan!', 'success'); document.getElementById('newActionKey').value = ''; loadActionKeys(); }); }
function loadActionKeys() { apiCall('action_keys', 'GET').then(function(data) { var html = ''; for (var k in data) { if (data[k] && data[k].key) { var masked = '••••' + data[k].key.substring(data[k].key.length - 4); var date = data[k].createdAt ? new Date(data[k].createdAt).toLocaleString('id-ID') : '-'; html += '<tr><td>' + masked + '</td><td>' + date + '</td><td><button class="btn btn-danger btn-xs" onclick="deleteActionKey(\'' + k + '\')">Hapus</button></td></tr>'; } } document.getElementById('actionKeysTable').innerHTML = html || '<tr><td colspan="3">Tidak ada</td></tr>'; }); }
function deleteActionKey(id) { showConfirm('Hapus key?', function() { apiCall('action_keys/' + id, 'DELETE').then(function() { showAlert('Berhasil', 'Key dihapus!', 'success'); loadActionKeys(); }); }); }

function addWhitelistIP() { var ip = document.getElementById('newWhitelistIP').value.trim(); if (!ip) return; apiCall('ip_whitelist', 'POST', { ip: ip, createdAt: Date.now() }).then(function() { showAlert('Berhasil', 'IP ditambahkan!', 'success'); document.getElementById('newWhitelistIP').value = ''; loadWhitelistIP(); }); }
function loadWhitelistIP() { apiCall('ip_whitelist', 'GET').then(function(data) { var html = ''; for (var k in data) { if (data[k] && data[k].ip) { var date = data[k].createdAt ? new Date(data[k].createdAt).toLocaleString('id-ID') : '-'; html += '<tr><td>' + data[k].ip + '</td><td>' + date + '</td><td><button class="btn btn-danger btn-xs" onclick="deleteWhitelistIP(\'' + k + '\')">Hapus</button></td></tr>'; } } document.getElementById('ipWhitelistTable').innerHTML = html || '<tr><td colspan="3">Tidak ada</td></tr>'; }); }
function deleteWhitelistIP(id) { showConfirm('Hapus IP?', function() { apiCall('ip_whitelist/' + id, 'DELETE').then(function() { showAlert('Berhasil', 'IP dihapus!', 'success'); loadWhitelistIP(); }); }); }

function addWhitelistFP() { var fp = document.getElementById('newWhitelistFP').value.trim(); if (!fp) return; apiCall('fp_whitelist', 'POST', { fp: fp, createdAt: Date.now() }).then(function() { showAlert('Berhasil', 'FP ditambahkan!', 'success'); document.getElementById('newWhitelistFP').value = ''; loadWhitelistFP(); }); }
function loadWhitelistFP() { apiCall('fp_whitelist', 'GET').then(function(data) { var html = ''; for (var k in data) { if (data[k] && data[k].fp) { var masked = data[k].fp.substring(0, 20) + '...'; var date = data[k].createdAt ? new Date(data[k].createdAt).toLocaleString('id-ID') : '-'; html += '<tr><td>' + masked + '</td><td>' + date + '</td><td><button class="btn btn-danger btn-xs" onclick="deleteWhitelistFP(\'' + k + '\')">Hapus</button></td></tr>'; } } document.getElementById('fpWhitelistTable').innerHTML = html || '<tr><td colspan="3">Tidak ada</td></tr>'; }); }
function deleteWhitelistFP(id) { showConfirm('Hapus FP?', function() { apiCall('fp_whitelist/' + id, 'DELETE').then(function() { showAlert('Berhasil', 'FP dihapus!', 'success'); loadWhitelistFP(); }); }); }

// ==================== MAINTENANCE ====================
function toggleMaintenance() { var el = document.getElementById('maintenanceToggle'); var st = document.getElementById('maintenanceStatusText'); st.innerHTML = el.checked ? '<span class="maintenance-status maintenance-on">ON</span>' : '<span class="maintenance-status maintenance-off">OFF</span>'; }
function saveMaintenance() { var status = document.getElementById('maintenanceToggle').checked; var msg = document.getElementById('maintenanceMessage').value.trim(); apiCall('maintenance', 'PUT', { enabled: status, message: msg || 'Website sedang maintenance...' }).then(function() { showAlert('Berhasil', 'Maintenance disimpan!', 'success'); }); }
function loadMaintenance() { apiCall('maintenance', 'GET').then(function(data) { if (data && data.enabled !== undefined) { document.getElementById('maintenanceToggle').checked = data.enabled; document.getElementById('maintenanceMessage').value = data.message || ''; toggleMaintenance(); } }); }

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async function() {
    document.querySelectorAll('.modal').forEach(function(m) { m.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('show'); }); });
    document.getElementById('loginPassword').addEventListener('keypress', function(e) { if (e.key === 'Enter') login(); });
    document.getElementById('accessKey').addEventListener('keypress', function(e) { if (e.key === 'Enter') verifyKey(); });
    document.addEventListener('click', function() { if (currentAdmin && sessionTimer) { clearTimeout(sessionTimer); sessionTimer = setTimeout(function() { if (currentAdmin) logout(); }, 1800000); } });
    if (!fingerprint) fingerprint = await getFingerprint();
});