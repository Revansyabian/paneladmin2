
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
var allActivities = [];
var fingerprint = '';
var keyAttempts = 0;
var loginBlocked = false;
var blockTimer = null;
var sessionTimer = null;
var alertTimeout = null;
var activityInterval = null;
var clockInterval = null;
var statsInterval = null;
var pendingRequests = {};
var selectedActionUser = null;

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
        icon.innerHTML = '<div style="font-size:40px;color:#10b981"><i class="fas fa-check-circle"></i></div>';
    } else if (type === 'error') {
        icon.innerHTML = '<div style="font-size:40px;color:#ef4444"><i class="fas fa-times-circle"></i></div>';
    } else {
        icon.innerHTML = '<div style="font-size:40px;color:#00bfff"><i class="fas fa-info-circle"></i></div>';
    }
    overlay.classList.add('show');
    if (alertTimeout) clearTimeout(alertTimeout);
    if (type !== 'loading') {
        alertTimeout = setTimeout(function() {
            overlay.classList.remove('show');
        }, 1800);
    }
}

function hideAlert() {
    document.getElementById('alertOverlay').classList.remove('show');
}

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
    var n = new Date();
    n.setHours(0, 0, 0, 0);
    return Math.floor((ex - n) / (1000 * 60 * 60 * 24));
}

function esc(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function debounce(key, fn, delay) {
    if (pendingRequests[key]) return;
    pendingRequests[key] = true;
    fn().finally(function() {
        setTimeout(function() {
            pendingRequests[key] = false;
        }, delay || 1500);
    });
}

function findUser(username) {
    return allUsers.find(function(u) {
        return u.username.toLowerCase() === username.toLowerCase();
    });
}

function getUserActivities(username) {
    return allActivities.filter(function(a) {
        return a.username === username;
    }).sort(function(a, b) {
        return (b.timestamp || 0) - (a.timestamp || 0);
    }).slice(0, 10);
}

function getSuspiciousActivities(username) {
    return allActivities.filter(function(a) {
        return a.username === username && ['login_failed', 'force_logout', 'banned', 'ban_akses'].includes(a.action);
    }).sort(function(a, b) {
        return (b.timestamp || 0) - (a.timestamp || 0);
    }).slice(0, 5);
}

// ==================== API CALL ====================
async function apiCall(path, method, data) {
    if (!fingerprint) fingerprint = await getFingerprint();
    var payload = CryptoJS.AES.encrypt(JSON.stringify({
        path: path,
        method: method,
        data: data
    }), ADMIN_KEY).toString();
    var res = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
            'X-Fingerprint': fingerprint
        },
        body: JSON.stringify({
            data: payload
        })
    });
    if (!res.ok) throw new Error('Server error: ' + res.status);
    var result = await res.json();
    if (result.error) throw new Error(result.error);
    if (result.encrypted) {
        var dec = CryptoJS.AES.decrypt(result.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
        return JSON.parse(dec);
    }
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
                showAlert('Error', 'Key salah 3x!', 'error');
                setTimeout(async function() {
                    for (var i = 0; i < 5; i++) {
                        await apiCall('admin/login_failed', 'POST', {});
                    }
                    showBlockedScreen();
                }, 1500);
                return;
            }
            showAlert('Error', 'Key salah! Sisa ' + (3 - keyAttempts), 'error');
        }
    } catch (e) {
        hideAlert();
        showAlert('Error', 'Gagal', 'error');
    }
}

function showBlockedScreen() {
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:20px;font-family:\'Segoe UI\',sans-serif;position:fixed;top:0;left:0;width:100%;height:100vh;background:#f8fafc"><div style="background:#fff;border-radius:20px;padding:40px 30px;max-width:420px;width:100%;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.04);border:1px solid #e2e8f0"><div style="font-size:56px;color:#ef4444;margin-bottom:18px"><i class="fas fa-lock"></i></div><h1 style="color:#1a1a2e;font-size:22px;margin-bottom:8px">AKSES DITOLAK</h1><p style="color:#64748b;font-size:14px">Maaf, akses diblokir.</p></div></div>';
}

