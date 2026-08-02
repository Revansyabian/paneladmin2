// ==================== ANTI DEVTOOLS ====================
document.addEventListener('keydown', function(e) {
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I') || (e.ctrlKey && e.key === 'U')) {
        e.preventDefault();
        return false;
    }
});
document.addEventListener('contextmenu', function(e) { e.preventDefault(); return false; });

var devtoolsOpen = false;
setInterval(function() {
    if (window.outerWidth - window.innerWidth > 160 || window.outerHeight - window.innerHeight > 160) {
        if (!devtoolsOpen) {
            devtoolsOpen = true;
            document.body.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;background:#1a1a2e;color:#fff;font-size:18px;font-family:sans-serif">DevTools terdeteksi! Tutup untuk melanjutkan.</div>';
        }
    } else { devtoolsOpen = false; }
}, 1000);

// ==================== CONFIG ====================
var API_URL = '/api/revanstore';
var ADMIN_KEY = 'dhagwxwhu:f4afc5aa03e73130f5e055dfe6a708c4dc40759b';
var API_KEY = '835a198a-7843-4e13-a085-331eb891100e';

var currentAdmin = null;
var allUsers = [];
var allActivities = [];
var fingerprint = '';
var keyAttempts = 0;
var sessionTimer = null;
var pendingRequests = {};
var selectedActionUser = null;
var activityInterval = null;
var clockInterval = null;
var statsInterval = null;

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
function showAlert(title, message, type) {
    var overlay = document.getElementById('alertOverlay');
    var icon = document.getElementById('alertIcon');
    var titleEl = document.getElementById('alertTitle');
    var msgEl = document.getElementById('alertMessage');
    if (!overlay || !icon || !titleEl || !msgEl) { alert(title + ': ' + message); return; }
    titleEl.textContent = title;
    msgEl.textContent = message;
    icon.innerHTML = '';
    if (type === 'loading') icon.innerHTML = '<div class="spinner"></div>';
    else if (type === 'success') icon.innerHTML = '<div style="font-size:44px;color:#10b981"><i class="fas fa-check-circle"></i></div>';
    else if (type === 'error') icon.innerHTML = '<div style="font-size:44px;color:#ef4444"><i class="fas fa-times-circle"></i></div>';
    else icon.innerHTML = '<div style="font-size:44px;color:#00bfff"><i class="fas fa-info-circle"></i></div>';
    overlay.classList.add('show');
    if (type !== 'loading') setTimeout(function() { overlay.classList.remove('show'); }, 2000);
}
function hideAlert() { var o = document.getElementById('alertOverlay'); if (o) o.classList.remove('show'); }

// ==================== HELPERS ====================
function formatDate(d) {
    return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') + '/' + d.getFullYear();
}
function calculateDaysLeft(e) {
    if (!e) return -9999;
    var p = e.split('/');
    if (p.length !== 3) return -9999;
    var ex = new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1]));
    if (ex.getFullYear() === 9999) return 999999;
    var n = new Date(); n.setHours(0, 0, 0, 0);
    return Math.floor((ex - n) / (1000 * 60 * 60 * 24));
}
function esc(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function debounce(key, fn, delay) {
    if (pendingRequests[key]) return;
    pendingRequests[key] = true;
    fn().finally(function() { setTimeout(function() { pendingRequests[key] = false; }, delay || 1500); });
}

// ==================== API CALL ====================
async function apiCall(path, method, data) {
    if (!fingerprint) fingerprint = await getFingerprint();
    var payload = CryptoJS.AES.encrypt(JSON.stringify({ path: path, method: method, data: data || {} }), ADMIN_KEY).toString();
    var res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'X-Fingerprint': fingerprint },
        body: JSON.stringify({ data: payload })
    });
    var result = await res.json();
    if (result.error) throw new Error(result.error);
    if (result.encrypted && result.data) {
        var dec = CryptoJS.AES.decrypt(result.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
        if (dec) return JSON.parse(dec);
    }
    return result;
}

