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
var activityLoaded = false;

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
    else icon.innerHTML = '<div style="font-size:44px;color:#3b82f6"><i class="fas fa-info-circle"></i></div>';
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
            showAlert('Berhasil', 'Key valid!', 'success');
        } else {
            keyAttempts++;
            document.getElementById('accessKey').value = '';
            hideAlert();
            if (keyAttempts >= 3) {
                showAlert('Error', 'Key salah 3x! Diblokir.', 'error');
                setTimeout(function() { showBlockedScreen(); }, 1500);
                return;
            }
            showAlert('Error', 'Key salah! Sisa ' + (3 - keyAttempts), 'error');
        }
    }).catch(function(e) { hideAlert(); showAlert('Error', e.message, 'error'); });
}
function showBlockedScreen() {
    document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;padding:20px;font-family:\'Segoe UI\',sans-serif;"><div style="background:rgba(30,41,59,0.9);border-radius:20px;padding:40px;max-width:440px;width:100%;text-align:center;border:1px solid rgba(239,68,68,0.3);backdrop-filter:blur(10px);"><div style="font-size:70px;margin-bottom:20px;">🔒</div><h1 style="color:#ef4444;font-size:24px;">AKSES DITOLAK</h1><p style="color:#94a3b8;">Akses Anda telah diblokir permanen.</p></div></div>';
}

// ==================== LOGIN ====================
function login() {
    var email = document.getElementById('loginEmail').value.trim();
    var pass = document.getElementById('loginPassword').value.trim();
    if (!email || !pass) { showAlert('Error', 'Email & password wajib!', 'error'); return; }
    showAlert('Verifikasi', 'Mohon tunggu...', 'loading');
    apiCall('admin/auth', 'GET').then(function(r) {
        if (r && r.blocked) { hideAlert(); showBlockedScreen(); return; }
        if (r && r.email === email && r.password === pass) {
            apiCall('admin/login_success', 'POST', {}).then(function() {
                currentAdmin = email;
                document.getElementById('loggedUser').textContent = email;
                document.getElementById('loginScreen').style.display = 'none';
                document.getElementById('adminPanel').style.display = 'block';
                document.getElementById('mainContainer').style.maxWidth = '1000px';
                hideAlert();
                showAlert('Berhasil', 'Login berhasil!', 'success');
                startBg();
                loadUsers();
                updateStats();
                loadActivity();
                if (sessionTimer) clearTimeout(sessionTimer);
                sessionTimer = setTimeout(function() { if (currentAdmin) { logout(); showAlert('Sesi Berakhir', '30 menit idle.', 'info'); } }, 1800000);
            });
        } else {
            apiCall('admin/login_failed', 'POST', {}).then(function() {
                hideAlert();
                showAlert('Gagal', 'Email atau password salah!', 'error');
            });
        }
    }).catch(function(e) { hideAlert(); showAlert('Error', e.message, 'error'); });
}
function logout() {
    currentAdmin = null; stopBg(); activityLoaded = false;
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
    updateClock(); clockInterval = setInterval(updateClock, 60000);
    statsInterval = setInterval(function() { if (currentAdmin) { loadUsers(); updateStats(); } }, 30000);
}
function stopBg() { if (clockInterval) clearInterval(clockInterval); if (statsInterval) clearInterval(statsInterval); if (activityInterval) clearInterval(activityInterval); }
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
    }).catch(function() {});
}
function updateStats() {
    var elTotal = document.getElementById('statTotal');
    var elActive = document.getElementById('statActive');
    var elBanned = document.getElementById('statBanned');
    var elForce = document.getElementById('statForce');
    if (elTotal) elTotal.textContent = allUsers.length;
    if (elActive) elActive.textContent = allUsers.filter(function(u) { return !u.banned && !u.banAkses && !u.forceLogout && calculateDaysLeft(u.expiry_date) > 0; }).length;
    if (elBanned) elBanned.textContent = allUsers.filter(function(u) { return u.banned || u.banAkses; }).length;
    if (elForce) elForce.textContent = allUsers.filter(function(u) { return u.forceLogout; }).length;
}