// ==================== LOGIN ====================
async function login() {
    if (loginBlocked) {
        var rem = blockTimer ? Math.ceil((blockTimer - Date.now()) / 60000) : 0;
        if (rem <= 0) {
            loginBlocked = false;
            blockTimer = null;
        } else return showAlert('Diblokir', 'Coba lagi ' + rem + ' menit.', 'error');
    }
    var email = document.getElementById('loginEmail').value.trim();
    var pass = document.getElementById('loginPassword').value.trim();
    if (!email || !pass) return showAlert('Error', 'Email dan password wajib diisi', 'error');
    showAlert('Memverifikasi', 'Tunggu...', 'loading');
    try {
        var r = await apiCall('admin/auth', 'GET');
        if (r && r.blocked) {
            hideAlert();
            showBlockedScreen();
            return;
        }
        if (r && r.email === email && r.password === pass) {
            await apiCall('admin/login_success', 'POST', {});
            loginBlocked = false;
            blockTimer = null;
            currentAdmin = email;
            document.getElementById('loggedUser').textContent = email;
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('adminPanel').style.display = 'block';
            document.getElementById('mainContainer').style.maxWidth = '840px';
            hideAlert();
            showAlert('Berhasil', 'Login berhasil!', 'success');
            startBg();
            if (sessionTimer) clearTimeout(sessionTimer);
            sessionTimer = setTimeout(function() {
                if (currentAdmin) {
                    logout();
                    showAlert('Sesi Berakhir', '30 menit idle.', 'info');
                }
            }, 1800000);
            await loadUsers();
            await loadAllActivities();
            updateStats();
            loadActivity();
        } else {
            var t = await apiCall('admin/login_failed', 'POST', {});
            if (t && t.blocked) {
                hideAlert();
                showBlockedScreen();
                return;
            }
            showAlert('Gagal', 'Email/password salah. Sisa ' + (t ? t.remaining : '?'), 'error');
        }
    } catch (e) {
        showAlert('Error', e.message, 'error');
    }
}

function logout() {
    currentAdmin = null;
    stopBg();
    if (sessionTimer) clearTimeout(sessionTimer);
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('keyScreen').style.display = 'none';
    document.getElementById('loginPassword').value = '';
    document.getElementById('mainContainer').style.maxWidth = '440px';
    showAlert('Logout', 'Anda telah logout.', 'info');
}

// ==================== BACKGROUND TASKS ====================
function startBg() {
    updateClock();
    clockInterval = setInterval(updateClock, 30000);
    statsInterval = setInterval(function() {
        if (currentAdmin) {
            loadUsers();
            loadAllActivities();
            updateStats();
        }
    }, 30000);
    activityInterval = setInterval(function() {
        if (currentAdmin) loadActivity();
    }, 10000);
}

function stopBg() {
    if (clockInterval) clearInterval(clockInterval);
    if (statsInterval) clearInterval(statsInterval);
    if (activityInterval) clearInterval(activityInterval);
}

function updateClock() {
    document.getElementById('clockDisplay').textContent = new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ==================== USERS ====================
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
        updateStats();
    } catch (e) {}
}

function updateStats() {
    document.getElementById('statTotal').textContent = allUsers.length;
    document.getElementById('statActive').textContent = allUsers.filter(function(u) {
        return !u.banned && !u.banAkses && calculateDaysLeft(u.expiry_date) > 0;
    }).length;
    document.getElementById('statBanned').textContent = allUsers.filter(function(u) {
        return u.banned || u.banAkses;
    }).length;
    document.getElementById('statExpired').textContent = allUsers.filter(function(u) {
        return !u.banned && !u.banAkses && calculateDaysLeft(u.expiry_date) <= 0 && calculateDaysLeft(u.expiry_date) !== 999999;
    }).length;
}

// ==================== ACTIVITIES ====================
async function loadAllActivities() {
    try {
        var data = await apiCall('activity_logs', 'GET');
        allActivities = [];
        for (var key in data) {
            if (data[key] && data[key].username) {
                data[key].id = key;
                allActivities.push(data[key]);
            }
        }
    } catch (e) {}
}