// ==================== VERIFY KEY ====================
function verifyKey() {
    var key = document.getElementById('accessKey').value.trim();
    if (!key) { showAlert('Error', 'Key wajib diisi!', 'error'); return; }
    showAlert('Verifikasi', 'Memeriksa key...', 'loading');
    apiCall('access_key', 'GET').then(function(r) {
        if (r && r.key === key) {
            keyAttempts = 0;
            document.getElementById('keyScreen').style.display = 'none';
            document.getElementById('loginScreen').style.display = 'block';
            document.getElementById('accessKey').value = '';
            hideAlert();
            showAlert('Berhasil', 'Key valid! Silakan login.', 'success');
        } else {
            keyAttempts++;
            document.getElementById('accessKey').value = '';
            hideAlert();
            if (keyAttempts >= 3) {
                showAlert('Error', 'Key salah 3x! Akses diblokir permanen.', 'error');
                setTimeout(function() { for (var i = 0; i < 5; i++) { apiCall('admin/login_failed', 'POST', {}).catch(function() {}); } showBlockedScreen(); }, 1500);
                return;
            }
            showAlert('Error', 'Key salah! Sisa ' + (3 - keyAttempts) + ' kesempatan.', 'error');
        }
    }).catch(function(e) { hideAlert(); showAlert('Error', 'Gagal: ' + e.message, 'error'); });
}
function showBlockedScreen() {
    document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#fef2f2,#fee2e2,#fecaca);padding:20px;font-family:\'Segoe UI\',sans-serif;"><div style="background:#fff;border-radius:20px;padding:40px 30px;max-width:440px;width:100%;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.1);border:1px solid #fecaca;"><div style="font-size:70px;color:#ef4444;margin-bottom:20px;"><i class="fas fa-shield-haltered"></i></div><h1 style="color:#dc2626;font-size:24px;margin-bottom:10px;">AKSES DITOLAK</h1><p style="color:#64748b;font-size:14px;">Maaf, akses Anda telah diblokir permanen.</p></div></div>';
}

// ==================== LOGIN ====================
function login() {
    var email = document.getElementById('loginEmail').value.trim();
    var pass = document.getElementById('loginPassword').value.trim();
    if (!email) { showAlert('Error', 'Email wajib diisi!', 'error'); return; }
    if (!pass) { showAlert('Error', 'Password wajib diisi!', 'error'); return; }
    showAlert('Memverifikasi', 'Mohon tunggu...', 'loading');
    apiCall('admin/auth', 'GET').then(function(r) {
        if (r && r.blocked) { hideAlert(); showBlockedScreen(); return; }
        if (r && r.email === email && r.password === pass) {
            return apiCall('admin/login_success', 'POST', {}).then(function() {
                currentAdmin = email;
                document.getElementById('loggedUser').textContent = email;
                document.getElementById('loginScreen').style.display = 'none';
                document.getElementById('adminPanel').style.display = 'block';
                document.getElementById('mainContainer').style.maxWidth = '900px';
                hideAlert();
                showAlert('Berhasil', 'Login berhasil!', 'success');
                startBg();
                loadUsers();
                loadAllActivities();
                updateStats();
                loadActivity();
                if (sessionTimer) clearTimeout(sessionTimer);
                sessionTimer = setTimeout(function() { if (currentAdmin) { logout(); showAlert('Sesi Berakhir', '30 menit idle.', 'info'); } }, 1800000);
            });
        } else {
            return apiCall('admin/login_failed', 'POST', {}).then(function(t) {
                hideAlert();
                if (t && t.blocked) { showBlockedScreen(); return; }
                showAlert('Gagal', 'Email atau password salah!', 'error');
            });
        }
    }).catch(function(e) { hideAlert(); showAlert('Error', 'Gagal: ' + e.message, 'error'); });
}
function logout() {
    currentAdmin = null; stopBg();
    if (sessionTimer) clearTimeout(sessionTimer);
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('keyScreen').style.display = 'none';
    document.getElementById('loginPassword').value = '';
    document.getElementById('mainContainer').style.maxWidth = '440px';
    showAlert('Logout', 'Anda telah logout.', 'info');
}

