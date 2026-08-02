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
var allActivities = [];
var fingerprint = '';
var keyAttempts = 0;
var loginBlocked = false;
var blockTimer = null;
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

// ==================== ALERT POPUP ====================
function showAlert(title, message, type) {
    var overlay = document.getElementById('alertOverlay');
    var icon = document.getElementById('alertIcon');
    var titleEl = document.getElementById('alertTitle');
    var msgEl = document.getElementById('alertMessage');

    if (!overlay || !icon || !titleEl || !msgEl) {
        alert(title + ': ' + message);
        return;
    }

    titleEl.innerHTML = title;
    msgEl.innerHTML = message;
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

    if (type !== 'loading') {
        setTimeout(function() {
            overlay.classList.remove('show');
        }, 2000);
    }
}

function hideAlert() {
    var overlay = document.getElementById('alertOverlay');
    if (overlay) overlay.classList.remove('show');
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
        data: data || {}
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

    var result = await res.json();

    if (result.error) {
        throw new Error(result.error);
    }

    if (result.encrypted && result.data) {
        var dec = CryptoJS.AES.decrypt(result.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
        if (dec) {
            return JSON.parse(dec);
        }
    }

    return result;
}

// ==================== VERIFY KEY ====================
function verifyKey() {
    var key = document.getElementById('accessKey').value.trim();

    if (!key) {
        showAlert('<i class="fas fa-key"></i> Error', '<i class="fas fa-exclamation-triangle"></i> Key wajib diisi!', 'error');
        return;
    }

    showAlert('<i class="fas fa-spinner"></i> Verifikasi', '<i class="fas fa-spinner fa-spin"></i> Memeriksa key...', 'loading');

    apiCall('access_key', 'GET')
        .then(function(r) {
            if (r && r.key === key) {
                keyAttempts = 0;
                document.getElementById('keyScreen').style.display = 'none';
                document.getElementById('loginScreen').style.display = 'block';
                document.getElementById('accessKey').value = '';
                hideAlert();
                showAlert('<i class="fas fa-check-circle"></i> Berhasil', '<i class="fas fa-check-circle"></i> Key valid! Silakan login.', 'success');
            } else {
                keyAttempts++;
                document.getElementById('accessKey').value = '';
                hideAlert();

                if (keyAttempts >= 3) {
                    showAlert('<i class="fas fa-lock"></i> Diblokir', '<i class="fas fa-lock"></i> Key salah 3x! Akses diblokir permanen.', 'error');
                    setTimeout(function() {
                        for (var i = 0; i < 5; i++) {
                            apiCall('admin/login_failed', 'POST', {}).catch(function() {});
                        }
                        showBlockedScreen();
                    }, 1500);
                    return;
                }

                showAlert('<i class="fas fa-times-circle"></i> Error', '<i class="fas fa-times-circle"></i> Key salah! Sisa ' + (3 - keyAttempts) + ' kesempatan.', 'error');
            }
        })
        .catch(function(e) {
            hideAlert();
            showAlert('<i class="fas fa-exclamation-triangle"></i> Error', '<i class="fas fa-exclamation-triangle"></i> Gagal verifikasi: ' + e.message, 'error');
        });
}

function showBlockedScreen() {
    document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#fef2f2,#fee2e2,#fecaca);padding:20px;font-family:\'Segoe UI\',sans-serif;"><div style="background:#fff;border-radius:20px;padding:40px 30px;max-width:440px;width:100%;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.1);border:1px solid #fecaca;"><div style="font-size:70px;color:#ef4444;margin-bottom:20px;"><i class="fas fa-shield-haltered"></i></div><h1 style="color:#dc2626;font-size:24px;margin-bottom:10px;">AKSES DITOLAK</h1><p style="color:#64748b;font-size:14px;">Maaf, akses Anda telah diblokir permanen.</p></div></div>';
}

// ==================== LOGIN ====================
function login() {
    var email = document.getElementById('loginEmail').value.trim();
    var pass = document.getElementById('loginPassword').value.trim();

    if (!email) {
        showAlert('<i class="fas fa-envelope"></i> Error', '<i class="fas fa-exclamation-triangle"></i> Email wajib diisi!', 'error');
        return;
    }

    if (!pass) {
        showAlert('<i class="fas fa-lock"></i> Error', '<i class="fas fa-exclamation-triangle"></i> Password wajib diisi!', 'error');
        return;
    }

    showAlert('<i class="fas fa-spinner"></i> Memverifikasi', '<i class="fas fa-spinner fa-spin"></i> Mohon tunggu...', 'loading');

    apiCall('admin/auth', 'GET')
        .then(function(r) {
            if (r && r.blocked) {
                hideAlert();
                showBlockedScreen();
                return;
            }

            if (r && r.email === email && r.password === pass) {
                return apiCall('admin/login_success', 'POST', {}).then(function() {
                    loginBlocked = false;
                    blockTimer = null;
                    currentAdmin = email;
                    document.getElementById('loggedUser').textContent = email;
                    document.getElementById('loginScreen').style.display = 'none';
                    document.getElementById('adminPanel').style.display = 'block';
                    document.getElementById('mainContainer').style.maxWidth = '840px';
                    hideAlert();
                    showAlert('<i class="fas fa-check-circle"></i> Berhasil', '<i class="fas fa-check-circle"></i> Login berhasil!', 'success');
                    startBg();
                    loadUsers();
                    loadAllActivities();
                    updateStats();
                    loadActivity();

                    if (sessionTimer) clearTimeout(sessionTimer);
                    sessionTimer = setTimeout(function() {
                        if (currentAdmin) {
                            logout();
                            showAlert('<i class="fas fa-clock"></i> Sesi Berakhir', '<i class="fas fa-clock"></i> 30 menit idle.', 'info');
                        }
                    }, 1800000);
                });
            } else {
                return apiCall('admin/login_failed', 'POST', {}).then(function(t) {
                    hideAlert();
                    if (t && t.blocked) {
                        showBlockedScreen();
                        return;
                    }
                    showAlert('<i class="fas fa-times-circle"></i> Gagal', '<i class="fas fa-times-circle"></i> Email atau password salah!', 'error');
                });
            }
        })
        .catch(function(e) {
            hideAlert();
            showAlert('<i class="fas fa-exclamation-triangle"></i> Error', '<i class="fas fa-exclamation-triangle"></i> Gagal: ' + e.message, 'error');
        });
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
    showAlert('<i class="fas fa-sign-out-alt"></i> Logout', '<i class="fas fa-sign-out-alt"></i> Anda telah logout.', 'info');
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
    var el = document.getElementById('clockDisplay');
    if (el) {
        el.textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }
}

// ==================== USERS ====================
function loadUsers() {
    apiCall('users', 'GET')
        .then(function(data) {
            allUsers = [];
            for (var key in data) {
                if (data[key] && data[key].username) {
                    data[key].id = key;
                    allUsers.push(data[key]);
                }
            }
            updateStats();
        })
        .catch(function() {});
}

function updateStats() {
    var elTotal = document.getElementById('statTotal');
    var elActive = document.getElementById('statActive');
    var elBanned = document.getElementById('statBanned');
    var elExpired = document.getElementById('statExpired');

    if (elTotal) elTotal.textContent = allUsers.length;
    if (elActive) elActive.textContent = allUsers.filter(function(u) { return !u.banned && !u.banAkses && calculateDaysLeft(u.expiry_date) > 0; }).length;
    if (elBanned) elBanned.textContent = allUsers.filter(function(u) { return u.banned || u.banAkses; }).length;
    if (elExpired) elExpired.textContent = allUsers.filter(function(u) { return !u.banned && !u.banAkses && calculateDaysLeft(u.expiry_date) <= 0 && calculateDaysLeft(u.expiry_date) !== 999999; }).length;
}

// ==================== ACTIVITIES ====================
function loadAllActivities() {
    apiCall('activity_logs', 'GET')
        .then(function(data) {
            allActivities = [];
            for (var key in data) {
                if (data[key] && data[key].username) {
                    data[key].id = key;
                    allActivities.push(data[key]);
                }
            }
        })
        .catch(function() {});
}

function loadActivity() {
    apiCall('activity_logs', 'GET')
        .then(function(data) {
            var logs = [];
            for (var key in data) {
                if (data[key] && data[key].username) {
                    logs.push(data[key]);
                }
            }
            logs.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
            logs = logs.slice(0, 20);

            var c = document.getElementById('activityListContainer');
            if (!c) return;

            if (!logs.length) {
                c.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Belum ada aktivitas</div>';
                return;
            }

            var actionLabels = {
                login: '<i class="fas fa-sign-in-alt"></i> Login',
                login_failed: '<i class="fas fa-times-circle"></i> Gagal Login',
                topup: '<i class="fas fa-arrow-up"></i> Top Up',
                kuras: '<i class="fas fa-arrow-down"></i> Kuras',
                gantinama: '<i class="fas fa-edit"></i> Ganti Nama',
                banned: '<i class="fas fa-ban"></i> Ban User',
                unbanned: '<i class="fas fa-check"></i> Unban User',
                ban_akses: '<i class="fas fa-shield-haltered"></i> Ban Akses',
                unban_akses: '<i class="fas fa-shield-check"></i> Unban Akses',
                force_logout: '<i class="fas fa-eject"></i> Force Logout',
                unforce_logout: '<i class="fas fa-unlock-alt"></i> Izinkan Login',
                deleted: '<i class="fas fa-trash"></i> Hapus User'
            };

            var h = '';
            logs.forEach(function(l) {
                var time = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
                var lb = actionLabels[l.action] || l.action;
                h += '<div class="activity-item"><div class="activity-dot ' + (l.action || '') + '"></div><div class="activity-info"><span class="activity-user"><i class="fas fa-user"></i> ' + esc(l.username || '-') + '</span> <span class="activity-desc">' + lb + (l.details ? ' — ' + l.details : '') + '</span></div><div class="activity-time"><i class="fas fa-clock"></i> ' + time + '</div></div>';
            });
            c.innerHTML = h;
        })
        .catch(function() {});
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
        banakses: '<i class="fas fa-shield-haltered"></i> Ban Akses (IP & FP)',
        unbanakses: '<i class="fas fa-shield-check"></i> Unban Akses'
    };

    title.innerHTML = titles[action] || '<i class="fas fa-cog"></i> Aksi';

    // Build filtered list based on action
    var filteredUsers = [];
    if (action === 'ban') {
        filteredUsers = allUsers.filter(function(u) { return !u.banned; });
    } else if (action === 'unban') {
        filteredUsers = allUsers.filter(function(u) { return u.banned; });
    } else if (action === 'banakses') {
        filteredUsers = allUsers.filter(function(u) { return !u.banAkses; });
    } else if (action === 'unbanakses') {
        filteredUsers = allUsers.filter(function(u) { return u.banAkses; });
    }

    // Store for search
    modal._filteredUsers = filteredUsers;

    var html = '<div class="input-box"><label><i class="fas fa-search"></i> Cari User</label><input type="text" id="actionSearch" placeholder="Ketik username..." maxlength="30"></div>';
    html += '<div id="actionUserList" style="max-height:200px;overflow-y:auto;margin-bottom:12px;display:flex;flex-direction:column;gap:4px"></div>';

    if (action === 'banakses') {
        html += '<div id="actionDurationRow" style="margin-bottom:12px"><label style="font-size:11px;font-weight:600;color:var(--text);margin-bottom:4px;display:block"><i class="fas fa-clock"></i> Durasi Ban</label><select id="actionDuration" style="width:100%;padding:10px 13px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;background:#fafbfc;font-family:inherit"><option value="3600000"><i class="fas fa-clock"></i> 1 Jam</option><option value="7200000"><i class="fas fa-clock"></i> 2 Jam</option><option value="21600000"><i class="fas fa-clock"></i> 6 Jam</option><option value="43200000"><i class="fas fa-clock"></i> 12 Jam</option><option value="86400000"><i class="fas fa-clock"></i> 24 Jam</option><option value="0"><i class="fas fa-infinity"></i> Permanen</option></select></div>';
    }

    html += '<div id="actionSelectedUser" style="margin-bottom:12px;font-size:12px;color:var(--sub)"></div>';
    html += '<button class="btn btn-primary btn-block" id="executeActionBtn"><i class="fas fa-check"></i> ' + titles[action] + '</button>';

    body.innerHTML = html;
    modal.classList.add('show');

    // Event listeners
    var searchInput = document.getElementById('actionSearch');
    if (searchInput) {
        searchInput.addEventListener('input', function() { searchUserList(action); });
        setTimeout(function() { searchUserList(action); }, 100);
    }

    var execBtn = document.getElementById('executeActionBtn');
    if (execBtn) {
        execBtn.addEventListener('click', function() { executeAction(action); });
    }
}