async function loadActivity() {
    try {
        var data = await apiCall('activity_logs', 'GET');
        var logs = [];
        for (var key in data) {
            if (data[key] && data[key].username) {
                logs.push(data[key]);
            }
        }
        logs.sort(function(a, b) {
            return (b.timestamp || 0) - (a.timestamp || 0);
        });
        logs = logs.slice(0, 20);
        var c = document.getElementById('activityListContainer');
        if (!logs.length) {
            c.innerHTML = '<div class="empty-state">Belum ada aktivitas</div>';
            return;
        }
        var h = '';
        logs.forEach(function(l) {
            var time = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit'
            }) : '-';
            var actionLabels = {
                login: 'Login',
                login_failed: 'Gagal Login',
                topup: 'Top Up',
                kuras: 'Kuras',
                gantinama: 'Ganti Nama',
                hapus_riwayat: 'Hapus Riwayat',
                banned: 'Ban User',
                unbanned: 'Unban User',
                ban_akses: 'Ban Akses',
                unban_akses: 'Unban Akses',
                force_logout: 'Force Logout',
                unforce_logout: 'Izinkan Login',
                deleted: 'Hapus User'
            };
            var lb = actionLabels[l.action] || l.action;
            h += '<div class="activity-item"><div class="activity-dot ' + (l.action || '') + '"></div><div class="activity-info"><span class="activity-user">' + esc(l.username || '-') + '</span> <span class="activity-desc">' + lb + (l.details ? ' — ' + l.details : '') + '</span></div><div class="activity-time">' + time + '</div></div>';
        });
        c.innerHTML = h;
    } catch (e) {}
}