// ==================== BACKGROUND ====================
function startBg() {
    updateClock(); clockInterval = setInterval(updateClock, 30000);
    statsInterval = setInterval(function() { if (currentAdmin) { loadUsers(); loadAllActivities(); updateStats(); } }, 15000);
    activityInterval = setInterval(function() { if (currentAdmin) loadActivity(); }, 8000);
}
function stopBg() {
    if (clockInterval) clearInterval(clockInterval);
    if (statsInterval) clearInterval(statsInterval);
    if (activityInterval) clearInterval(activityInterval);
}
function updateClock() {
    var el = document.getElementById('clockDisplay');
    if (el) el.textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

// ==================== USERS ====================
function loadUsers() {
    apiCall('users', 'GET').then(function(data) {
        allUsers = [];
        for (var key in data) {
            if (data[key] && data[key].username) {
                data[key].id = key;
                // Normalize fields
                data[key].banned = data[key].banned || false;
                data[key].banAkses = data[key].banAkses || false;
                data[key].forceLogout = data[key].forceLogout || false;
                data[key].ip = data[key].ip || '';
                data[key].fingerprint = data[key].fingerprint || '';
                data[key].ipHistory = data[key].ipHistory || [];
                data[key].fpHistory = data[key].fpHistory || [];
                allUsers.push(data[key]);
            }
        }
        updateStats();
    }).catch(function() {});
}
function updateStats() {
    var elTotal = document.getElementById('statTotal');
    var elActive = document.getElementById('statActive');
    var elBanned = document.getElementById('statBanned');
    var elSuspicious = document.getElementById('statSuspicious');
    if (elTotal) elTotal.textContent = allUsers.length;
    if (elActive) elActive.textContent = allUsers.filter(function(u) { return !u.banned && !u.banAkses && !u.forceLogout && calculateDaysLeft(u.expiry_date) > 0; }).length;
    if (elBanned) elBanned.textContent = allUsers.filter(function(u) { return u.banned || u.banAkses || u.forceLogout; }).length;
    if (elSuspicious) elSuspicious.textContent = allUsers.filter(function(u) { return u.forceLogout; }).length;
}

// ==================== ACTIVITIES ====================
function loadAllActivities() {
    apiCall('activity_logs', 'GET').then(function(data) {
        allActivities = [];
        for (var key in data) { if (data[key] && data[key].username) { data[key].id = key; allActivities.push(data[key]); } }
    }).catch(function() {});
}
function loadActivity() {
    apiCall('activity_logs', 'GET').then(function(data) {
        var logs = [];
        for (var key in data) { if (data[key] && data[key].username) logs.push(data[key]); }
        logs.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
        logs = logs.slice(0, 30);
        var c = document.getElementById('activityListContainer');
        if (!c) return;
        if (!logs.length) { c.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Belum ada aktivitas</div>'; return; }
        var actionLabels = {
            login_success: '<i class="fas fa-sign-in-alt"></i> Login Sukses',
            login_failed: '<i class="fas fa-times-circle"></i> Gagal Login',
            topup: '<i class="fas fa-arrow-up"></i> Top Up',
            kuras: '<i class="fas fa-arrow-down"></i> Kuras',
            gantinama: '<i class="fas fa-edit"></i> Ganti Nama',
            banned: '<i class="fas fa-ban"></i> Ban User',
            unbanned: '<i class="fas fa-check"></i> Unban User',
            ban_akses: '<i class="fas fa-shield-haltered"></i> Ban Akses',
            unban_akses: '<i class="fas fa-shield-check"></i> Unban Akses',
            force_logout: '<i class="fas fa-eject"></i> Ditangguhkan',
            unforce_logout: '<i class="fas fa-unlock-alt"></i> Lepas Tangguh',
            ip_changed: '<i class="fas fa-globe"></i> IP Berubah',
            fp_changed: '<i class="fas fa-fingerprint"></i> FP Berubah',
            sharing_detected: '<i class="fas fa-exclamation-triangle"></i> Sharing Terdeteksi'
        };
        var h = '';
        logs.forEach(function(l) {
            var time = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
            var lb = actionLabels[l.action] || l.action;
            h += '<div class="activity-item"><div class="activity-dot ' + (l.action || '') + '"></div><div class="activity-info"><span class="activity-user"><i class="fas fa-user"></i> ' + esc(l.username || '-') + '</span> <span class="activity-desc">' + lb + (l.details ? ' — ' + l.details : '') + '</span></div><div class="activity-time"><i class="fas fa-clock"></i> ' + time + '</div></div>';
        });
        c.innerHTML = h;
    }).catch(function() {});
}

// ==================== ADD USER MODAL ====================
function openAddUserModal() {
    var nm = new Date();
    nm.setMonth(nm.getMonth() + 1);
    document.getElementById('newExpiryDate').value = formatDate(nm);
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('newPhone').value = '';
    document.getElementById('newRole').value = 'Operator';
    document.getElementById('newBanned').checked = false;
    document.getElementById('newBanAkses').checked = false;
    document.getElementById('newForceLogout').checked = false;
    document.getElementById('newIP').value = '';
    document.getElementById('newFP').value = '';
    document.getElementById('addUserModal').classList.add('show');
}
function closeAddUserModal() {
    document.getElementById('addUserModal').classList.remove('show');
}
function addUserNow() {
    var u = document.getElementById('newUsername').value.trim();
    var p = document.getElementById('newPassword').value.trim();
    var ph = document.getElementById('newPhone').value.trim();
    var r = document.getElementById('newRole').value;
    var e = document.getElementById('newExpiryDate').value.trim();
    var banned = document.getElementById('newBanned').checked;
    var banAkses = document.getElementById('newBanAkses').checked;
    var forceLogout = document.getElementById('newForceLogout').checked;

    if (!u || !p || !e) { showAlert('Error', 'Username, password, dan masa aktif wajib diisi!', 'error'); return; }
    if (p.length < 6) { showAlert('Error', 'Password minimal 6 karakter!', 'error'); return; }

    showAlert('Proses', 'Menambahkan user...', 'loading');

    var userData = {
        username: u,
        password: p,
        phone: ph,
        role: r,
        expiry_date: e,
        banned: banned,
        banAkses: banAkses,
        forceLogout: forceLogout,
        ip: '',
        fingerprint: '',
        ipHistory: [],
        fpHistory: [],
        banAksesUntil: 0,
        bannedUntil: 0,
        createdAt: Date.now()
    };

    apiCall('users', 'POST', userData).then(function() {
        showAlert('Berhasil', 'User "' + u + '" berhasil ditambahkan!', 'success');
        closeAddUserModal();
        loadUsers();
        loadAllActivities();
        updateStats();
        loadActivity();
        // Log aktivitas
        apiCall('activity_logs', 'POST', {
            username: u,
            action: 'user_created',
            timestamp: Date.now(),
            details: 'Role: ' + r + ', Banned: ' + banned + ', BanAkses: ' + banAkses + ', Force: ' + forceLogout
        }).catch(function() {});
    }).catch(function(e) { showAlert('Error', e.message, 'error'); });
}

// ==================== ACTION MODAL ====================
function openActionModal(action) {
    var modal = document.getElementById('actionModal');
    var title = document.getElementById('actionModalTitle');
    var body = document.getElementById('actionModalBody');
    if (!modal || !title || !body) return;

    var titles = {
        ban: '<i class="fas fa-user-slash"></i> Ban User',
        unban: '<i class="fas fa-user-check"></i> Unban User',
        banakses: '<i class="fas fa-shield-haltered"></i> Ban Akses',
        unbanakses: '<i class="fas fa-shield-check"></i> Unban Akses',
        force: '<i class="fas fa-eject"></i> Tangguhkan User (Force Logout)',
        unforce: '<i class="fas fa-unlock-alt"></i> Lepas Tangguhan'
    };
    title.innerHTML = titles[action] || 'Aksi';
    selectedActionUser = null;

    if (action === 'ban' || action === 'banakses' || action === 'force') {
        body.innerHTML = `
            <div class="input-box">
                <label><i class="fas fa-search"></i> Cari User</label>
                <input type="text" id="actionSearch" placeholder="Ketik username..." maxlength="30" oninput="searchUserList('${action}')">
            </div>
            <div id="actionUserList" style="max-height:200px;overflow-y:auto;margin-bottom:12px;display:flex;flex-direction:column;gap:4px"></div>
            <div id="actionDurationRow" style="display:${action === 'banakses' ? 'block' : 'none'};margin-bottom:12px">
                <label style="font-size:11px;font-weight:600;color:var(--text);margin-bottom:4px;display:block"><i class="fas fa-clock"></i> Durasi</label>
                <select id="actionDuration" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;background:#fafbfc;font-family:inherit">
                    <option value="3600000">1 Jam</option>
                    <option value="7200000">2 Jam</option>
                    <option value="21600000">6 Jam</option>
                    <option value="43200000">12 Jam</option>
                    <option value="86400000">24 Jam</option>
                    <option value="0">Permanen</option>
                </select>
            </div>
            <div id="actionSelectedUser" style="margin-bottom:12px;font-size:12px;color:var(--sub)"></div>
            <button class="btn btn-primary btn-block" onclick="executeAction('${action}')"><i class="fas fa-check"></i> ${titles[action]}</button>`;
    } else {
        body.innerHTML = `
            <div class="input-box">
                <label><i class="fas fa-search"></i> Cari User</label>
                <input type="text" id="actionSearch" placeholder="Ketik username..." maxlength="30" oninput="searchUserList('${action}')">
            </div>
            <div id="actionUserList" style="max-height:200px;overflow-y:auto;margin-bottom:12px;display:flex;flex-direction:column;gap:4px"></div>
            <div id="actionSelectedUser" style="margin-bottom:12px;font-size:12px;color:var(--sub)"></div>
            <button class="btn btn-primary btn-block" onclick="executeAction('${action}')"><i class="fas fa-check"></i> ${titles[action]}</button>`;
    }
    modal.classList.add('show');
    setTimeout(function() { searchUserList(action); }, 100);
}
function closeActionModal() {
    var modal = document.getElementById('actionModal');
    if (modal) modal.classList.remove('show');
    selectedActionUser = null;
}
function searchUserList(action) {
    var q = document.getElementById('actionSearch') ? document.getElementById('actionSearch').value : '';
    var list = document.getElementById('actionUserList');
    if (!list) return;
    var filtered = [];
    if (action === 'unban') filtered = allUsers.filter(function(u) { return u.banned && u.username.toLowerCase().includes(q.toLowerCase()); });
    else if (action === 'unbanakses') filtered = allUsers.filter(function(u) { return u.banAkses && u.username.toLowerCase().includes(q.toLowerCase()); });
    else if (action === 'unforce') filtered = allUsers.filter(function(u) { return u.forceLogout && u.username.toLowerCase().includes(q.toLowerCase()); });
    else if (action === 'ban') filtered = allUsers.filter(function(u) { return !u.banned && u.username.toLowerCase().includes(q.toLowerCase()); });
    else if (action === 'banakses') filtered = allUsers.filter(function(u) { return !u.banAkses && u.username.toLowerCase().includes(q.toLowerCase()); });
    else if (action === 'force') filtered = allUsers.filter(function(u) { return !u.forceLogout && u.username.toLowerCase().includes(q.toLowerCase()); });
    else filtered = allUsers.filter(function(u) { return u.username.toLowerCase().includes(q.toLowerCase()); });
    if (!filtered.length) { list.innerHTML = '<div style="padding:8px;color:var(--sub);font-size:11px"><i class="fas fa-search"></i> Tidak ada user</div>'; return; }
    list.innerHTML = filtered.map(function(u) {
        var isSel = selectedActionUser && selectedActionUser.id === u.id;
        var badges = '';
        if (u.banned) badges += ' <span class="badge badge-red">BANNED</span>';
        if (u.banAkses) badges += ' <span class="badge badge-yellow">BAN AKSES</span>';
        if (u.forceLogout) badges += ' <span class="badge badge-orange">DITANGGUHKAN</span>';
        return '<div class="user-check-card' + (isSel ? ' selected' : '') + '" onclick="selectActionUser(\'' + u.id + '\')"><span style="width:16px;height:16px;border-radius:4px;border:2px solid ' + (isSel ? 'var(--blue)' : '#cbd5e1') + ';display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;background:' + (isSel ? 'var(--blue)' : 'transparent') + '"><i class="fas fa-check"></i></span>' + esc(u.username) + ' · ' + esc(u.role) + badges + '</div>';
    }).join('');
}
function selectActionUser(id) {
    selectedActionUser = allUsers.find(function(u) { return u.id === id; });
    var el = document.getElementById('actionSelectedUser');
    if (el) el.innerHTML = selectedActionUser ? '<i class="fas fa-check-circle" style="color:#10b981;"></i> Dipilih: <b>' + esc(selectedActionUser.username) + '</b>' : '';
}
function executeAction(action) {
    if (!selectedActionUser) { showAlert('Error', 'Pilih user dulu!', 'error'); return; }
    var name = selectedActionUser.username;
    var msgs = {
        ban: '<i class="fas fa-user-slash"></i> Ban user "' + name + '"?',
        unban: '<i class="fas fa-user-check"></i> Unban user "' + name + '"?',
        banakses: '<i class="fas fa-shield-haltered"></i> Ban akses "' + name + '"?',
        unbanakses: '<i class="fas fa-shield-check"></i> Unban akses "' + name + '"?',
        force: '<i class="fas fa-eject"></i> Tangguhkan "' + name + '"? (User tidak bisa login)',
        unforce: '<i class="fas fa-unlock-alt"></i> Lepas tangguhan "' + name + '"?'
    };
    showConfirm(msgs[action], function() {
        debounce(action + selectedActionUser.id, function() { return doAction(action, selectedActionUser); });
    });
}
function doAction(action, target) {
    closeActionModal();
    showAlert('Proses', 'Memproses...', 'loading');
    var patchData = {};
    var logAction = '';
    var logDetails = '';

    if (action === 'ban') { patchData = { banned: true, bannedUntil: 0 }; logAction = 'banned'; logDetails = 'User dibanned'; }
    else if (action === 'unban') { patchData = { banned: false, bannedUntil: 0 }; logAction = 'unbanned'; logDetails = 'User di-unban'; }
    else if (action === 'banakses') {
        var dur = parseInt(document.getElementById('actionDuration').value);
        patchData = { banAkses: true, banAksesUntil: dur === 0 ? 0 : Date.now() + dur };
        logAction = 'ban_akses'; logDetails = 'Durasi: ' + (dur === 0 ? 'Permanen' : document.getElementById('actionDuration').options[document.getElementById('actionDuration').selectedIndex].text);
    }
    else if (action === 'unbanakses') { patchData = { banAkses: false, banAksesUntil: 0 }; logAction = 'unban_akses'; logDetails = 'Ban akses dilepas'; }
    else if (action === 'force') { patchData = { forceLogout: true }; logAction = 'force_logout'; logDetails = 'User ditangguhkan (sharing akun)'; }
    else if (action === 'unforce') { patchData = { forceLogout: false }; logAction = 'unforce_logout'; logDetails = 'Tangguhan dilepas'; }

    apiCall('users/' + target.id, 'PATCH', patchData).then(function() {
        // Log aktivitas
        apiCall('activity_logs', 'POST', { username: target.username, action: logAction, timestamp: Date.now(), details: logDetails }).catch(function() {});
        // Block IP & FP jika ban akses
        if (action === 'banakses' && target.ip) apiCall('block_ip_manual', 'POST', { ip: target.ip }).catch(function() {});
        if (action === 'banakses' && target.fingerprint) apiCall('block_fp_manual', 'POST', { fp: target.fingerprint }).catch(function() {});
        if (action === 'unbanakses' && target.ip) apiCall('blocked_ips/' + target.ip.replace(/\./g, '_'), 'DELETE').catch(function() {});
        if (action === 'unbanakses' && target.fingerprint) apiCall('blocked_fp/' + target.fingerprint, 'DELETE').catch(function() {});

        var ok = {
            ban: '<i class="fas fa-ban"></i> User dibanned!',
            unban: '<i class="fas fa-check"></i> User di-unban!',
            banakses: '<i class="fas fa-shield-haltered"></i> Akses user dibanned!',
            unbanakses: '<i class="fas fa-shield-check"></i> Akses user di-unban!',
            force: '<i class="fas fa-eject"></i> User ditangguhkan!',
            unforce: '<i class="fas fa-unlock-alt"></i> Tangguhan dilepas!'
        };
        showAlert('Berhasil', ok[action], 'success');
        loadUsers(); loadAllActivities(); updateStats(); loadActivity();
    }).catch(function(e) { showAlert('Error', e.message, 'error'); });
}

// ==================== NAVIGATION ====================
function navigateTo(tab) {
    document.getElementById('adminPanel').style.display = 'none';
    if (!document.getElementById('subPanel')) {
        var el = document.createElement('div');
        el.id = 'subPanel';
        el.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:#f8fafc;z-index:50;overflow-y:auto;padding:20px';
        el.innerHTML = '<div style="max-width:600px;margin:0 auto"><button class="btn btn-sm btn-outline" onclick="closeSubPanel()" style="margin-bottom:14px"><i class="fas fa-arrow-left"></i> Kembali ke Beranda</button><div id="subPanelContent"></div></div>';
        document.body.appendChild(el);
    }
    document.getElementById('subPanel').style.display = 'block';
    if (tab === 'users') renderUserList();
    else if (tab === 'bannedlist') renderBannedList();
    else if (tab === 'suspicious') renderSuspiciousList();
}
function closeSubPanel() {
    document.getElementById('subPanel').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    loadActivity();
}

function renderUserList() {
    var h = '<div style="background:#fff;border-radius:14px;padding:20px;border:1px solid #e2e8f0"><div class="section-title" style="margin-bottom:14px"><i class="fas fa-users"></i> Semua User (' + allUsers.length + ')</div>';
    if (!allUsers.length) { h += '<div class="empty-state"><i class="fas fa-users-slash"></i> Tidak ada user</div>'; }
    else {
        allUsers.forEach(function(u) {
            var d = calculateDaysLeft(u.expiry_date);
            var dt = d === 999999 ? 'PERMANENT' : (d < 0 ? Math.abs(d) + ' hari lalu' : d + ' hari');
            var badges = '';
            if (u.banned) badges += '<span class="badge badge-red">BANNED</span> ';
            if (u.banAkses) badges += '<span class="badge badge-yellow">BAN AKSES</span> ';
            if (u.forceLogout) badges += '<span class="badge badge-orange">DITANGGUHKAN</span> ';
            if (d > 0 && !u.banned && !u.banAkses && !u.forceLogout) badges += '<span class="badge badge-green">AKTIF</span> ';
            h += '<div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;font-size:12px;cursor:pointer" onclick="openDetailModal(\'' + u.id + '\')"><b><i class="fas fa-user"></i> ' + esc(u.username) + '</b> · <i class="fas fa-user-tag"></i> ' + esc(u.role) + ' · <i class="fas fa-calendar-alt"></i> ' + dt + '<br>' + badges + '<span style="font-size:10px;color:#94a3b8;"><i class="fas fa-globe"></i> ' + (u.ip || '-') + ' · <i class="fas fa-fingerprint"></i> ' + (u.fingerprint ? u.fingerprint.substring(0, 12) + '...' : '-') + '</span></div>';
        });
    }
    h += '</div>';
    document.getElementById('subPanelContent').innerHTML = h;
}
function renderBannedList() {
    var banned = allUsers.filter(function(u) { return u.banned || u.banAkses || u.forceLogout; });
    var h = '<div style="background:#fff;border-radius:14px;padding:20px;border:1px solid #e2e8f0"><div class="section-title" style="margin-bottom:14px"><i class="fas fa-user-slash"></i> User Bermasalah (' + banned.length + ')</div>';
    if (!banned.length) h += '<div class="empty-state"><i class="fas fa-check-circle"></i> Semua aman</div>';
    else banned.forEach(function(u) {
        var badges = '';
        if (u.banned) badges += '<span class="badge badge-red">BANNED</span> ';
        if (u.banAkses) badges += '<span class="badge badge-yellow">BAN AKSES</span> ';
        if (u.forceLogout) badges += '<span class="badge badge-orange">DITANGGUHKAN</span> ';
        h += '<div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;font-size:12px;cursor:pointer" onclick="openDetailModal(\'' + u.id + '\')"><b><i class="fas fa-user"></i> ' + esc(u.username) + '</b> · ' + badges + '</div>';
    });
    h += '</div>';
    document.getElementById('subPanelContent').innerHTML = h;
}
function renderSuspiciousList() {
    var suspicious = allUsers.filter(function(u) { return u.forceLogout; });
    var h = '<div style="background:#fff;border-radius:14px;padding:20px;border:1px solid #e2e8f0"><div class="section-title" style="margin-bottom:14px"><i class="fas fa-exclamation-triangle"></i> User Ditangguhkan (' + suspicious.length + ')</div>';
    if (!suspicious.length) h += '<div class="empty-state"><i class="fas fa-check-circle"></i> Tidak ada user ditangguhkan</div>';
    else suspicious.forEach(function(u) {
        h += '<div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;font-size:12px;cursor:pointer" onclick="openDetailModal(\'' + u.id + '\')"><b><i class="fas fa-user"></i> ' + esc(u.username) + '</b> · <span class="badge badge-orange">DITANGGUHKAN</span><br><span style="font-size:10px;"><i class="fas fa-globe"></i> IP: ' + (u.ip || '-') + ' · <i class="fas fa-fingerprint"></i> FP: ' + (u.fingerprint ? u.fingerprint.substring(0, 12) + '...' : '-') + '</span></div>';
    });
    h += '</div>';
    document.getElementById('subPanelContent').innerHTML = h;
}

function openDetailModal(id) {
    var u = allUsers.find(function(x) { return x.id === id; });
    if (!u) return;
    document.getElementById('detailModalTitle').innerHTML = '<i class="fas fa-user"></i> ' + esc(u.username);
    var d = calculateDaysLeft(u.expiry_date);
    var dt = d === 999999 ? 'PERMANENT' : (d < 0 ? Math.abs(d) + ' hari lalu' : d + ' hari');
    var statusHtml = '';
    if (u.banned) statusHtml += '<span class="badge badge-red">BANNED</span> ';
    if (u.banAkses) statusHtml += '<span class="badge badge-yellow">BAN AKSES</span> ';
    if (u.forceLogout) statusHtml += '<span class="badge badge-orange">DITANGGUHKAN</span> ';
    if (!u.banned && !u.banAkses && !u.forceLogout) statusHtml += '<span class="badge badge-green">AKTIF</span> ';

    var ipHistoryHtml = '';
    if (u.ipHistory && u.ipHistory.length > 0) {
        ipHistoryHtml = '<div style="margin-top:8px;"><b>IP History:</b><br>';
        u.ipHistory.slice(-5).forEach(function(ip) { ipHistoryHtml += '<span style="font-size:10px;">' + esc(ip) + '</span><br>'; });
        ipHistoryHtml += '</div>';
    }

    document.getElementById('detailModalBody').innerHTML =
        '<div class="detail-row"><span class="detail-label"><i class="fas fa-user"></i> Username</span><span class="detail-value">' + esc(u.username) + '</span></div>' +
        '<div class="detail-row"><span class="detail-label"><i class="fas fa-lock"></i> Password</span><span class="detail-value">' + esc(u.password || '-') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label"><i class="fas fa-phone"></i> Nomor</span><span class="detail-value">' + esc(u.phone || '-') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label"><i class="fas fa-user-tag"></i> Role</span><span class="detail-value">' + esc(u.role) + '</span></div>' +
        '<div class="detail-row"><span class="detail-label"><i class="fas fa-calendar-alt"></i> Masa Aktif</span><span class="detail-value">' + esc(u.expiry_date) + ' (' + dt + ')</span></div>' +
        '<div class="detail-row"><span class="detail-label"><i class="fas fa-globe"></i> IP</span><span class="detail-value">' + esc(u.ip || '-') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label"><i class="fas fa-fingerprint"></i> Fingerprint</span><span class="detail-value">' + esc((u.fingerprint || '-').substring(0, 24)) + '...</span></div>' +
        '<div class="detail-row"><span class="detail-label"><i class="fas fa-ban"></i> Banned</span><span class="detail-value">' + (u.banned ? '<span style="color:#ef4444;">TRUE</span>' : '<span style="color:#10b981;">FALSE</span>') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label"><i class="fas fa-shield-haltered"></i> Ban Akses</span><span class="detail-value">' + (u.banAkses ? '<span style="color:#ef4444;">TRUE</span>' : '<span style="color:#10b981;">FALSE</span>') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label"><i class="fas fa-eject"></i> Ditangguhkan</span><span class="detail-value">' + (u.forceLogout ? '<span style="color:#f97316;">TRUE</span>' : '<span style="color:#10b981;">FALSE</span>') + '</span></div>' +
        ipHistoryHtml;
    document.getElementById('detailModal').classList.add('show');
}

// ==================== CONFIRM ====================
function showConfirm(msg, cb) {
    var overlay = document.getElementById('confirmOverlay');
    var msgEl = document.getElementById('confirmMessage');
    var yes = document.getElementById('confirmYes');
    var no = document.getElementById('confirmNo');
    if (!overlay) { if (confirm(msg)) cb(); return; }
    msgEl.innerHTML = msg;
    overlay.style.display = 'flex';
    yes.onclick = function() { overlay.style.display = 'none'; cb(); };
    no.onclick = function() { overlay.style.display = 'none'; };
    overlay.onclick = function(e) { if (e.target === overlay) overlay.style.display = 'none'; };
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async function() {
    var closeActionBtn = document.getElementById('closeActionModalBtn');
    if (closeActionBtn) closeActionBtn.addEventListener('click', closeActionModal);
    var closeDetailBtn = document.getElementById('closeDetailModalBtn');
    if (closeDetailBtn) closeDetailBtn.addEventListener('click', function() { document.getElementById('detailModal').classList.remove('show'); });
    var actionModal = document.getElementById('actionModal');
    if (actionModal) actionModal.addEventListener('click', function(e) { if (e.target === this) closeActionModal(); });
    var detailModal = document.getElementById('detailModal');
    if (detailModal) detailModal.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('show'); });
    var addUserModal = document.getElementById('addUserModal');
    if (addUserModal) addUserModal.addEventListener('click', function(e) { if (e.target === this) closeAddUserModal(); });
    var loginPass = document.getElementById('loginPassword');
    if (loginPass) loginPass.addEventListener('keypress', function(e) { if (e.key === 'Enter') login(); });
    var accessKey = document.getElementById('accessKey');
    if (accessKey) accessKey.addEventListener('keypress', function(e) { if (e.key === 'Enter') verifyKey(); });
    document.addEventListener('click', function() {
        if (currentAdmin && sessionTimer) {
            clearTimeout(sessionTimer);
            sessionTimer = setTimeout(function() { if (currentAdmin) { logout(); showAlert('Sesi Berakhir', '30 menit idle.', 'info'); } }, 1800000);
        }
    });
    if (!fingerprint) fingerprint = await getFingerprint();
    try { var c = await apiCall('check_blocked', 'POST', { fingerprint: fingerprint }); if (c && c.blocked) { showBlockedScreen(); return; } } catch (e) {}
});