function closeActionModal() {
    var modal = document.getElementById('actionModal');
    if (modal) modal.classList.remove('show');
    selectedActionUser = null;
}

function searchUserList(action) {
    var q = document.getElementById('actionSearch') ? document.getElementById('actionSearch').value : '';
    var list = document.getElementById('actionUserList');
    var modal = document.getElementById('actionModal');
    if (!list || !modal) return;

    var filtered = modal._filteredUsers || [];
    if (q) {
        filtered = filtered.filter(function(u) {
            return u.username.toLowerCase().includes(q.toLowerCase());
        });
    }

    if (!filtered.length) {
        list.innerHTML = '<div style="padding:8px;color:var(--sub);font-size:11px"><i class="fas fa-search"></i> Tidak ada user yang tersedia</div>';
        return;
    }

    list.innerHTML = filtered.map(function(u) {
        var isSel = selectedActionUser && selectedActionUser.id === u.id;
        var badgeIcon = '';
        if (u.banned) badgeIcon = ' <span style="color:#ef4444"><i class="fas fa-ban"></i></span>';
        if (u.banAkses) badgeIcon = ' <span style="color:#f59e0b"><i class="fas fa-shield-haltered"></i></span>';
        return '<div class="user-check-card' + (isSel ? ' selected' : '') + '" data-userid="' + u.id + '" style="padding:8px 10px;border:1px solid ' + (isSel ? 'var(--blue)' : 'var(--border)') + ';border-radius:6px;cursor:pointer;font-size:11px;display:flex;align-items:center;gap:8px;background:' + (isSel ? '#e0f2fe' : '#fff') + '"><span style="width:16px;height:16px;border-radius:4px;border:2px solid ' + (isSel ? 'var(--blue)' : '#cbd5e1') + ';display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;background:' + (isSel ? 'var(--blue)' : 'transparent') + '"><i class="fas fa-check"></i></span>' + esc(u.username) + ' · ' + esc(u.role) + badgeIcon + '</div>';
    }).join('');

    list.querySelectorAll('.user-check-card').forEach(function(el) {
        el.addEventListener('click', function() {
            var id = el.getAttribute('data-userid');
            selectActionUser(id);
        });
    });
}