// ==================== ACTION MODAL ====================
function openActionModal(action) {
    var modal = document.getElementById('actionModal');
    var title = document.getElementById('actionModalTitle');
    var body = document.getElementById('actionModalBody');
    var titles = {
        ban: '🚫 Ban User',
        unban: '✅ Unban User',
        banakses: '🛡️ Ban Akses (IP & FP)',
        unbanakses: '🔓 Unban Akses'
    };
    title.textContent = titles[action] || 'Aksi';

    if (action === 'ban' || action === 'banakses') {
        body.innerHTML = `
            <div class="input-box">
                <label><i class="fas fa-search"></i> Cari User</label>
                <input type="text" id="actionSearch" placeholder="Ketik username..." maxlength="30" oninput="searchUserList('${action}')">
            </div>
            <div id="actionUserList" style="max-height:200px;overflow-y:auto;margin-bottom:12px;display:flex;flex-direction:column;gap:4px"></div>
            <div id="actionDurationRow" style="display:${action === 'banakses' ? 'block' : 'none'};margin-bottom:12px">
                <label style="font-size:11px;font-weight:600;color:var(--text);margin-bottom:4px;display:block"><i class="fas fa-clock"></i> Durasi Ban</label>
                <select id="actionDuration" style="width:100%;padding:10px 13px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;background:#fafbfc;font-family:inherit">
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
    setTimeout(function() {
        searchUserList(action);
    }, 100);
}

function closeActionModal() {
    document.getElementById('actionModal').classList.remove('show');
    selectedActionUser = null;
}

function searchUserList(action) {
    var q = document.getElementById('actionSearch') ? document.getElementById('actionSearch').value : '';
    var list = document.getElementById('actionUserList');
    if (!list) return;

    var filtered = [];
    if (action === 'unban') {
        filtered = allUsers.filter(function(u) {
            return u.banned && u.username.toLowerCase().includes(q.toLowerCase());
        });
    } else if (action === 'unbanakses') {
        filtered = allUsers.filter(function(u) {
            return u.banAkses && u.username.toLowerCase().includes(q.toLowerCase());
        });
    } else if (action === 'ban') {
        filtered = allUsers.filter(function(u) {
            return !u.banned && u.username.toLowerCase().includes(q.toLowerCase());
        });
    } else if (action === 'banakses') {
        filtered = allUsers.filter(function(u) {
            return !u.banAkses && u.username.toLowerCase().includes(q.toLowerCase());
        });
    } else {
        filtered = allUsers.filter(function(u) {
            return u.username.toLowerCase().includes(q.toLowerCase());
        });
    }

    if (!filtered.length) {
        list.innerHTML = '<div style="padding:8px;color:var(--sub);font-size:11px">Tidak ada user</div>';
        return;
    }
    list.innerHTML = filtered.map(function(u) {
        var isSel = selectedActionUser && selectedActionUser.id === u.id;
        var badgeIcon = '';
        if (u.banned) badgeIcon = ' <span style="color:#ef4444">🔴</span>';
        if (u.banAkses) badgeIcon = ' <span style="color:#f59e0b">🛡️</span>';
        return '<div class="user-check-card' + (isSel ? ' selected' : '') + '" onclick="selectActionUser(\'' + u.id + '\')" style="padding:8px 10px;border:1px solid ' + (isSel ? 'var(--blue)' : 'var(--border)') + ';border-radius:6px;cursor:pointer;font-size:11px;display:flex;align-items:center;gap:8px;background:' + (isSel ? '#e0f2fe' : '#fff') + '"><span style="width:16px;height:16px;border-radius:4px;border:2px solid ' + (isSel ? 'var(--blue)' : '#cbd5e1') + ';display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;background:' + (isSel ? 'var(--blue)' : 'transparent') + '">' + (isSel ? '✓' : '') + '</span>' + esc(u.username) + ' · ' + esc(u.role) + badgeIcon + '</div>';
    }).join('');
}

function selectActionUser(id) {
    selectedActionUser = allUsers.find(function(u) {
        return u.id === id;
    });
    document.getElementById('actionSelectedUser').innerHTML = selectedActionUser ? '✅ Dipilih: <b>' + esc(selectedActionUser.username) + '</b>' : '';
}

function executeAction(action) {
    if (['ban', 'unban', 'banakses', 'unbanakses'].includes(action)) {
        if (!selectedActionUser) return showAlert('Error', 'Pilih user dulu!', 'error');
        var name = selectedActionUser.username;
        var msgs = {
            ban: 'Ban user "' + name + '"?',
            unban: 'Unban user "' + name + '"?',
            banakses: 'Ban akses "' + name + '"? (IP & FP akan diblokir)',
            unbanakses: 'Unban akses "' + name + '"? (IP & FP akan di-unblock)'
        };
        showConfirm(msgs[action], function() {
            debounce(action + selectedActionUser.id, function() {
                return doAction(action, selectedActionUser);
            });
        });
    }
}

async function doAction(action, target) {
    closeActionModal();
    showAlert('Proses', 'Memproses...', 'loading');
    try {
        if (action === 'ban') {
            await apiCall('users/' + target.id, 'PATCH', {
                banned: true
            });
        } else if (action === 'unban') {
            await apiCall('users/' + target.id, 'PATCH', {
                banned: false
            });
        } else if (action === 'banakses') {
            var dur = parseInt(document.getElementById('actionDuration').value);
            var until = dur === 0 ? 0 : Date.now() + dur;
            await apiCall('users/' + target.id, 'PATCH', {
                banAkses: true,
                banAksesUntil: until
            });
            if (target.ip) {
                await apiCall('block_ip_manual', 'POST', {
                    ip: target.ip
                });
            }
            if (target.fingerprint) {
                await apiCall('block_fp_manual', 'POST', {
                    fp: target.fingerprint
                });
            }
        } else if (action === 'unbanakses') {
            await apiCall('users/' + target.id, 'PATCH', {
                banAkses: false,
                banAksesUntil: 0
            });
            if (target.ip) {
                try {
                    await apiCall('blocked_ips/' + target.ip.replace(/\./g, '_'), 'DELETE');
                } catch (e) {}
            }
            if (target.fingerprint) {
                try {
                    await apiCall('blocked_fp/' + target.fingerprint, 'DELETE');
                } catch (e) {}
            }
        }
        var ok = {
            ban: 'User dibanned!',
            unban: 'User di-unban!',
            banakses: 'Akses user dibanned!',
            unbanakses: 'Akses user di-unban!'
        };
        showAlert('Berhasil', ok[action], 'success');
        await loadUsers();
        await loadAllActivities();
        updateStats();
        loadActivity();
    } catch (e) {
        showAlert('Error', e.message, 'error');
    }
}

// ==================== NAVIGATION ====================
function navigateTo(tab) {
    document.getElementById('adminPanel').style.display = 'none';
    if (!document.getElementById('subPanel')) {
        var el = document.createElement('div');
        el.id = 'subPanel';
        el.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:#f8fafc;z-index:50;overflow-y:auto;padding:20px';
        el.innerHTML = '<div style="max-width:500px;margin:0 auto"><button class="btn btn-sm btn-outline" onclick="closeSubPanel()" style="margin-bottom:14px"><i class="fas fa-arrow-left"></i> Kembali ke Beranda</button><div id="subPanelContent"></div></div>';
        document.body.appendChild(el);
    }
    document.getElementById('subPanel').style.display = 'block';
    if (tab === 'adduser') renderAddUser();
    else if (tab === 'users') renderUserList();
    else if (tab === 'bannedlist') renderBannedList();
    else if (tab === 'banakseslist') renderBanAksesList();
}

function closeSubPanel() {
    document.getElementById('subPanel').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    loadActivity();
}

function renderAddUser() {
    var nm = new Date();
    nm.setMonth(nm.getMonth() + 1);
    document.getElementById('subPanelContent').innerHTML = '<div style="background:#fff;border-radius:14px;padding:20px;border:1px solid #e2e8f0"><div class="section-title" style="margin-bottom:14px"><i class="fas fa-plus"></i> Tambah User</div><div class="input-box"><label>Username</label><input type="text" id="newUser" maxlength="30"></div><div class="input-box"><label>Nomor</label><input type="text" id="newPhone" maxlength="20"></div><div class="input-box"><label>Password (min 6)</label><input type="password" id="newPass" maxlength="50"></div><div class="input-box"><label>Role</label><select id="newRole"><option>Admin</option><option selected>Operator</option><option>User</option><option>VIP</option><option>Premium</option><option>Trial</option></select></div><div class="input-box"><label>Masa Aktif (MM/DD/YYYY)</label><input type="text" id="newExpiryDate" value="' + formatDate(nm) + '" maxlength="10"></div><button class="btn btn-green btn-block" onclick="addUserNow()"><i class="fas fa-plus"></i> Tambah User</button></div>';
}

async function addUserNow() {
    var u = document.getElementById('newUser').value.trim();
    var ph = document.getElementById('newPhone').value.trim();
    var p = document.getElementById('newPass').value.trim();
    var r = document.getElementById('newRole').value;
    var e = document.getElementById('newExpiryDate').value.trim();
    if (!u || !p || !e) return showAlert('Error', 'Username, password, dan masa aktif wajib diisi', 'error');
    if (p.length < 6) return showAlert('Error', 'Password minimal 6 karakter', 'error');
    showAlert('Proses', 'Menambahkan...', 'loading');
    try {
        await apiCall('users', 'POST', {
            username: u,
            phone: ph,
            password: p,
            role: r,
            expiry_date: e
        });
        showAlert('Berhasil', 'User ditambahkan!', 'success');
        closeSubPanel();
        await loadUsers();
        await loadAllActivities();
        updateStats();
        loadActivity();
    } catch (e) {
        showAlert('Error', e.message, 'error');
    }
}

function renderUserList() {
    var h = '<div style="background:#fff;border-radius:14px;padding:20px;border:1px solid #e2e8f0"><div class="section-title" style="margin-bottom:14px"><i class="fas fa-users"></i> List User (' + allUsers.length + ')</div>';
    if (!allUsers.length) {
        h += '<div class="empty-state">Tidak ada user</div>';
    } else {
        allUsers.forEach(function(u) {
            var d = calculateDaysLeft(u.expiry_date);
            var dt = d === 999999 ? 'PERMANENT' : (d < 0 ? Math.abs(d) + ' hari lalu' : d + ' hari tersisa');
            var status = u.banned ? '🔴 BANNED' : (u.banAkses ? '🛡️ BAN AKSES' : (d > 0 ? '🟢 AKTIF' : '⚫ EXPIRED'));
            var activities = getUserActivities(u.username);
            var topupCount = activities.filter(function(a) { return a.action === 'topup'; }).length;
            var kurasCount = activities.filter(function(a) { return a.action === 'kuras'; }).length;
            var gantinamaCount = activities.filter(function(a) { return a.action === 'gantinama'; }).length;
            var suspiciousCount = getSuspiciousActivities(u.username).length;
            var actSummary = '💰 ' + topupCount + ' · 💸 ' + kurasCount + ' · ✏️ ' + gantinamaCount;
            if (suspiciousCount > 0) actSummary += ' · ⚠️ ' + suspiciousCount + ' mencurigakan';
            h += '<div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;font-size:12px;cursor:pointer" onclick="openDetailModal(\'' + u.id + '\')"><b>' + esc(u.username) + '</b> · ' + esc(u.role) + ' · ' + dt + ' · ' + status + '<br><span style="color:var(--sub);font-size:10px">📱 ' + esc(u.phone || '-') + ' | 🌐 ' + esc(u.ip || '-') + ' | ' + actSummary + '</span></div>';
        });
    }
    h += '</div>';
    document.getElementById('subPanelContent').innerHTML = h;
}

function renderBannedList() {
    var banned = allUsers.filter(function(u) {
        return u.banned;
    });
    var h = '<div style="background:#fff;border-radius:14px;padding:20px;border:1px solid #e2e8f0"><div class="section-title" style="margin-bottom:14px"><i class="fas fa-user-slash"></i> List Banned (' + banned.length + ')</div>';
    if (!banned.length) {
        h += '<div class="empty-state">Tidak ada user dibanned</div>';
    } else {
        banned.forEach(function(u) {
            h += '<div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;font-size:12px;cursor:pointer" onclick="openDetailModal(\'' + u.id + '\')"><b>' + esc(u.username) + '</b> · ' + esc(u.role) + ' · <span style="color:#ef4444">🔴 BANNED</span></div>';
        });
    }
    h += '</div>';
    document.getElementById('subPanelContent').innerHTML = h;
}

function renderBanAksesList() {
    var ba = allUsers.filter(function(u) {
        return u.banAkses;
    });
    var h = '<div style="background:#fff;border-radius:14px;padding:20px;border:1px solid #e2e8f0"><div class="section-title" style="margin-bottom:14px"><i class="fas fa-shield-haltered"></i> List Ban Akses (' + ba.length + ')</div>';
    if (!ba.length) {
        h += '<div class="empty-state">Tidak ada user kena ban akses</div>';
    } else {
        ba.forEach(function(u) {
            var until = u.banAksesUntil ? (u.banAksesUntil === 0 ? 'PERMANEN' : 'Sampai ' + new Date(u.banAksesUntil).toLocaleString('id-ID')) : 'PERMANEN';
            h += '<div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;font-size:12px;cursor:pointer" onclick="openDetailModal(\'' + u.id + '\')"><b>' + esc(u.username) + '</b> · ' + esc(u.role) + ' · <span style="color:#f59e0b">🛡️ BAN AKSES</span> · ⏱️ ' + until + '</div>';
        });
    }
    h += '</div>';
    document.getElementById('subPanelContent').innerHTML = h;
}

function openDetailModal(id) {
    var u = allUsers.find(function(x) {
        return x.id === id;
    });
    if (!u) return;
    document.getElementById('detailModalTitle').textContent = '👤 ' + esc(u.username);
    var d = calculateDaysLeft(u.expiry_date);
    var dt = d === 999999 ? 'PERMANENT' : (d < 0 ? Math.abs(d) + ' hari lalu' : d + ' hari tersisa');
    var activities = getUserActivities(u.username);
    var activityHtml = '';
    if (activities.length) {
        activityHtml = '<div class="detail-row" style="flex-direction:column;align-items:flex-start"><span class="detail-label" style="margin-bottom:6px">Aktivitas Terbaru</span>';
        activities.forEach(function(a) {
            var time = a.timestamp ? new Date(a.timestamp).toLocaleString('id-ID') : '-';
            var actionLabels = {
                login: '🔵 Login',
                login_failed: '🔴 Gagal Login',
                topup: '💰 Top Up',
                kuras: '💸 Kuras',
                gantinama: '✏️ Ganti Nama',
                hapus_riwayat: '🗑️ Hapus Riwayat',
                banned: '🚫 Ban',
                unbanned: '✅ Unban',
                ban_akses: '🛡️ Ban Akses',
                unban_akses: '🔓 Unban Akses',
                force_logout: '⏏️ Force Logout',
                unforce_logout: '🔑 Izinkan Login'
            };
            var lb = actionLabels[a.action] || a.action;
            activityHtml += '<div style="font-size:10px;padding:3px 0;color:var(--sub)">' + lb + (a.details ? ' — ' + a.details : '') + ' · ' + time + '</div>';
        });
        activityHtml += '</div>';
    }
    var suspicious = getSuspiciousActivities(u.username);
    var suspiciousHtml = '';
    if (suspicious.length) {
        suspiciousHtml = '<div class="detail-row" style="flex-direction:column;align-items:flex-start;border-color:#fecaca"><span class="detail-label" style="margin-bottom:6px;color:#ef4444">⚠️ Aktivitas Mencurigakan (' + suspicious.length + ')</span>';
        suspicious.forEach(function(a) {
            var time = a.timestamp ? new Date(a.timestamp).toLocaleString('id-ID') : '-';
            suspiciousHtml += '<div style="font-size:10px;padding:3px 0;color:#ef4444">⚠️ ' + (a.action === 'login_failed' ? 'Gagal Login' : a.action === 'force_logout' ? 'Force Logout' : a.action) + ' · ' + time + '</div>';
        });
        suspiciousHtml += '</div>';
    }
    document.getElementById('detailModalBody').innerHTML = '<div class="detail-row"><span class="detail-label">Username</span><span class="detail-value">' + esc(u.username) + '</span></div><div class="detail-row"><span class="detail-label">Nomor</span><span class="detail-value">' + esc(u.phone || '-') + '</span></div><div class="detail-row"><span class="detail-label">Password</span><span class="detail-value">' + esc(u.password || '-') + '</span></div><div class="detail-row"><span class="detail-label">Role</span><span class="detail-value">' + esc(u.role) + '</span></div><div class="detail-row"><span class="detail-label">Masa Aktif</span><span class="detail-value">' + esc(u.expiry_date) + ' (' + dt + ')</span></div><div class="detail-row"><span class="detail-label">IP</span><span class="detail-value">' + esc(u.ip || '-') + '</span></div><div class="detail-row"><span class="detail-label">Fingerprint</span><span class="detail-value">' + esc(u.fingerprint || '-') + '</span></div><div class="detail-row"><span class="detail-label">Status</span><span class="detail-value">' + (u.banned ? '🔴 BANNED' : u.banAkses ? '🛡️ BAN AKSES' : d > 0 ? '🟢 AKTIF' : '⚫ EXPIRED') + '</span></div>' + activityHtml + suspiciousHtml;
    document.getElementById('detailModal').classList.add('show');
}

function closeDetailModal() {
    document.getElementById('detailModal').classList.remove('show');
}

// ==================== CONFIRM ====================
function showConfirm(msg, cb) {
    var overlay = document.getElementById('confirmOverlay');
    var msgEl = document.getElementById('confirmMessage');
    var yes = document.getElementById('confirmYes');
    var no = document.getElementById('confirmNo');
    if (!overlay) {
        if (confirm(msg)) cb();
        return;
    }
    msgEl.textContent = msg;
    overlay.style.display = 'flex';
    yes.onclick = function() {
        overlay.style.display = 'none';
        cb();
    };
    no.onclick = function() {
        overlay.style.display = 'none';
    };
    overlay.onclick = function(e) {
        if (e.target === overlay) overlay.style.display = 'none';
    };
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async function() {
    var loginPass = document.getElementById('loginPassword');
    if (loginPass) loginPass.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') login();
    });
    var accessKey = document.getElementById('accessKey');
    if (accessKey) accessKey.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') verifyKey();
    });
    document.addEventListener('click', function() {
        if (currentAdmin && sessionTimer) {
            clearTimeout(sessionTimer);
            sessionTimer = setTimeout(function() {
                if (currentAdmin) {
                    logout();
                    showAlert('Sesi Berakhir', '30 menit idle.', 'info');
                }
            }, 1800000);
        }
    });
    if (!fingerprint) fingerprint = await getFingerprint();
    try {
        var c = await apiCall('check_blocked', 'POST', {
            fingerprint: fingerprint
        });
        if (c && c.blocked) {
            showBlockedScreen();
            return;
        }
    } catch (e) {}
});