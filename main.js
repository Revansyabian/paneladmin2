// ==================== ANTI DEVTOOLS ====================
document.addEventListener('keydown', function(e) { if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I') || (e.ctrlKey && e.key === 'U')) { e.preventDefault(); return false; } });
document.addEventListener('contextmenu', function(e) { e.preventDefault(); return false; });
var devtoolsOpen = false;
setInterval(function() { if (window.outerWidth - window.innerWidth > 160 || window.outerHeight - window.innerHeight > 160) { if (!devtoolsOpen) { devtoolsOpen = true; document.body.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;background:#1a1a2e;color:#fff;font-size:18px;font-family:sans-serif">DevTools terdeteksi! Tutup untuk melanjutkan.</div>'; } } else { devtoolsOpen = false; } }, 1000);

var API_URL = '/api/revanstore', ADMIN_KEY = 'dhagwxwhu:f4afc5aa03e73130f5e055dfe6a708c4dc40759b', API_KEY = '835a198a-7843-4e13-a085-331eb891100e';
var currentAdmin = null, allUsers = [], allBlockedIPs = [], fingerprint = '';
var keyAttempts = 0, loginBlocked = false, blockTimer = null, sessionTimer = null, alertTimeout = null;
var activityInterval = null, clockInterval = null, statsInterval = null, pendingRequests = {};

async function getFingerprint() { var fp = ''; fp += navigator.userAgent || ''; fp += navigator.language || ''; fp += (screen.width || 0) + 'x' + (screen.height || 0); fp += screen.colorDepth || ''; fp += new Date().getTimezoneOffset(); fp += navigator.hardwareConcurrency || ''; fp += navigator.deviceMemory || ''; fp += navigator.platform || ''; return CryptoJS.MD5(fp).toString(); }
function showAlert(t, m, type) { var overlay = document.getElementById('alertOverlay'), icon = document.getElementById('alertIcon'), title = document.getElementById('alertTitle'), msg = document.getElementById('alertMessage'); if (!overlay) return; title.textContent = t; msg.textContent = m; icon.innerHTML = ''; if (type === 'loading') icon.innerHTML = '<div class="spinner"></div>'; else if (type === 'success') icon.innerHTML = '<div style="font-size:40px;color:#10b981"><i class="fas fa-check-circle"></i></div>'; else if (type === 'error') icon.innerHTML = '<div style="font-size:40px;color:#ef4444"><i class="fas fa-times-circle"></i></div>'; else icon.innerHTML = '<div style="font-size:40px;color:#00bfff"><i class="fas fa-info-circle"></i></div>'; overlay.classList.add('show'); if (alertTimeout) clearTimeout(alertTimeout); if (type !== 'loading') alertTimeout = setTimeout(function() { overlay.classList.remove('show'); }, 1800); }
function hideAlert() { document.getElementById('alertOverlay').classList.remove('show'); }
function formatDate(d) { return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') + '/' + d.getFullYear(); }
function calculateDaysLeft(e) { if (!e) return -9999; var p = e.split('/'); if (p.length !== 3) return -9999; var ex = new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1])); if (ex.getFullYear() === 9999) return 999999; var n = new Date(); n.setHours(0, 0, 0, 0); return Math.floor((ex - n) / (1000 * 60 * 60 * 24)); }
function esc(s) { if (!s) return ''; return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function debounce(key, fn, delay) { if (pendingRequests[key]) return; pendingRequests[key] = true; fn().finally(function() { setTimeout(function() { pendingRequests[key] = false; }, delay || 1500); }); }
function findUser(username) { return allUsers.find(function(u) { return u.username.toLowerCase() === username.toLowerCase(); }); }

async function apiCall(path, method, data) {
    if (!fingerprint) fingerprint = await getFingerprint();
    var payload = CryptoJS.AES.encrypt(JSON.stringify({ path: path, method: method, data: data }), ADMIN_KEY).toString();
    var res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'X-Fingerprint': fingerprint }, body: JSON.stringify({ data: payload }) });
    if (!res.ok) throw new Error('Server error: ' + res.status);
    var result = await res.json(); if (result.error) throw new Error(result.error);
    if (result.encrypted) { var dec = CryptoJS.AES.decrypt(result.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8); return JSON.parse(dec); }
    return result;
}

async function verifyKey() {
    var key = document.getElementById('accessKey').value.trim(); if (!key) return showAlert('Error', 'Key wajib diisi', 'error');
    showAlert('Verifikasi', 'Memeriksa key...', 'loading');
    try { var r = await apiCall('access_key', 'GET'); if (r && r.key === key) { keyAttempts = 0; document.getElementById('keyScreen').style.display = 'none'; document.getElementById('loginScreen').style.display = 'block'; document.getElementById('accessKey').value = ''; hideAlert(); showAlert('Berhasil', 'Key valid!', 'success'); } else { keyAttempts++; document.getElementById('accessKey').value = ''; hideAlert(); if (keyAttempts >= 3) { showAlert('Error', 'Key salah 3x!', 'error'); setTimeout(async function() { for (var i = 0; i < 5; i++) { await apiCall('admin/login_failed', 'POST', {}); } showBlockedScreen(); }, 1500); return; } showAlert('Error', 'Key salah! Sisa ' + (3 - keyAttempts), 'error'); } } catch (e) { hideAlert(); showAlert('Error', 'Gagal', 'error'); }
}
function showBlockedScreen() { document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:20px;font-family:\'Segoe UI\',sans-serif;position:fixed;top:0;left:0;width:100%;height:100vh;background:#f8fafc"><div style="background:#fff;border-radius:20px;padding:40px 30px;max-width:420px;width:100%;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.04);border:1px solid #e2e8f0"><div style="font-size:56px;color:#ef4444;margin-bottom:18px"><i class="fas fa-lock"></i></div><h1 style="color:#1a1a2e;font-size:22px;margin-bottom:8px">AKSES DITOLAK</h1><p style="color:#64748b;font-size:14px">Maaf, akses diblokir.</p></div></div>'; }

async function login() {
    if (loginBlocked) { var rem = blockTimer ? Math.ceil((blockTimer - Date.now()) / 60000) : 0; if (rem <= 0) { loginBlocked = false; blockTimer = null; } else return showAlert('Diblokir', 'Coba lagi ' + rem + ' menit.', 'error'); }
    var email = document.getElementById('loginEmail').value.trim(), pass = document.getElementById('loginPassword').value.trim();
    if (!email || !pass) return showAlert('Error', 'Email dan password wajib diisi', 'error');
    showAlert('Memverifikasi', 'Tunggu...', 'loading');
    try { var r = await apiCall('admin/auth', 'GET'); if (r && r.blocked) { hideAlert(); showBlockedScreen(); return; } if (r && r.email === email && r.password === pass) { await apiCall('admin/login_success', 'POST', {}); loginBlocked = false; blockTimer = null; currentAdmin = email; document.getElementById('loggedUser').textContent = email; document.getElementById('loginScreen').style.display = 'none'; document.getElementById('adminPanel').style.display = 'block'; document.getElementById('mainContainer').style.maxWidth = '800px'; hideAlert(); showAlert('Berhasil', 'Login berhasil!', 'success'); startBg(); if (sessionTimer) clearTimeout(sessionTimer); sessionTimer = setTimeout(function() { if (currentAdmin) { logout(); showAlert('Sesi Berakhir', '30 menit idle.', 'info'); } }, 1800000); await loadUsers(); updateStats(); loadActivity(); } else { var t = await apiCall('admin/login_failed', 'POST', {}); if (t && t.blocked) { hideAlert(); showBlockedScreen(); return; } showAlert('Gagal', 'Email/password salah. Sisa ' + (t ? t.remaining : '?'), 'error'); } } catch (e) { showAlert('Error', e.message, 'error'); }
}
function logout() { currentAdmin = null; stopBg(); if (sessionTimer) clearTimeout(sessionTimer); document.getElementById('adminPanel').style.display = 'none'; document.getElementById('loginScreen').style.display = 'block'; document.getElementById('keyScreen').style.display = 'none'; document.getElementById('loginPassword').value = ''; document.getElementById('mainContainer').style.maxWidth = '440px'; showAlert('Logout', 'Anda telah logout.', 'info'); }

function startBg() { updateClock(); clockInterval = setInterval(updateClock, 30000); statsInterval = setInterval(function() { if (currentAdmin) { loadUsers(); updateStats(); } }, 30000); activityInterval = setInterval(function() { if (currentAdmin) loadActivity(); }, 10000); }
function stopBg() { if (clockInterval) clearInterval(clockInterval); if (statsInterval) clearInterval(statsInterval); if (activityInterval) clearInterval(activityInterval); }
function updateClock() { document.getElementById('clockDisplay').textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); }

async function loadUsers() { try { var data = await apiCall('users', 'GET'); allUsers = []; for (var key in data) { if (data[key] && data[key].username) { data[key].id = key; allUsers.push(data[key]); } } updateStats(); } catch (e) {} }
function updateStats() { document.getElementById('statTotal').textContent = allUsers.length; document.getElementById('statActive').textContent = allUsers.filter(function(u) { return !u.banned && calculateDaysLeft(u.expiry_date) > 0; }).length; document.getElementById('statBanned').textContent = allUsers.filter(function(u) { return u.banned; }).length; document.getElementById('statExpired').textContent = allUsers.filter(function(u) { return !u.banned && calculateDaysLeft(u.expiry_date) <= 0 && calculateDaysLeft(u.expiry_date) !== 999999; }).length; }

async function loadActivity() { try { var data = await apiCall('activity_logs', 'GET'); var logs = []; for (var key in data) { if (data[key] && data[key].username) { logs.push(data[key]); } } logs.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); }); logs = logs.slice(0, 20); var c = document.getElementById('activityListContainer'); if (!logs.length) { c.innerHTML = '<div class="empty-state">Belum ada aktivitas</div>'; return; } var h = ''; logs.forEach(function(l) { var time = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'; var lb = { login: 'Login', topup: 'Top Up', kuras: 'Kuras', banned: 'Ban', unbanned: 'Unban', force_logout: 'Force Logout', unforce_logout: 'Izinkan Login', deleted: 'Hapus' }[l.action] || l.action; h += '<div class="activity-item"><div class="activity-dot ' + (l.action || '') + '"></div><div class="activity-info"><span class="activity-user">' + esc(l.username) + '</span> <span class="activity-desc">' + lb + (l.details ? ' — ' + l.details : '') + '</span></div><div class="activity-time">' + time + '</div></div>'; }); c.innerHTML = h; } catch (e) {} }

function openActionModal(action) { var modal = document.getElementById('actionModal'), title = document.getElementById('actionModalTitle'), body = document.getElementById('actionModalBody'); var titles = { ban: '🚫 Ban User', unban: '✅ Unban User', force: '⏏️ Force Logout', unforce: '🔓 Izinkan Login' }; title.textContent = titles[action] || 'Aksi'; body.innerHTML = '<div class="input-box"><label>Username</label><input type="text" id="actionUsername" placeholder="Ketik username..." maxlength="30"></div><div id="actionUserPreview" style="margin-bottom:12px"></div><button class="btn btn-primary btn-block" onclick="executeAction(\'' + action + '\')">' + (titles[action] || 'OK') + '</button>'; modal.classList.add('show'); setTimeout(function() { var inp = document.getElementById('actionUsername'); if (inp) { inp.focus(); inp.addEventListener('input', function() { previewActionUser(action); }); } }, 200); }
function closeActionModal() { document.getElementById('actionModal').classList.remove('show'); }
function previewActionUser(action) { var name = document.getElementById('actionUsername').value.trim(), prev = document.getElementById('actionUserPreview'); if (!name) { prev.innerHTML = ''; return; } var u = findUser(name); if (!u) { prev.innerHTML = '<div style="padding:10px;background:#fef2f2;border-radius:8px;color:#991b1b;font-size:12px">❌ User tidak ditemukan</div>'; return; } var d = calculateDaysLeft(u.expiry_date), dt = d === 999999 ? 'PERMANENT' : (d < 0 ? Math.abs(d) + ' hari lalu' : d + ' hari tersisa'); prev.innerHTML = '<div style="padding:10px;background:#f0fdf4;border-radius:8px;font-size:12px"><b>✅ ' + esc(u.username) + '</b><br>📱 ' + esc(u.phone || '-') + ' | 🎭 ' + esc(u.role) + ' | 📅 ' + esc(u.expiry_date) + ' (' + dt + ')<br>' + (u.banned ? '<span style="color:#ef4444">⚠️ Sedang dibanned</span>' : '') + (u.forceLogout ? '<span style="color:#f59e0b">⚠️ Sedang di-force logout</span>' : '') + '</div>'; }
function executeAction(action) { var name = document.getElementById('actionUsername').value.trim(); if (!name) return showAlert('Error', 'Masukkan username', 'error'); var u = findUser(name); if (!u) return showAlert('Error', 'User tidak ditemukan', 'error'); var msgs = { ban: 'Ban "' + name + '"?', unban: 'Unban "' + name + '"?', force: 'Force logout "' + name + '"?', unforce: 'Izinkan "' + name + '" login?' }; showConfirm(msgs[action], function() { debounce(action + u.id, function() { return doAction(action, u.id, name); }); }); }
async function doAction(action, id, name) { closeActionModal(); showAlert('Proses', 'Memproses...', 'loading'); var patches = { ban: { banned: true }, unban: { banned: false }, force: { forceLogout: true, logoutTimestamp: Date.now() }, unforce: { forceLogout: false } }; var ok = { ban: 'User dibanned!', unban: 'User di-unban!', force: 'User di-force logout!', unforce: 'User bisa login lagi!' }; try { await apiCall('users/' + id, 'PATCH', patches[action]); showAlert('Berhasil', ok[action], 'success'); await loadUsers(); updateStats(); loadActivity(); } catch (e) { showAlert('Error', 'Gagal.', 'error'); } }

function navigateTo(tab) {
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('subPanel') ? '' : createSubPanel();
    document.getElementById('subPanel').style.display = 'block';
    if (tab === 'adduser') renderAddUser();
    else if (tab === 'users') renderUserList();
    else if (tab === 'blocked') loadBlockedIPs();
}
function createSubPanel() {
    var el = document.createElement('div'); el.id = 'subPanel';
    el.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:#f8fafc;z-index:50;overflow-y:auto;padding:20px';
    el.innerHTML = '<div style="max-width:500px;margin:0 auto"><button class="btn btn-sm btn-outline" onclick="closeSubPanel()" style="margin-bottom:14px"><i class="fas fa-arrow-left"></i> Kembali ke Beranda</button><div id="subPanelContent"></div></div>';
    document.body.appendChild(el);
}
function closeSubPanel() { document.getElementById('subPanel').style.display = 'none'; document.getElementById('adminPanel').style.display = 'block'; loadActivity(); }

function renderAddUser() {
    var nm = new Date(); nm.setMonth(nm.getMonth() + 1);
    document.getElementById('subPanelContent').innerHTML = '<div style="background:#fff;border-radius:14px;padding:20px;border:1px solid #e2e8f0"><div class="section-title" style="margin-bottom:14px"><i class="fas fa-plus"></i> Tambah User</div><div class="input-box"><label>Username</label><input type="text" id="newUser" maxlength="30"></div><div class="input-box"><label>Nomor</label><input type="text" id="newPhone" maxlength="20"></div><div class="input-box"><label>Password (min 6)</label><input type="password" id="newPass" maxlength="50"></div><div class="input-box"><label>Role</label><select id="newRole"><option>Admin</option><option selected>Operator</option><option>User</option><option>VIP</option><option>Premium</option><option>Trial</option></select></div><div class="input-box"><label>Masa Aktif (MM/DD/YYYY)</label><input type="text" id="newExpiryDate" value="' + formatDate(nm) + '" maxlength="10"></div><button class="btn btn-green btn-block" onclick="addUserNow()"><i class="fas fa-plus"></i> Tambah User</button></div>';
}
async function addUserNow() {
    var u = document.getElementById('newUser').value.trim(), ph = document.getElementById('newPhone').value.trim(), p = document.getElementById('newPass').value.trim(), r = document.getElementById('newRole').value, e = document.getElementById('newExpiryDate').value.trim();
    if (!u || !p || !e) return showAlert('Error', 'Username, password, dan masa aktif wajib diisi', 'error');
    if (p.length < 6) return showAlert('Error', 'Password minimal 6 karakter', 'error');
    showAlert('Proses', 'Menambahkan...', 'loading');
    try { await apiCall('users', 'POST', { username: u, phone: ph, password: p, role: r, expiry_date: e }); showAlert('Berhasil', 'User ditambahkan!', 'success'); closeSubPanel(); await loadUsers(); updateStats(); loadActivity(); } catch (e) { showAlert('Error', e.message, 'error'); }
}

function renderUserList() {
    var users = allUsers.filter(function(u) { return !u.banned; });
    var h = '<div style="background:#fff;border-radius:14px;padding:20px;border:1px solid #e2e8f0"><div class="section-title" style="margin-bottom:14px"><i class="fas fa-users"></i> List User (' + users.length + ')</div>';
    if (!users.length) h += '<div class="empty-state">Tidak ada user</div>';
    else users.forEach(function(u) { var d = calculateDaysLeft(u.expiry_date), dt = d === 999999 ? 'PERMANENT' : (d < 0 ? Math.abs(d) + ' hari lalu' : d + ' hari tersisa'); h += '<div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;font-size:12px"><b>' + esc(u.username) + '</b> · ' + esc(u.role) + ' · ' + dt + '</div>'; });
    h += '</div>'; document.getElementById('subPanelContent').innerHTML = h;
}

async function loadBlockedIPs() {
    try { var data = await apiCall('blocked_ips', 'GET'); allBlockedIPs = []; for (var key in data) { if (data[key] && data[key].ip) { data[key].dbKey = key; allBlockedIPs.push(data[key]); } } var h = '<div style="background:#fff;border-radius:14px;padding:20px;border:1px solid #e2e8f0"><div class="section-title" style="margin-bottom:14px"><i class="fas fa-globe"></i> IP Diblokir (' + allBlockedIPs.length + ')</div>'; if (!allBlockedIPs.length) h += '<div class="empty-state">Tidak ada IP diblokir</div>'; else allBlockedIPs.forEach(function(item) { h += '<div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;font-size:12px;display:flex;justify-content:space-between;align-items:center"><span><b>' + esc(item.ip || 'Unknown') + '</b><br><span style="color:#64748b">' + (item.blocked_at ? new Date(item.blocked_at).toLocaleString('id-ID') : '-') + '</span></span><button class="btn-sm btn-green" onclick="unblockIP(\'' + item.dbKey + '\',\'' + esc(item.ip || 'Unknown') + '\')">Unblock</button></div>'; }); h += '</div>'; document.getElementById('subPanelContent').innerHTML = h; } catch (e) {}
}
async function unblockIP(dbKey, ip) { showConfirm('Unblock IP "' + ip + '"?', async function() { try { await apiCall('blocked_ips/' + dbKey, 'DELETE'); showAlert('Berhasil', 'IP di-unblock!', 'success'); loadBlockedIPs(); } catch (e) { showAlert('Error', 'Gagal.', 'error'); } }); }

function openEditModal() {
    var modal = document.getElementById('actionModal'), title = document.getElementById('actionModalTitle'), body = document.getElementById('actionModalBody');
    title.textContent = '✏️ Edit User';
    body.innerHTML = '<div class="input-box"><label>Username (cari dulu)</label><input type="text" id="editSearchUser" placeholder="Ketik username..." maxlength="30"></div><div id="editUserPreview" style="margin-bottom:12px"></div><div id="editUserForm" style="display:none"><input type="hidden" id="editUserId"><div class="input-box"><label>Username Baru</label><input type="text" id="editUsername" maxlength="30"></div><div class="input-box"><label>Nomor</label><input type="text" id="editPhone" maxlength="20"></div><div class="input-box"><label>Password (kosongkan jika tidak diubah)</label><input type="password" id="editPassword" maxlength="50"></div><div class="input-box"><label>Role</label><select id="editRole"><option>Admin</option><option selected>Operator</option><option>User</option><option>VIP</option><option>Premium</option><option>Trial</option></select></div><div class="input-box"><label>Masa Aktif (MM/DD/YYYY)</label><input type="text" id="editExpiryDate" maxlength="10"></div><button class="btn btn-green btn-block" onclick="saveEditUser()">Simpan</button></div>';
    modal.classList.add('show');
    setTimeout(function() { var inp = document.getElementById('editSearchUser'); if (inp) { inp.focus(); inp.addEventListener('input', previewEditUser); } }, 200);
}
function previewEditUser() { var name = document.getElementById('editSearchUser').value.trim(), prev = document.getElementById('editUserPreview'), form = document.getElementById('editUserForm'); if (!name) { prev.innerHTML = ''; form.style.display = 'none'; return; } var u = findUser(name); if (!u) { prev.innerHTML = '<div style="padding:10px;background:#fef2f2;border-radius:8px;color:#991b1b;font-size:12px">❌ User tidak ditemukan</div>'; form.style.display = 'none'; return; } prev.innerHTML = '<div style="padding:10px;background:#f0fdf4;border-radius:8px;font-size:12px"><b>✅ ' + esc(u.username) + '</b> siap diedit</div>'; form.style.display = 'block'; document.getElementById('editUserId').value = u.id; document.getElementById('editUsername').value = u.username; document.getElementById('editPhone').value = u.phone || ''; document.getElementById('editPassword').value = ''; document.getElementById('editRole').value = u.role; document.getElementById('editExpiryDate').value = u.expiry_date; }
async function saveEditUser() { var id = document.getElementById('editUserId').value, u = document.getElementById('editUsername').value.trim(), ph = document.getElementById('editPhone').value.trim(), p = document.getElementById('editPassword').value.trim(), r = document.getElementById('editRole').value, e = document.getElementById('editExpiryDate').value.trim(); if (!id || !u || !e) return showAlert('Error', 'Username dan masa aktif wajib diisi', 'error'); var data = { username: u, phone: ph, role: r, expiry_date: e }; if (p) data.password = p; showAlert('Proses', 'Menyimpan...', 'loading'); try { await apiCall('users/' + id, 'PATCH', data); closeActionModal(); showAlert('Berhasil', 'User diperbarui!', 'success'); await loadUsers(); updateStats(); loadActivity(); } catch (e) { showAlert('Error', e.message, 'error'); } }

function showConfirm(msg, cb) { var overlay = document.getElementById('confirmOverlay'), msgEl = document.getElementById('confirmMessage'), yes = document.getElementById('confirmYes'), no = document.getElementById('confirmNo'); if (!overlay) { if (confirm(msg)) cb(); return; } msgEl.textContent = msg; overlay.style.display = 'flex'; yes.onclick = function() { overlay.style.display = 'none'; cb(); }; no.onclick = function() { overlay.style.display = 'none'; }; overlay.onclick = function(e) { if (e.target === overlay) overlay.style.display = 'none'; }; }

document.addEventListener('DOMContentLoaded', async function() {
    var loginPass = document.getElementById('loginPassword'); if (loginPass) loginPass.addEventListener('keypress', function(e) { if (e.key === 'Enter') login(); });
    var accessKey = document.getElementById('accessKey'); if (accessKey) accessKey.addEventListener('keypress', function(e) { if (e.key === 'Enter') verifyKey(); });
    document.addEventListener('click', function() { if (currentAdmin && sessionTimer) { clearTimeout(sessionTimer); sessionTimer = setTimeout(function() { if (currentAdmin) { logout(); showAlert('Sesi Berakhir', '30 menit idle.', 'info'); } }, 1800000); } });
    if (!fingerprint) fingerprint = await getFingerprint();
    try { var c = await apiCall('check_blocked', 'POST', { fingerprint: fingerprint }); if (c && c.blocked) { showBlockedScreen(); return; } } catch(e) {}
});