function selectActionUser(id) {
    selectedActionUser = allUsers.find(function(u) { return u.id === id; });
    var el = document.getElementById('actionSelectedUser');
    if (el) el.innerHTML = selectedActionUser ? '<i class="fas fa-check-circle"></i> Dipilih: <b>' + esc(selectedActionUser.username) + '</b>' : '';
    // Refresh list to show selection
    var modal = document.getElementById('actionModal');
    var action = '';
    if (modal) {
        var title = document.getElementById('actionModalTitle');
        if (title) {
            if (title.innerHTML.includes('Ban User')) action = 'ban';
            else if (title.innerHTML.includes('Unban User')) action = 'unban';
            else if (title.innerHTML.includes('Ban Akses')) action = 'banakses';
            else if (title.innerHTML.includes('Unban Akses')) action = 'unbanakses';
        }
        if (action) searchUserList(action);
    }
}

function executeAction(action) {
    if (['ban', 'unban', 'banakses', 'unbanakses'].includes(action)) {
        if (!selectedActionUser) {
            showAlert('<i class="fas fa-hand-pointer"></i> Error', '<i class="fas fa-exclamation-triangle"></i> Pilih user dulu!', 'error');
            return;
        }
        var name = selectedActionUser.username;
        var msgs = {
            ban: '<i class="fas fa-user-slash"></i> Ban user "' + name + '"?',
            unban: '<i class="fas fa-user-check"></i> Unban user "' + name + '"?',
            banakses: '<i class="fas fa-shield-haltered"></i> Ban akses "' + name + '"? (IP & FP akan diblokir)',
            unbanakses: '<i class="fas fa-shield-check"></i> Unban akses "' + name + '"? (IP & FP akan di-unblock)'
        };
        showConfirm(msgs[action], function() {
            debounce(action + selectedActionUser.id, function() {
                return doAction(action, selectedActionUser);
            });
        });
    }
}