// ==================== ACTIVITIES ====================
function loadActivity() {
    if (activityLoaded) return;
    activityLoaded = true;
    apiCall('activity_logs', 'GET').then(function(data) {
        allActivities = [];
        var logs = [];
        for (var key in data) { if (data[key] && data[key].username) { data[key].id = key; allActivities.push(data[key]); logs.push(data[key]); } }
        logs.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
        logs = logs.slice(0, 30);
        var c = document.getElementById('activityListContainer');
        if (!c) { activityLoaded = false; return; }
        if (!logs.length) { c.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Belum ada aktivitas</div>'; return; }
        var labels = {
            sharing_detected: '🔴 SHARING TERDETEKSI',
            banned: 'Ban User', unbanned: 'Unban User',
            ban_akses: 'Ban Akses', unban_akses: 'Unban Akses',
            force_logout: 'Ditangguhkan', unforce_logout: 'Lepas Tangguh',
            topup: 'Top Up', kuras: 'Kuras', gantinama: 'Ganti Nama',
            login_success: 'Login Sukses', login_failed: 'Gagal Login'
        };
        var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><span style="font-size:11px;color:#94a3b8;">📋 ' + logs.length + ' aktivitas</span><button class="btn btn-sm btn-danger" onclick="clearAllLogs()" style="padding:4px 10px;font-size:10px;"><i class="fas fa-trash"></i> Clear</button></div>';
        logs.forEach(function(l) {
            var time = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
            var lb = labels[l.action] || l.action;
            var bg = l.action === 'sharing_detected' ? 'background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.3);' : '';
            h += '<div class="activity-item" style="' + bg + '"><div class="activity-dot ' + (l.action || '') + '"></div><div class="activity-info"><span class="activity-user">' + esc(l.username) + '</span> <span class="activity-desc">' + lb + (l.details ? ' — ' + l.details : '') + '</span></div><div class="activity-time">' + time + '</div></div>';
        });
        c.innerHTML = h;
    }).catch(function() { activityLoaded = false; });
}

// ==================== CLEAR LOG (HAPUS SEMUA) ====================
function clearAllLogs() {
    showConfirm('<i class="fas fa-trash"></i> HAPUS SEMUA LOG?', function() {
        showAlert('Proses', 'Menghapus...', 'loading');
        apiCall('activity_logs', 'GET').then(function(data) {
            if (!data || Object.keys(data).length === 0) { hideAlert(); showAlert('Info', 'Log kosong!', 'info'); return; }
            var keys = Object.keys(data);
            var count = 0;
            var promises = [];
            keys.forEach(function(key) {
                promises.push(apiCall('activity_logs/' + key, 'DELETE').then(function() { count++; }));
            });
            Promise.all(promises).then(function() {
                hideAlert();
                showAlert('Berhasil', count + ' log dihapus!', 'success');
                activityLoaded = false;
                loadActivity();
            });
        }).catch(function() { hideAlert(); showAlert('Error', 'Gagal!', 'error'); });
    });
}

// ==================== ADD USER ====================
function openAddUserModal() {
    var nm = new Date(); nm.setMonth(nm.getMonth() + 1);
    document.getElementById('newExpiryDate').value = formatDate(nm);
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('newPhone').value = '';
    document.getElementById('newRole').value = 'Operator';
    document.getElementById('addUserModal').classList.add('show');
}
function closeAddUserModal() { document.getElementById('addUserModal').classList.remove('show'); }
function addUserNow() {
    var u = document.getElementById('newUsername').value.trim();
    var p = document.getElementById('newPassword').value.trim();
    var ph = document.getElementById('newPhone').value.trim();
    var r = document.getElementById('newRole').value;
    var e = document.getElementById('newExpiryDate').value.trim();
    if (!u || !p || !e) { showAlert('Error', 'Username, password, expiry wajib!', 'error'); return; }
    if (p.length < 6) { showAlert('Error', 'Password min 6 karakter!', 'error'); return; }
    showAlert('Proses', 'Menambahkan...', 'loading');
    apiCall('users', 'POST', { username: u, password: p, phone: ph, role: r, expiry_date: e, banned: false, banAkses: false, forceLogout: false, ip: '', fingerprint: '', banAksesUntil: 0, bannedUntil: 0, createdAt: Date.now() })
    .then(function() { showAlert('Berhasil', 'User ditambahkan!', 'success'); closeAddUserModal(); loadUsers(); updateStats(); activityLoaded = false; loadActivity(); })
    .catch(function(e) { showAlert('Error', e.message, 'error'); });
}

// ==================== EDIT USER ====================
function openEditUserModal(id) {
    var u = allUsers.find(function(x) { return x.id === id; });
    if (!u) return;
    document.getElementById('editUserId').value = u.id;
    document.getElementById('editUsername').value = u.username;
    document.getElementById('editPassword').value = u.password || '';
    document.getElementById('editPhone').value = u.phone || '';
    document.getElementById('editRole').value = u.role || 'Operator';
    document.getElementById('editExpiryDate').value = u.expiry_date || '';
    document.getElementById('editIP').value = u.ip || '-';
    document.getElementById('editFP').value = u.fingerprint ? u.fingerprint.substring(0, 20) + '...' : '-';
    document.getElementById('editUserModal').classList.add('show');
}
function closeEditUserModal() { document.getElementById('editUserModal').classList.remove('show'); }
function saveUserEdit() {
    var id = document.getElementById('editUserId').value;
    var u = document.getElementById('editUsername').value.trim();
    var p = document.getElementById('editPassword').value.trim();
    var ph = document.getElementById('editPhone').value.trim();
    var r = document.getElementById('editRole').value;
    var e = document.getElementById('editExpiryDate').value.trim();
    if (!u) { showAlert('Error', 'Username wajib!', 'error'); return; }
    showAlert('Proses', 'Menyimpan...', 'loading');
    var d = { username: u, role: r, expiry_date: e };
    if (p) d.password = p;
    if (ph) d.phone = ph;
    apiCall('users/' + id, 'PATCH', d).then(function() { showAlert('Berhasil', 'Updated!', 'success'); closeEditUserModal(); loadUsers(); updateStats(); activityLoaded = false; loadActivity(); })
    .catch(function(e) { showAlert('Error', e.message, 'error'); });
}

// ==================== ACTION MODAL (BAN/UNBAN + LIST) ====================
function openActionModal(action) {
    var modal = document.getElementById('actionModal');
    var title = document.getElementById('actionModalTitle');
    var body = document.getElementById('actionModalBody');
    if (!modal || !title || !body) return;
    selectedActionUser = null;

    if (action === 'ban') {
        title.innerHTML = '<i class="fas fa-ban"></i> Ban User';
        body.innerHTML = '<div class="input-box"><label>Cari User</label><input type="text" id="actionSearch" placeholder="Ketik username..." oninput="searchUserList(\'ban\')"></div><div id="actionUserList" style="max-height:200px;overflow-y:auto;margin-bottom:12px;"></div><div style="margin-bottom:12px"><label>Durasi</label><select id="actionDuration" style="width:100%;padding:10px;border-radius:8px;"><option value="3600000">1 Jam</option><option value="10800000">3 Jam</option><option value="86400000">24 Jam</option><option value="0">Permanen</option></select></div><div id="actionSelectedUser" style="margin-bottom:12px;font-size:12px;"></div><div style="display:flex;gap:8px;"><button class="btn btn-danger" onclick="executeAction(\'ban\')" style="flex:1;">🔨 Ban</button><button class="btn btn-success" onclick="executeAction(\'unban\')" style="flex:1;">✅ Unban</button></div><hr><div style="margin-top:12px;"><b>📋 List Banned (' + allUsers.filter(function(u){return u.banned;}).length + ')</b><div style="max-height:150px;overflow-y:auto;margin-top:8px;">' + allUsers.filter(function(u){return u.banned;}).map(function(u){return '<div style="padding:6px;cursor:pointer;font-size:11px;" onclick="selectActionUser(\''+u.id+'\')">'+esc(u.username)+' <span class="badge badge-red">BANNED</span></div>';}).join('') + '</div></div>';
    }
    else if (action === 'banakses') {
        title.innerHTML = '<i class="fas fa-shield-haltered"></i> Ban Akses';
        body.innerHTML = '<div class="input-box"><label>Cari User</label><input type="text" id="actionSearch" placeholder="Ketik username..." oninput="searchUserList(\'banakses\')"></div><div id="actionUserList" style="max-height:200px;overflow-y:auto;margin-bottom:12px;"></div><div style="margin-bottom:12px"><label>Durasi</label><select id="actionDuration" style="width:100%;padding:10px;border-radius:8px;"><option value="3600000">1 Jam</option><option value="10800000">3 Jam</option><option value="86400000">24 Jam</option><option value="0">Permanen</option></select></div><div id="actionSelectedUser" style="margin-bottom:12px;font-size:12px;"></div><div style="display:flex;gap:8px;"><button class="btn btn-warning" onclick="executeAction(\'banakses\')" style="flex:1;">🛡️ Ban Akses</button><button class="btn btn-success" onclick="executeAction(\'unbanakses\')" style="flex:1;">✅ Unban Akses</button></div><hr><div style="margin-top:12px;"><b>📋 List Ban Akses (' + allUsers.filter(function(u){return u.banAkses;}).length + ')</b><div style="max-height:150px;overflow-y:auto;margin-top:8px;">' + allUsers.filter(function(u){return u.banAkses;}).map(function(u){return '<div style="padding:6px;cursor:pointer;font-size:11px;" onclick="selectActionUser(\''+u.id+'\')">'+esc(u.username)+' <span class="badge badge-yellow">BAN AKSES</span></div>';}).join('') + '</div></div>';
    }
    else if (action === 'force') {
        title.innerHTML = '<i class="fas fa-eject"></i> Force (Tangguhkan)';
        body.innerHTML = '<div class="input-box"><label>Cari User</label><input type="text" id="actionSearch" placeholder="Ketik username..." oninput="searchUserList(\'force\')"></div><div id="actionUserList" style="max-height:200px;overflow-y:auto;margin-bottom:12px;"></div><div id="actionSelectedUser" style="margin-bottom:12px;font-size:12px;"></div><div style="display:flex;gap:8px;"><button class="btn btn-danger" onclick="executeAction(\'force\')" style="flex:1;">🚫 Force</button><button class="btn btn-success" onclick="executeAction(\'unforce\')" style="flex:1;">✅ Unforce</button></div><hr><div style="margin-top:12px;"><b>📋 List Force (' + allUsers.filter(function(u){return u.forceLogout;}).length + ')</b><div style="max-height:150px;overflow-y:auto;margin-top:8px;">' + allUsers.filter(function(u){return u.forceLogout;}).map(function(u){return '<div style="padding:6px;cursor:pointer;font-size:11px;" onclick="selectActionUser(\''+u.id+'\')">'+esc(u.username)+' <span class="badge badge-orange">FORCE</span></div>';}).join('') + '</div></div>';
    }
    modal.classList.add('show');
    setTimeout(function() { searchUserList(action); }, 100);
}
function closeActionModal() { var m = document.getElementById('actionModal'); if (m) m.classList.remove('show'); selectedActionUser = null; }
function searchUserList(action) {
    var q = document.getElementById('actionSearch') ? document.getElementById('actionSearch').value : '';
    var list = document.getElementById('actionUserList');
    if (!list) return;
    var filtered = allUsers.filter(function(u) { return u.username.toLowerCase().includes(q.toLowerCase()); });
    if (!filtered.length) { list.innerHTML = '<div style="padding:8px;font-size:11px;">Tidak ada</div>'; return; }
    list.innerHTML = filtered.map(function(u) {
        var isSel = selectedActionUser && selectedActionUser.id === u.id;
        var badges = '';
        if (u.banned) badges += ' <span class="badge badge-red">BAN</span>';
        if (u.banAkses) badges += ' <span class="badge badge-yellow">AKSES</span>';
        if (u.forceLogout) badges += ' <span class="badge badge-orange">FORCE</span>';
        return '<div class="user-check-card' + (isSel ? ' selected' : '') + '" onclick="selectActionUser(\'' + u.id + '\')">' + esc(u.username) + ' · ' + esc(u.role) + badges + '</div>';
    }).join('');
}
function selectActionUser(id) {
    selectedActionUser = allUsers.find(function(u) { return u.id === id; });
    var el = document.getElementById('actionSelectedUser');
    if (el) el.innerHTML = selectedActionUser ? '✅ Dipilih: <b>' + esc(selectedActionUser.username) + '</b>' : '';
}
function executeAction(action) {
    if (!selectedActionUser) { showAlert('Error', 'Pilih user dulu!', 'error'); return; }
    var name = selectedActionUser.username;
    showConfirm('Yakin ' + action + ' "' + name + '"?', function() {
        debounce(action + selectedActionUser.id, function() { return doAction(action, selectedActionUser); });
    });
}
function doAction(action, target) {
    closeActionModal();
    showAlert('Proses', 'Memproses...', 'loading');
    var patchData = {};
    if (action === 'ban') { var dur = parseInt(document.getElementById('actionDuration').value); patchData = { banned: true, bannedUntil: dur === 0 ? 0 : Date.now() + dur }; }
    else if (action === 'unban') { patchData = { banned: false, bannedUntil: 0 }; }
    else if (action === 'banakses') { var dur2 = parseInt(document.getElementById('actionDuration').value); patchData = { banAkses: true, banAksesUntil: dur2 === 0 ? 0 : Date.now() + dur2 }; }
    else if (action === 'unbanakses') { patchData = { banAkses: false, banAksesUntil: 0 }; }
    else if (action === 'force') { patchData = { forceLogout: true }; }
    else if (action === 'unforce') { patchData = { forceLogout: false }; }

    apiCall('users/' + target.id, 'PATCH', patchData).then(function() {
        if (action === 'banakses' && target.ip) apiCall('block_ip_manual', 'POST', { ip: target.ip }).catch(function() {});
        if (action === 'banakses' && target.fingerprint) apiCall('block_fp_manual', 'POST', { fp: target.fingerprint }).catch(function() {});
        if (action === 'unbanakses' && target.ip) apiCall('blocked_ips/' + target.ip.replace(/\./g, '_'), 'DELETE').catch(function() {});
        if (action === 'unbanakses' && target.fingerprint) apiCall('blocked_fp/' + target.fingerprint, 'DELETE').catch(function() {});
        showAlert('Berhasil', 'Sukses!', 'success');
        loadUsers(); updateStats(); activityLoaded = false; loadActivity();
    }).catch(function(e) { showAlert('Error', e.message, 'error'); });
}

// ==================== NAVIGATION ====================
function navigateTo(tab) {
    document.getElementById('adminPanel').style.display = 'none';
    if (!document.getElementById('subPanel')) {
        var el = document.createElement('div');
        el.id = 'subPanel';
        el.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:#0f172a;z-index:50;overflow-y:auto;padding:20px';
        el.innerHTML = '<div style="max-width:600px;margin:0 auto"><button class="btn btn-sm btn-outline" onclick="closeSubPanel()" style="margin-bottom:14px;">⬅ Kembali</button><div id="subPanelContent"></div></div>';
        document.body.appendChild(el);
    }
    document.getElementById('subPanel').style.display = 'block';
    if (tab === 'users') renderUserList();
    else if (tab === 'bannedlist') renderBannedList();
    else if (tab === 'banakseslist') renderBanAksesList();
    else if (tab === 'suspicious') renderSuspiciousList();
}
function closeSubPanel() { document.getElementById('subPanel').style.display = 'none'; document.getElementById('adminPanel').style.display = 'block'; activityLoaded = false; loadActivity(); }

function renderUserList() {
    var h = '<div style="background:#fff;border-radius:14px;padding:20px;"><b>👥 Semua User (' + allUsers.length + ')</b><div style="margin-top:12px;">';
    allUsers.forEach(function(u) {
        var badges = '';
        if (u.banned) badges += '<span class="badge badge-red">BAN</span> ';
        if (u.banAkses) badges += '<span class="badge badge-yellow">AKSES</span> ';
        if (u.forceLogout) badges += '<span class="badge badge-orange">FORCE</span> ';
        h += '<div style="padding:10px;border-radius:8px;margin-bottom:6px;font-size:12px;cursor:pointer;background:#f8fafc;" onclick="openEditUserModal(\''+u.id+'\')"><b>'+esc(u.username)+'</b> · '+esc(u.role)+' · '+badges+'<br><span style="font-size:10px;color:#94a3b8;">IP: '+(u.ip||'-')+' | FP: '+(u.fingerprint?u.fingerprint.substring(0,12)+'...':'-')+'</span></div>';
    });
    h += '</div></div>';
    document.getElementById('subPanelContent').innerHTML = h;
}
function renderBannedList() {
    var banned = allUsers.filter(function(u) { return u.banned; });
    var h = '<div style="background:#fff;border-radius:14px;padding:20px;"><b>🚫 User Banned ('+banned.length+')</b>';
    banned.forEach(function(u) { h += '<div style="padding:8px;cursor:pointer;" onclick="openEditUserModal(\''+u.id+'\')">'+esc(u.username)+' · '+(u.bannedUntil===0?'PERMANEN':new Date(u.bannedUntil).toLocaleString('id-ID'))+'</div>'; });
    h += '</div>';
    document.getElementById('subPanelContent').innerHTML = h;
}
function renderBanAksesList() {
    var ba = allUsers.filter(function(u) { return u.banAkses; });
    var h = '<div style="background:#fff;border-radius:14px;padding:20px;"><b>🛡️ User Ban Akses ('+ba.length+')</b>';
    ba.forEach(function(u) { h += '<div style="padding:8px;cursor:pointer;" onclick="openEditUserModal(\''+u.id+'\')">'+esc(u.username)+' · '+(u.banAksesUntil===0?'PERMANEN':new Date(u.banAksesUntil).toLocaleString('id-ID'))+'</div>'; });
    h += '</div>';
    document.getElementById('subPanelContent').innerHTML = h;
}
function renderSuspiciousList() {
    var sp = allUsers.filter(function(u) { return u.forceLogout; });
    var h = '<div style="background:#fff;border-radius:14px;padding:20px;"><b>⚠️ User Force ('+sp.length+')</b>';
    sp.forEach(function(u) { h += '<div style="padding:8px;cursor:pointer;" onclick="openEditUserModal(\''+u.id+'\')">'+esc(u.username)+'<br><span style="font-size:10px;">IP: '+(u.ip||'-')+' | FP: '+(u.fingerprint?u.fingerprint.substring(0,12)+'...':'-')+'</span></div>'; });
    h += '</div>';
    document.getElementById('subPanelContent').innerHTML = h;
}

// ==================== CONFIRM ====================
function showConfirm(msg, cb) {
    var overlay = document.getElementById('confirmOverlay');
    var msgEl = document.getElementById('confirmMessage');
    if (!overlay) { if (confirm(msg)) cb(); return; }
    msgEl.innerHTML = msg;
    overlay.style.display = 'flex';
    document.getElementById('confirmYes').onclick = function() { overlay.style.display = 'none'; cb(); };
    document.getElementById('confirmNo').onclick = function() { overlay.style.display = 'none'; };
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async function() {
    document.getElementById('closeActionModalBtn').addEventListener('click', closeActionModal);
    document.getElementById('actionModal').addEventListener('click', function(e) { if (e.target === this) closeActionModal(); });
    document.getElementById('addUserModal').addEventListener('click', function(e) { if (e.target === this) closeAddUserModal(); });
    document.getElementById('editUserModal').addEventListener('click', function(e) { if (e.target === this) closeEditUserModal(); });
    document.getElementById('closeEditModalBtn').addEventListener('click', closeEditUserModal);
    document.getElementById('loginPassword').addEventListener('keypress', function(e) { if (e.key === 'Enter') login(); });
    document.getElementById('accessKey').addEventListener('keypress', function(e) { if (e.key === 'Enter') verifyKey(); });
    document.addEventListener('click', function() {
        if (currentAdmin && sessionTimer) { clearTimeout(sessionTimer); sessionTimer = setTimeout(function() { if (currentAdmin) { logout(); } }, 1800000); }
    });
    if (!fingerprint) fingerprint = await getFingerprint();
    try { var c = await apiCall('check_blocked', 'POST', { fingerprint: fingerprint }); if (c && c.blocked) { showBlockedScreen(); } } catch (e) {}
});