function doAction(action, target) {
    closeActionModal();
    showAlert('<i class="fas fa-spinner"></i> Proses', '<i class="fas fa-spinner fa-spin"></i> Memproses...', 'loading');

    var patchData = {};
    if (action === 'ban') patchData = { banned: true };
    else if (action === 'unban') patchData = { banned: false };
    else if (action === 'banakses') {
        var dur = parseInt(document.getElementById('actionDuration').value);
        patchData = { banAkses: true, banAksesUntil: dur === 0 ? 0 : Date.now() + dur };
    } else if (action === 'unbanakses') {
        patchData = { banAkses: false, banAksesUntil: 0 };
    }

    apiCall('users/' + target.id, 'PATCH', patchData)
        .then(function() {
            if (action === 'banakses' && target.ip) {
                apiCall('block_ip_manual', 'POST', { ip: target.ip }).catch(function() {});
            }
            if (action === 'banakses' && target.fingerprint) {
                apiCall('block_fp_manual', 'POST', { fp: target.fingerprint }).catch(function() {});
            }
            if (action === 'unbanakses' && target.ip) {
                apiCall('blocked_ips/' + target.ip.replace(/\./g, '_'), 'DELETE').catch(function() {});
            }
            if (action === 'unbanakses' && target.fingerprint) {
                apiCall('blocked_fp/' + target.fingerprint, 'DELETE').catch(function() {});
            }

            var ok = {
                ban: '<i class="fas fa-ban"></i> User dibanned!',
                unban: '<i class="fas fa-check"></i> User di-unban!',
                banakses: '<i class="fas fa-shield-haltered"></i> Akses user dibanned!',
                unbanakses: '<i class="fas fa-shield-check"></i> Akses user di-unban!'
            };
            showAlert('<i class="fas fa-check-circle"></i> Berhasil', ok[action], 'success');
            loadUsers();
            loadAllActivities();
            updateStats();
            loadActivity();
        })
        .catch(function(e) {
            showAlert('<i class="fas fa-exclamation-triangle"></i> Error', '<i class="fas fa-exclamation-triangle"></i> ' + e.message, 'error');
        });
}

// ==================== NAVIGATION ====================
function navigateTo(tab) {
    document.getElementById('adminPanel').style.display = 'none';
    if (!document.getElementById('subPanel')) {
        var el = document.createElement('div');
        el.id = 'subPanel';
        el.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:#f8fafc;z-index:50;overflow-y:auto;padding:20px';
        el.innerHTML = '<div style="max-width:500px;margin:0 auto"><button class="btn btn-sm btn-outline" id="backToHomeBtn" style="margin-bottom:14px"><i class="fas fa-arrow-left"></i> Kembali ke Beranda</button><div id="subPanelContent"></div></div>';
        document.body.appendChild(el);
        document.getElementById('backToHomeBtn').addEventListener('click', closeSubPanel);
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
    document.getElementById('subPanelContent').innerHTML = '<div style="background:#fff;border-radius:14px;padding:20px;border:1px solid #e2e8f0"><div class="section-title" style="margin-bottom:14px"><i class="fas fa-user-plus"></i> Tambah User</div><div class="input-box"><label><i class="fas fa-user"></i> Username</label><input type="text" id="newUser" maxlength="30"></div><div class="input-box"><label><i class="fas fa-phone"></i> Nomor</label><input type="text" id="newPhone" maxlength="20"></div><div class="input-box"><label><i class="fas fa-lock"></i> Password (min 6)</label><input type="password" id="newPass" maxlength="50"></div><div class="input-box"><label><i class="fas fa-user-tag"></i> Role</label><select id="newRole"><option>Admin</option><option selected>Operator</option><option>User</option><option>VIP</option><option>Premium</option><option>Trial</option></select></div><div class="input-box"><label><i class="fas fa-calendar-alt"></i> Masa Aktif (MM/DD/YYYY)</label><input type="text" id="newExpiryDate" value="' + formatDate(nm) + '" maxlength="10"></div><button class="btn btn-green btn-block" id="addUserBtn"><i class="fas fa-user-plus"></i> Tambah User</button></div>';
    document.getElementById('addUserBtn').addEventListener('click', addUserNow);
}

function addUserNow() {
    var u = document.getElementById('newUser').value.trim();
    var ph = document.getElementById('newPhone').value.trim();
    var p = document.getElementById('newPass').value.trim();
    var r = document.getElementById('newRole').value;
    var e = document.getElementById('newExpiryDate').value.trim();
    if (!u || !p || !e) { showAlert('<i class="fas fa-exclamation-triangle"></i> Error', '<i class="fas fa-exclamation-triangle"></i> Username, password, dan masa aktif wajib diisi', 'error'); return; }
    if (p.length < 6) { showAlert('<i class="fas fa-exclamation-triangle"></i> Error', '<i class="fas fa-exclamation-triangle"></i> Password minimal 6 karakter', 'error'); return; }
    showAlert('<i class="fas fa-spinner"></i> Proses', '<i class="fas fa-spinner fa-spin"></i> Menambahkan...', 'loading');
    apiCall('users', 'POST', { username: u, phone: ph, password: p, role: r, expiry_date: e })
        .then(function() {
            showAlert('<i class="fas fa-check-circle"></i> Berhasil', '<i class="fas fa-check-circle"></i> User ditambahkan!', 'success');
            closeSubPanel();
            loadUsers();
            loadAllActivities();
            updateStats();
            loadActivity();
        })
        .catch(function(e) { showAlert('<i class="fas fa-exclamation-triangle"></i> Error', '<i class="fas fa-exclamation-triangle"></i> ' + e.message, 'error'); });
}

function renderUserList() {
    var h = '<div style="background:#fff;border-radius:14px;padding:20px;border:1px solid #e2e8f0"><div class="section-title" style="margin-bottom:14px"><i class="fas fa-users"></i> List User (' + allUsers.length + ')</div>';
    if (!allUsers.length) {
        h += '<div class="empty-state"><i class="fas fa-users-slash"></i> Tidak ada user</div>';
    } else {
        allUsers.forEach(function(u) {
            var d = calculateDaysLeft(u.expiry_date);
            var dt = d === 999999 ? 'PERMANENT' : (d < 0 ? Math.abs(d) + ' hari lalu' : d + ' hari tersisa');
            var status = u.banned ? '<span style="color:#ef4444"><i class="fas fa-ban"></i> BANNED</span>' : (u.banAkses ? '<span style="color:#f59e0b"><i class="fas fa-shield-haltered"></i> BAN AKSES</span>' : (d > 0 ? '<span style="color:#10b981"><i class="fas fa-check-circle"></i> AKTIF</span>' : '<span style="color:#64748b"><i class="fas fa-clock"></i> EXPIRED</span>'));
            h += '<div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;font-size:12px;cursor:pointer" data-userid="' + u.id + '"><b><i class="fas fa-user"></i> ' + esc(u.username) + '</b> · <i class="fas fa-user-tag"></i> ' + esc(u.role) + ' · <i class="fas fa-calendar-alt"></i> ' + dt + ' · ' + status + '<br><span style="color:var(--sub);font-size:10px"><i class="fas fa-globe"></i> ' + esc(u.ip || '-') + ' | <i class="fas fa-fingerprint"></i> ' + esc((u.fingerprint || '-').substring(0,12)) + '...</span></div>';
        });
    }
    h += '</div>';
    var content = document.getElementById('subPanelContent');
    content.innerHTML = h;
    content.querySelectorAll('[data-userid]').forEach(function(el) {
        el.addEventListener('click', function() {
            var id = el.getAttribute('data-userid');
            openDetailModal(id);
        });
    });
}

function renderBannedList() {
    var banned = allUsers.filter(function(u) { return u.banned === true; });
    var h = '<div style="background:#fff;border-radius:14px;padding:20px;border:1px solid #e2e8f0"><div class="section-title" style="margin-bottom:14px"><i class="fas fa-user-slash"></i> List Banned (' + banned.length + ')</div>';
    if (!banned.length) {
        h += '<div class="empty-state"><i class="fas fa-check-circle"></i> Tidak ada user dibanned</div>';
    } else {
        banned.forEach(function(u) {
            h += '<div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;font-size:12px;cursor:pointer" data-userid="' + u.id + '"><b><i class="fas fa-user"></i> ' + esc(u.username) + '</b> · <i class="fas fa-user-tag"></i> ' + esc(u.role) + ' · <span style="color:#ef4444"><i class="fas fa-ban"></i> BANNED</span><br><span style="color:var(--sub);font-size:10px"><i class="fas fa-globe"></i> ' + esc(u.ip || '-') + ' | <i class="fas fa-fingerprint"></i> ' + esc((u.fingerprint || '-').substring(0,12)) + '...</span></div>';
        });
    }
    h += '</div>';
    var content = document.getElementById('subPanelContent');
    content.innerHTML = h;
    content.querySelectorAll('[data-userid]').forEach(function(el) {
        el.addEventListener('click', function() {
            var id = el.getAttribute('data-userid');
            openDetailModal(id);
        });
    });
}

function renderBanAksesList() {
    var ba = allUsers.filter(function(u) { return u.banAkses === true; });
    var h = '<div style="background:#fff;border-radius:14px;padding:20px;border:1px solid #e2e8f0"><div class="section-title" style="margin-bottom:14px"><i class="fas fa-shield-haltered"></i> List Ban Akses (' + ba.length + ')</div>';
    if (!ba.length) {
        h += '<div class="empty-state"><i class="fas fa-check-circle"></i> Tidak ada user kena ban akses</div>';
    } else {
        ba.forEach(function(u) {
            var until = u.banAksesUntil ? (u.banAksesUntil === 0 ? 'PERMANEN' : 'Sampai ' + new Date(u.banAksesUntil).toLocaleString('id-ID')) : 'PERMANEN';
            h += '<div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;font-size:12px;cursor:pointer" data-userid="' + u.id + '"><b><i class="fas fa-user"></i> ' + esc(u.username) + '</b> · <i class="fas fa-user-tag"></i> ' + esc(u.role) + ' · <span style="color:#f59e0b"><i class="fas fa-shield-haltered"></i> BAN AKSES</span> · <i class="fas fa-clock"></i> ' + until + '<br><span style="color:var(--sub);font-size:10px"><i class="fas fa-globe"></i> ' + esc(u.ip || '-') + ' | <i class="fas fa-fingerprint"></i> ' + esc((u.fingerprint || '-').substring(0,12)) + '...</span></div>';
        });
    }
    h += '</div>';
    var content = document.getElementById('subPanelContent');
    content.innerHTML = h;
    content.querySelectorAll('[data-userid]').forEach(function(el) {
        el.addEventListener('click', function() {
            var id = el.getAttribute('data-userid');
            openDetailModal(id);
        });
    });
}

function openDetailModal(id) {
    var u = allUsers.find(function(x) { return x.id === id; });
    if (!u) return;
    document.getElementById('detailModalTitle').innerHTML = '<i class="fas fa-user"></i> ' + esc(u.username);
    var d = calculateDaysLeft(u.expiry_date);
    var dt = d === 999999 ? 'PERMANENT' : (d < 0 ? Math.abs(d) + ' hari lalu' : d + ' hari tersisa');
    var statusHtml = u.banned ? '<span style="color:#ef4444"><i class="fas fa-ban"></i> BANNED</span>' : (u.banAkses ? '<span style="color:#f59e0b"><i class="fas fa-shield-haltered"></i> BAN AKSES</span>' : (d > 0 ? '<span style="color:#10b981"><i class="fas fa-check-circle"></i> AKTIF</span>' : '<span style="color:#64748b"><i class="fas fa-clock"></i> EXPIRED</span>'));

    var activityHtml = '';
    var userActivities = getUserActivities(u.username);
    if (userActivities.length) {
        activityHtml = '<div class="detail-row" style="flex-direction:column;align-items:stretch;padding:8px 0;"><span class="detail-label" style="margin-bottom:4px;"><i class="fas fa-history"></i> Aktivitas User</span>';
        userActivities.forEach(function(a) {
            var time = a.timestamp ? new Date(a.timestamp).toLocaleString('id-ID') : '-';
            var lb = {
                login: 'Login',
                login_failed: 'Gagal Login',
                topup: 'Top Up',
                kuras: 'Kuras',
                gantinama: 'Ganti Nama',
                banned: 'Dibanned',
                unbanned: 'Di-unban',
                ban_akses: 'Ban Akses',
                unban_akses: 'Unban Akses',
                force_logout: 'Force Logout',
                unforce_logout: 'Izinkan Login',
                deleted: 'Dihapus'
            }[a.action] || a.action;
            activityHtml += '<div style="font-size:11px;color:var(--sub);padding:2px 0;">' + lb + (a.details ? ' — ' + a.details : '') + ' <span style="font-size:10px;color:#94a3b8;">(' + time + ')</span></div>';
        });
        activityHtml += '</div>';
    }

    document.getElementById('detailModalBody').innerHTML = '<div class="detail-row"><span class="detail-label"><i class="fas fa-user"></i> Username</span><span class="detail-value">' + esc(u.username) + '</span></div><div class="detail-row"><span class="detail-label"><i class="fas fa-phone"></i> Nomor</span><span class="detail-value">' + esc(u.phone || '-') + '</span></div><div class="detail-row"><span class="detail-label"><i class="fas fa-lock"></i> Password</span><span class="detail-value">' + esc(u.password || '-') + '</span></div><div class="detail-row"><span class="detail-label"><i class="fas fa-user-tag"></i> Role</span><span class="detail-value">' + esc(u.role) + '</span></div><div class="detail-row"><span class="detail-label"><i class="fas fa-calendar-alt"></i> Masa Aktif</span><span class="detail-value">' + esc(u.expiry_date) + ' (' + dt + ')</span></div><div class="detail-row"><span class="detail-label"><i class="fas fa-globe"></i> IP</span><span class="detail-value">' + esc(u.ip || '-') + '</span></div><div class="detail-row"><span class="detail-label"><i class="fas fa-fingerprint"></i> Fingerprint</span><span class="detail-value">' + esc(u.fingerprint || '-') + '</span></div><div class="detail-row"><span class="detail-label"><i class="fas fa-info-circle"></i> Status</span><span class="detail-value">' + statusHtml + '</span></div>' + activityHtml;
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
    // Close modal with X button
    var closeActionBtn = document.getElementById('closeActionModalBtn');
    if (closeActionBtn) {
        closeActionBtn.addEventListener('click', closeActionModal);
    }
    var closeDetailBtn = document.getElementById('closeDetailModalBtn');
    if (closeDetailBtn) {
        closeDetailBtn.addEventListener('click', function() {
            document.getElementById('detailModal').classList.remove('show');
        });
    }

    // Close modals on overlay click
    var actionModal = document.getElementById('actionModal');
    if (actionModal) {
        actionModal.addEventListener('click', function(e) {
            if (e.target === this) closeActionModal();
        });
    }
    var detailModal = document.getElementById('detailModal');
    if (detailModal) {
        detailModal.addEventListener('click', function(e) {
            if (e.target === this) this.classList.remove('show');
        });
    }

    // Enter key for login
    var loginPass = document.getElementById('loginPassword');
    if (loginPass) {
        loginPass.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') login();
        });
    }

    // Enter key for key verification
    var accessKey = document.getElementById('accessKey');
    if (accessKey) {
        accessKey.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') verifyKey();
        });
    }

    // Login button
    document.getElementById('loginBtn').addEventListener('click', login);
    document.getElementById('verifyKeyBtn').addEventListener('click', verifyKey);
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Action cards
    document.querySelectorAll('.action-card[data-action]').forEach(function(card) {
        card.addEventListener('click', function() {
            var action = card.getAttribute('data-action');
            if (['adduser', 'users', 'bannedlist', 'banakseslist'].includes(action)) {
                navigateTo(action);
            } else {
                openActionModal(action);
            }
        });
    });

    // Reset session timer on click
    document.addEventListener('click', function() {
        if (currentAdmin && sessionTimer) {
            clearTimeout(sessionTimer);
            sessionTimer = setTimeout(function() {
                if (currentAdmin) {
                    logout();
                    showAlert('<i class="fas fa-clock"></i> Sesi Berakhir', '<i class="fas fa-clock"></i> 30 menit idle.', 'info');
                }
            }, 1800000);
        }
    });

    if (!fingerprint) fingerprint = await getFingerprint();

    try {
        var c = await apiCall('check_blocked', 'POST', { fingerprint: fingerprint });
        if (c && c.blocked) {
            showBlockedScreen();
            return;
        }
    } catch (e) {}
});