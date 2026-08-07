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
    var icon = document.getElementById('alertIcon');
    var titleEl = document.getElementById('alertTitle');
    var msgEl = document.getElementById('alertMessage');

    if (!overlay) {
        Swal.fire({
            icon: type === 'success' ? 'success' : type === 'error' ? 'error' : 'info',
            title: title,
            text: msg,
            confirmButtonColor: '#00BFFF'
        });
        return;
    }

    titleEl.textContent = title;
    msgEl.textContent = msg;

    if (type === 'loading') {
        icon.innerHTML = '<div class="spinner"></div>';
    } else if (type === 'success') {
        icon.innerHTML = '<i class="fas fa-check-circle" style="color:#10b981;"></i>';
    } else if (type === 'error') {
        icon.innerHTML = '<i class="fas fa-times-circle" style="color:#ef4444;"></i>';
    } else {
        icon.innerHTML = '<i class="fas fa-info-circle" style="color:#00BFFF;"></i>';
    }

    overlay.classList.add('show');

    if (type !== 'loading') {
        setTimeout(function() {
            overlay.classList.remove('show');
        }, 2000);
    }
}

function hideAlert() {
    var o = document.getElementById('alertOverlay');
    if (o) {
        o.classList.remove('show');
    }
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

function closeModal(id) {
    var m = document.getElementById(id);
    if (m) {
        m.classList.remove('show');
    }
}

// ==================== API CALL ====================
async function apiCall(path, method, data) {
    if (!fingerprint) fingerprint = await getFingerprint();

    var payload = {
        path: path,
        method: method || 'GET',
        data: data || {},
        timestamp: Date.now()
    };

    var encryptedPayload = encryptData(payload);

    var headers = {
        'Content-Type': 'application/json',
        'X-Fingerprint': fingerprint
    };

    if (currentAdmin) {
        headers['X-Operator'] = encryptData({ value: currentAdmin });
    }

    var res = await fetch(API_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ data: encryptedPayload })
    });

    if (res.status === 429) throw new Error('Terlalu banyak request');

    var text = await res.text();
    if (!text || text === 'null') return null;

    var result = JSON.parse(text);

    if (result.data) {
        var decrypted = decryptData(result.data);
        return decrypted;
    }

    return result;
}

// ==================== NAVIGATION ====================
function switchPage(pageName) {
    document.querySelectorAll('.page').forEach(function(p) {
        p.classList.remove('active');
    });

    document.querySelectorAll('.sidebar-nav a').forEach(function(a) {
        a.classList.remove('active');
    });

    var page = document.getElementById('page-' + pageName);
    if (page) {
        page.classList.add('active');
    }

    document.querySelectorAll('.sidebar-nav a').forEach(function(link) {
        if (link.getAttribute('data-page') === pageName) {
            link.classList.add('active');
        }
    });

    var sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth <= 768) {
        sidebar.classList.remove('open');
    }

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

    if (pageName === 'maintenance') {
        loadMaintenance();
    }

    if (pageName === 'dashboard') {
        loadUsers();
        loadActivity();
        updateRingkasan();
    }
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// ==================== VERIFY KEY ====================
function verifyKey() {
    var key = document.getElementById('accessKey').value.trim();
    if (!key) {
        showAlert('Error', 'Key wajib diisi!', 'error');
        return;
    }

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
                setTimeout(function() {
                    showBlockedScreen();
                }, 1500);
                return;
            }
            showAlert('Error', 'Key salah! Sisa ' + (3 - keyAttempts), 'error');
        }
    }).catch(function(e) {
        hideAlert();
        showAlert('Error', e.message, 'error');
    });
}

function showBlockedScreen() {
    document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;padding:20px;font-family:\'Inter\',sans-serif;"><div style="background:rgba(30,41,59,0.9);border-radius:20px;padding:40px;max-width:440px;width:100%;text-align:center;border:1px solid rgba(239,68,68,0.3);"><div style="font-size:70px;margin-bottom:20px;">🔒</div><h1 style="color:#ef4444;font-size:24px;">AKSES DITOLAK</h1><p style="color:#94a3b8;">Akses Anda telah diblokir permanen.</p></div></div>';
}

// ==================== LOGIN ====================
function login() {
    var email = document.getElementById('loginEmail').value.trim();
    var pass = document.getElementById('loginPassword').value.trim();

    if (!email || !pass) {
        showAlert('Error', 'Email & password wajib!', 'error');
        return;
    }

    showAlert('Verifikasi', 'Mohon tunggu...', 'loading');

    apiCall('admin/auth', 'GET').then(function(r) {
        if (r && r.blocked) {
            hideAlert();
            showBlockedScreen();
            return;
        }

        if (r && r.email === email && r.password === pass) {
            apiCall('admin/login_success', 'POST', {}).then(function() {
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
                sessionTimer = setTimeout(function() {
                    if (currentAdmin) {
                        logout();
                        showAlert('Sesi Berakhir', '30 menit idle.', 'info');
                    }
                }, 1800000);
            });
        } else {
            apiCall('admin/login_failed', 'POST', {}).then(function() {
                hideAlert();
                showAlert('Gagal', 'Email atau password salah!', 'error');
            });
        }
    }).catch(function(e) {
        hideAlert();
        showAlert('Error', e.message, 'error');
    });
}

function logout() {
    currentAdmin = null;
    activityLoaded = false;
    settingsKeyVerified = false;

    if (sessionTimer) clearTimeout(sessionTimer);
    if (clockInterval) clearInterval(clockInterval);
    if (statsInterval) clearInterval(statsInterval);

    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loginWrapper').style.display = 'flex';
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('keyScreen').style.display = 'none';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginEmail').value = '';

    showAlert('Logout', 'Anda telah logout.', 'info');
}

// ==================== BACKGROUND ====================
function startBg() {
    updateClock();
    clockInterval = setInterval(updateClock, 60000);
    statsInterval = setInterval(function() {
        if (currentAdmin) loadUsers();
    }, 60000);
}

function updateClock() {
    var el = document.getElementById('clockDisplay');
    if (el) {
        el.textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }
}

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
                data[key].phone = data[key].phone || '';
                data[key].expiry_date = data[key].expiry_date || '';
                allUsers.push(data[key]);
            }
        }
        updateStats();
        updateAllTables();
    }).catch(function() {});
}

function updateStats() {
    var total = allUsers.length;
    var active = allUsers.filter(function(u) {
        return !u.banned && !u.banAkses && !u.forceLogout && calculateDaysLeft(u.expiry_date) > 0;
    }).length;
    var banned = allUsers.filter(function(u) { return u.banned; }).length;
    var banAkses = allUsers.filter(function(u) { return u.banAkses; }).length;
    var force = allUsers.filter(function(u) { return u.forceLogout; }).length;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statActive').textContent = active;
    document.getElementById('statBanned').textContent = banned;
    document.getElementById('statForce').textContent = force;

    document.getElementById('ringkasanAktif').textContent = active;
    document.getElementById('ringkasanBanned').textContent = banned;
    document.getElementById('ringkasanBanAkses').textContent = banAkses;
    document.getElementById('ringkasanForce').textContent = force;
}

// ==================== ACTIVITIES ====================
function loadActivity() {
    apiCall('activity_logs', 'GET').then(function(data) {
        allActivities = [];
        var logs = [];
        for (var key in data) {
            if (data[key] && data[key].username) {
                data[key].id = key;
                allActivities.push(data[key]);
                logs.push(data[key]);
            }
        }
        logs.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
        var recentLogs = logs.slice(0, 30);
        renderDashboardLog(recentLogs);
        activityLoaded = true;
    }).catch(function() {
        activityLoaded = false;
    });
}

function renderDashboardLog(logs) {
    var container = document.getElementById('activityListContainer');
    if (!container) return;

    if (!logs || !logs.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Belum ada aktivitas</div>';
        return;
    }

    container.innerHTML = buildLogHTML(logs);
}

function renderActivityLogPage() {
    var container = document.getElementById('allActivityLog');
    if (!container) return;

    if (!allActivities.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Tidak ada aktivitas</div>';
        return;
    }

    container.innerHTML = buildLogHTML(allActivities);
}

function renderSuspiciousLogPage() {
    var container = document.getElementById('suspiciousActivityLog');
    if (!container) return;

    var suspicious = allActivities.filter(function(l) {
        return ['sharing_detected', 'ip_changed', 'fp_changed', 'login_failed'].includes(l.action);
    });

    if (!suspicious.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-shield-alt"></i> Tidak ada aktivitas mencurigakan</div>';
        return;
    }

    container.innerHTML = buildLogHTML(suspicious);
}

function buildLogHTML(logs) {
    var labels = {
        sharing_detected: '🔴 SHARING DETEKSI',
        banned: 'Ban User',
        unbanned: 'Unban User',
        ban_akses: 'Ban Akses',
        unban_akses: 'Unban Akses',
        force_logout: 'Tangguhkan',
        unforce_logout: 'Lepas Tangguh',
        topup: 'Top Up',
        kuras: 'Kuras',
        gantinama: 'Ganti Nama',
        login_success: 'Login Sukses',
        login_failed: 'Gagal Login',
        ip_changed: 'IP Berubah',
        fp_changed: 'FP Berubah'
    };

    var html = '';
    logs.forEach(function(l) {
        var time = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
        var label = labels[l.action] || l.action;
        var isSuspicious = ['sharing_detected', 'login_failed', 'ip_changed', 'fp_changed'].includes(l.action);
        var details = l.details ? ' — ' + l.details : '';

        html += '<div class="activity-item' + (isSuspicious ? ' suspicious' : '') + '">' +
            '<div class="activity-dot ' + (l.action || '') + '"></div>' +
            '<div class="activity-info"><span class="activity-user">' + esc(l.username) + '</span> <span class="activity-desc">' + label + details + '</span></div>' +
            '<div class="activity-time">' + time + '</div>' +
            '</div>';
    });

    return html;
}

// ==================== CLEAR LOG ====================
function clearAllLogs() {
    showConfirm('Hapus SEMUA log secara permanen?', function() {
        showAlert('Proses', 'Menghapus semua log...', 'loading');

        apiCall('activity_logs', 'GET').then(function(data) {
            if (!data || Object.keys(data).length === 0) {
                hideAlert();
                showAlert('Info', 'Log sudah kosong!', 'info');
                return;
            }

            var keys = Object.keys(data);
            var count = 0;
            var promises = [];

            keys.forEach(function(key) {
                promises.push(
                    apiCall('activity_logs/' + key, 'DELETE').then(function() {
                        count++;
                    })
                );
            });

            Promise.all(promises).then(function() {
                allActivities = [];
                activityLoaded = false;

                document.getElementById('activityListContainer').innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Log kosong</div>';
                document.getElementById('allActivityLog').innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Log kosong</div>';
                document.getElementById('suspiciousActivityLog').innerHTML = '<div class="empty-state"><i class="fas fa-shield-alt"></i> Tidak ada</div>';

                hideAlert();
                showAlert('Berhasil', count + ' log berhasil dihapus permanen!', 'success');
            });
        }).catch(function() {
            hideAlert();
            showAlert('Error', 'Gagal menghapus log!', 'error');
        });
    });
}

// ==================== CONFIRM ====================
function showConfirm(msg, cb) {
    var overlay = document.getElementById('confirmOverlay');
    var msgEl = document.getElementById('confirmMessage');

    if (!overlay) {
        if (confirm(msg)) cb();
        return;
    }

    msgEl.textContent = msg;
    overlay.style.display = 'flex';

    document.getElementById('confirmYes').onclick = function() {
        overlay.style.display = 'none';
        cb();
    };

    document.getElementById('confirmNo').onclick = function() {
        overlay.style.display = 'none';
    };
}

// ==================== ADD USER ====================
function openAddUserModal() {
    var nm = new Date();
    nm.setMonth(nm.getMonth() + 1);
    document.getElementById('newExpiryDate').value = formatDate(nm);
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('newPhone').value = '';
    document.getElementById('newRole').value = 'Operator';
    document.getElementById('addUserModal').classList.add('show');
}

function addUserNow() {
    var u = document.getElementById('newUsername').value.trim();
    var p = document.getElementById('newPassword').value.trim();
    var ph = document.getElementById('newPhone').value.trim();
    var r = document.getElementById('newRole').value;
    var e = document.getElementById('newExpiryDate').value.trim();

    if (!u || !p || !e) {
        showAlert('Error', 'Username, password, dan masa aktif wajib diisi!', 'error');
        return;
    }

    if (p.length < 6) {
        showAlert('Error', 'Password minimal 6 karakter!', 'error');
        return;
    }

    showAlert('Proses', 'Menambahkan user...', 'loading');

    var userData = {
        username: u,
        password: p,
        phone: ph,
        role: r,
        expiry_date: e,
        banned: false,
        banAkses: false,
        forceLogout: false,
        ip: '',
        fingerprint: '',
        banAksesUntil: 0,
        bannedUntil: 0,
        createdAt: Date.now()
    };

    apiCall('users', 'POST', userData).then(function() {
        showAlert('Berhasil', 'User "' + u + '" berhasil ditambahkan!', 'success');
        closeModal('addUserModal');
        loadUsers();
        activityLoaded = false;
        loadActivity();
    }).catch(function(e) {
        showAlert('Error', e.message, 'error');
    });
}

// ==================== DELETE USER ====================
function deleteUser(id) {
    var u = allUsers.find(function(x) { return x.id === id; });
    if (!u) return;

    showConfirm('Hapus user "' + u.username + '" secara permanen?', function() {
        showAlert('Proses', 'Menghapus user...', 'loading');
        apiCall('users/' + id, 'DELETE').then(function() {
            showAlert('Berhasil', 'User berhasil dihapus!', 'success');
            loadUsers();
            activityLoaded = false;
            loadActivity();
        }).catch(function(e) {
            showAlert('Error', e.message, 'error');
        });
    });
}

// ==================== EDIT USER ====================
function openEditUserModal(id) {
    var u = allUsers.find(function(x) { return x.id === id; });
    if (!u) return;

    document.getElementById('editUserId').value = u.id;
    document.getElementById('editUsername').value = u.username;
    document.getElementById('editPassword').value = '';
    document.getElementById('editPhone').value = u.phone || '';
    document.getElementById('editRole').value = u.role || 'Operator';
    document.getElementById('editExpiryDate').value = u.expiry_date || '';
    document.getElementById('editIP').value = u.ip || '-';
    document.getElementById('editFP').value = u.fingerprint ? u.fingerprint.substring(0, 20) + '...' : '-';
    document.getElementById('editUserModal').classList.add('show');
}

function saveUserEdit() {
    var id = document.getElementById('editUserId').value;
    var u = document.getElementById('editUsername').value.trim();
    var p = document.getElementById('editPassword').value.trim();
    var ph = document.getElementById('editPhone').value.trim();
    var r = document.getElementById('editRole').value;
    var e = document.getElementById('editExpiryDate').value.trim();

    if (!u) {
        showAlert('Error', 'Username wajib diisi!', 'error');
        return;
    }

    showAlert('Proses', 'Menyimpan perubahan...', 'loading');

    var d = { username: u, role: r, expiry_date: e };
    if (p) d.password = p;
    if (ph) d.phone = ph;

    apiCall('users/' + id, 'PATCH', d).then(function() {
        showAlert('Berhasil', 'User berhasil diupdate!', 'success');
        closeModal('editUserModal');
        loadUsers();
        activityLoaded = false;
        loadActivity();
    }).catch(function(e) {
        showAlert('Error', e.message, 'error');
    });
}

// ==================== BAN USER ====================
function searchBanUser() {
    var q = document.getElementById('banUserSearch') ? document.getElementById('banUserSearch').value.toLowerCase() : '';
    var list = document.getElementById('banUserList');
    if (!list) return;

    var filtered = allUsers.filter(function(u) {
        return u.username.toLowerCase().includes(q) && u.banned === false;
    });

    if (!filtered.length) {
        list.innerHTML = '<div style="padding:12px;color:var(--sub);text-align:center;"><i class="fas fa-search"></i> Tidak ditemukan atau sudah di-ban</div>';
        selectedBanUser = null;
        document.getElementById('banSelectedUser').innerHTML = '';
        return;
    }

    list.innerHTML = filtered.map(function(u) {
        var isSel = selectedBanUser && selectedBanUser.id === u.id;
        var badges = '';
        if (u.banAkses) badges += ' <span class="badge badge-yellow">AKSES</span>';
        if (u.forceLogout) badges += ' <span class="badge badge-orange">FORCE</span>';
        return '<div class="user-check' + (isSel ? ' selected' : '') + '" onclick="selectBanUser(\'' + u.id + '\')">' +
            esc(u.username) + ' · ' + esc(u.role) + badges + '</div>';
    }).join('');
}

function selectBanUser(id) {
    selectedBanUser = allUsers.find(function(u) { return u.id === id; });
    var el = document.getElementById('banSelectedUser');
    if (el) {
        el.innerHTML = selectedBanUser ? '✅ Dipilih: <b>' + esc(selectedBanUser.username) + '</b>' : '';
    }
}

function executeBanUser() {
    if (!selectedBanUser) {
        showAlert('Error', 'Pilih user terlebih dahulu!', 'error');
        return;
    }

    var dur = parseInt(document.getElementById('banDuration').value);
    var name = selectedBanUser.username;
    var durText = dur === 0 ? 'PERMANEN' : 'sampai ' + new Date(Date.now() + dur).toLocaleString('id-ID');

    showConfirm('Ban user "' + name + '" ' + durText + '?', function() {
        showAlert('Proses', 'Memproses ban...', 'loading');

        var patchData = { banned: true, bannedUntil: dur === 0 ? 0 : Date.now() + dur };

        apiCall('users/' + selectedBanUser.id, 'PATCH', patchData).then(function() {
            showAlert('Berhasil', 'User "' + name + '" berhasil di-ban!', 'success');
            loadUsers();
            activityLoaded = false;
            loadActivity();
            selectedBanUser = null;
            document.getElementById('banSelectedUser').innerHTML = '';
            searchBanUser();
        }).catch(function(e) {
            showAlert('Error', e.message, 'error');
        });
    });
}

// ==================== DO ACTION ====================
function doAction(action, target) {
    showAlert('Proses', 'Memproses...', 'loading');

    var patchData = {};

    if (action === 'unban') {
        patchData = { banned: false, bannedUntil: 0 };
    } else if (action === 'banakses') {
        var dur = 86400000;
        patchData = { banAkses: true, banAksesUntil: Date.now() + dur };
        if (target.ip && target.ip !== '-') {
            apiCall('block_ip_manual', 'POST', { ip: target.ip }).catch(function() {});
        }
        if (target.fingerprint && target.fingerprint !== '-') {
            apiCall('block_fp_manual', 'POST', { fp: target.fingerprint }).catch(function() {});
        }
    } else if (action === 'unbanakses') {
        patchData = { banAkses: false, banAksesUntil: 0 };
        if (target.ip && target.ip !== '-') {
            apiCall('blocked_ips/' + target.ip.replace(/\./g, '_'), 'DELETE').catch(function() {});
        }
        if (target.fingerprint && target.fingerprint !== '-') {
            apiCall('blocked_fp/' + target.fingerprint, 'DELETE').catch(function() {});
        }
    } else if (action === 'force') {
        patchData = { forceLogout: true };
    } else if (action === 'unforce') {
        patchData = { forceLogout: false };
    }

    apiCall('users/' + target.id, 'PATCH', patchData).then(function() {
        showAlert('Berhasil', 'Aksi berhasil!', 'success');
        loadUsers();
        activityLoaded = false;
        loadActivity();
    }).catch(function(e) {
        showAlert('Error', e.message, 'error');
    });
}

// ==================== TABLE RENDERS ====================
function updateAllTables() {
    renderAllUsersTable();
    renderUnbannedTable();
    renderBanAksesTable();
    renderUnbanAksesTable();
    renderForceTable();
    renderUnforceTable();
    renderProblemTable();
    updateRingkasan();
    renderWebStats();
}

function renderAllUsersTable() {
    var tbody = document.getElementById('allUsersTable');
    if (!tbody) return;

    if (!allUsers.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Tidak ada user</td></tr>';
        return;
    }

    tbody.innerHTML = allUsers.map(function(u) {
        var badges = '';
        if (u.banned) badges += '<span class="badge badge-red">Banned</span> ';
        if (u.banAkses) badges += '<span class="badge badge-yellow">Ban Akses</span> ';
        if (u.forceLogout) badges += '<span class="badge badge-orange">Tangguh</span> ';
        var fpDisplay = u.fingerprint ? u.fingerprint.substring(0, 12) + '...' : '-';

        return '<tr>' +
            '<td><b>' + esc(u.username) + '</b></td>' +
            '<td>' + esc(u.role || '-') + '</td>' +
            '<td>' + badges + '</td>' +
            '<td>' + (u.ip || '-') + '</td>' +
            '<td>' + fpDisplay + '</td>' +
            '<td>' + (u.expiry_date || '-') + '</td>' +
            '<td>' +
            '<button class="btn btn-outline btn-xs" onclick="openEditUserModal(\'' + u.id + '\')"><i class="fas fa-edit"></i></button> ' +
            '<button class="btn btn-danger btn-xs" onclick="deleteUser(\'' + u.id + '\')"><i class="fas fa-trash"></i></button>' +
            '</td>' +
            '</tr>';
    }).join('');
}

function renderUnbannedTable() {
    var tbody = document.getElementById('unbannedUsersTable');
    if (!tbody) return;

    var unbanned = allUsers.filter(function(u) { return u.banned === true; });

    if (!unbanned.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Tidak ada</td></tr>';
        return;
    }

    tbody.innerHTML = unbanned.map(function(u) {
        var durasi = u.bannedUntil === 0 ? 'Permanen' : new Date(u.bannedUntil).toLocaleString('id-ID');
        return '<tr>' +
            '<td><b>' + esc(u.username) + '</b></td>' +
            '<td>' + esc(u.role || '-') + '</td>' +
            '<td>' + durasi + '</td>' +
            '<td><button class="btn btn-success btn-xs" onclick="doAction(\'unban\', allUsers.find(function(x){return x.id===\'' + u.id + '\'}))">Unban</button></td>' +
            '</tr>';
    }).join('');
}

function renderBanAksesTable() {
    var tbody = document.getElementById('banaksesUsersTable');
    if (!tbody) return;

    var users = allUsers.filter(function(u) { return u.banAkses === false; });

    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Tidak ada</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(function(u) {
        var statusBadge = '';
        if (u.banned) statusBadge += '<span class="status-badge banned">BANNED</span> ';
        if (u.forceLogout) statusBadge += '<span class="status-badge force">TANGGUH</span> ';
        return '<tr>' +
            '<td><b>' + esc(u.username) + '</b> ' + statusBadge + '</td>' +
            '<td>' + esc(u.role || '-') + '</td>' +
            '<td><span class="badge badge-green">Belum</span></td>' +
            '<td><button class="btn btn-danger btn-xs" onclick="doAction(\'banakses\', allUsers.find(function(x){return x.id===\'' + u.id + '\'}))">Ban Akses</button></td>' +
            '</tr>';
    }).join('');
}

function renderUnbanAksesTable() {
    var tbody = document.getElementById('unbanaksesUsersTable');
    if (!tbody) return;

    var unbanakses = allUsers.filter(function(u) { return u.banAkses === true; });

    if (!unbanakses.length) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Tidak ada</td></tr>';
        return;
    }

    tbody.innerHTML = unbanakses.map(function(u) {
        return '<tr>' +
            '<td><b>' + esc(u.username) + '</b></td>' +
            '<td>' + esc(u.role || '-') + '</td>' +
            '<td><button class="btn btn-success btn-xs" onclick="doAction(\'unbanakses\', allUsers.find(function(x){return x.id===\'' + u.id + '\'}))">Unban Akses</button></td>' +
            '</tr>';
    }).join('');
}

function renderForceTable() {
    var tbody = document.getElementById('forceUsersTable');
    if (!tbody) return;

    var users = allUsers.filter(function(u) { return u.forceLogout === false; });

    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Tidak ada</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(function(u) {
        var statusBadge = '';
        if (u.banned) statusBadge += '<span class="status-badge banned">BANNED</span> ';
        if (u.banAkses) statusBadge += '<span class="status-badge banakses">BAN AKSES</span> ';
        return '<tr>' +
            '<td><b>' + esc(u.username) + '</b> ' + statusBadge + '</td>' +
            '<td>' + esc(u.role || '-') + '</td>' +
            '<td><span class="badge badge-green">Belum</span></td>' +
            '<td><button class="btn btn-danger btn-xs" onclick="doAction(\'force\', allUsers.find(function(x){return x.id===\'' + u.id + '\'}))">Tangguhkan</button></td>' +
            '</tr>';
    }).join('');
}

function renderUnforceTable() {
    var tbody = document.getElementById('unforceUsersTable');
    if (!tbody) return;

    var unforce = allUsers.filter(function(u) { return u.forceLogout === true; });

    if (!unforce.length) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Tidak ada</td></tr>';
        return;
    }

    tbody.innerHTML = unforce.map(function(u) {
        return '<tr>' +
            '<td><b>' + esc(u.username) + '</b></td>' +
            '<td>' + esc(u.role || '-') + '</td>' +
            '<td><button class="btn btn-success btn-xs" onclick="doAction(\'unforce\', allUsers.find(function(x){return x.id===\'' + u.id + '\'}))">Lepas Tangguh</button></td>' +
            '</tr>';
    }).join('');
}

function renderProblemTable() {
    var tbody = document.getElementById('problemUsersTable');
    if (!tbody) return;

    var problems = allUsers.filter(function(u) {
        return u.banned === true || u.banAkses === true || u.forceLogout === true;
    });

    if (!problems.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Tidak ada</td></tr>';
        return;
    }

    tbody.innerHTML = problems.map(function(u) {
        var badges = '';
        if (u.banned) badges += '<span class="badge badge-red">Banned</span> ';
        if (u.banAkses) badges += '<span class="badge badge-yellow">Ban Akses</span> ';
        if (u.forceLogout) badges += '<span class="badge badge-orange">Tangguh</span> ';
        return '<tr>' +
            '<td><b>' + esc(u.username) + '</b></td>' +
            '<td>' + esc(u.role || '-') + '</td>' +
            '<td>' + badges + '</td>' +
            '<td><button class="btn btn-outline btn-xs" onclick="openEditUserModal(\'' + u.id + '\')">Edit</button></td>' +
            '</tr>';
    }).join('');
}

function renderWebStats() {
    var total = allUsers.length;
    var active = allUsers.filter(function(u) {
        return !u.banned && !u.banAkses && !u.forceLogout && calculateDaysLeft(u.expiry_date) > 0;
    }).length;
    var banned = allUsers.filter(function(u) { return u.banned; }).length;
    var banAkses = allUsers.filter(function(u) { return u.banAkses; }).length;
    var force = allUsers.filter(function(u) { return u.forceLogout; }).length;
    var totalLogins = allActivities.filter(function(l) { return l.action === 'login_success'; }).length;

    document.getElementById('webStatTotalUsers').textContent = total;
    document.getElementById('webStatActiveUsers').textContent = active;
    document.getElementById('webStatBannedUsers').textContent = banned;
    document.getElementById('webStatBanAkses').textContent = banAkses;
    document.getElementById('webStatForce').textContent = force;
    document.getElementById('webStatTotalLogins').textContent = totalLogins;

    document.getElementById('distAktif').textContent = active;
    document.getElementById('distBanned').textContent = banned;
    document.getElementById('distBanAkses').textContent = banAkses;
    document.getElementById('distForce').textContent = force;
}

function updateRingkasan() {
    var active = allUsers.filter(function(u) {
        return !u.banned && !u.banAkses && !u.forceLogout && calculateDaysLeft(u.expiry_date) > 0;
    }).length;
    var banned = allUsers.filter(function(u) { return u.banned; }).length;
    var banAkses = allUsers.filter(function(u) { return u.banAkses; }).length;
    var force = allUsers.filter(function(u) { return u.forceLogout; }).length;

    document.getElementById('ringkasanAktif').textContent = active;
    document.getElementById('ringkasanBanned').textContent = banned;
    document.getElementById('ringkasanBanAkses').textContent = banAkses;
    document.getElementById('ringkasanForce').textContent = force;
}

// ==================== SETTINGS ====================
function verifySettingsKey() {
    var key = document.getElementById('settingsKeyInput').value.trim();
    if (!key) {
        document.getElementById('settingsKeyStatus').innerHTML = '<span style="color:#ef4444;">❌ Masukkan Key Aksi!</span>';
        return;
    }

    apiCall('action_keys', 'GET').then(function(data) {
        var valid = false;
        for (var k in data) {
            if (data[k] && data[k].key === key) {
                valid = true;
                break;
            }
        }

        if (valid) {
            settingsKeyVerified = true;
            document.getElementById('settingsKeyPage').style.display = 'none';
            document.getElementById('settingsContent').style.display = 'block';
            loadSettingsData();
            showAlert('Berhasil', 'Key Aksi valid! Akses diberikan.', 'success');
        } else {
            document.getElementById('settingsKeyStatus').innerHTML = '<span style="color:#ef4444;">❌ Key Aksi salah!</span>';
            showAlert('Error', 'Key Aksi salah!', 'error');
        }
    });
}

function loadSettingsData() {
    apiCall('admin/auth', 'GET').then(function(r) {
        if (r) {
            document.getElementById('settingsEmail').value = r.email || '••••••••@••••••••';
            document.getElementById('settingsPassword').value = r.password || '••••••••';
        }
    });
    loadActionKeys();
    loadWhitelistIP();
    loadWhitelistFP();
}

function togglePassword() {
    var el = document.getElementById('settingsPassword');
    var icon = document.getElementById('togglePassIcon');
    if (el.type === 'password') {
        el.type = 'text';
        if (icon) { icon.classList.remove('fa-eye'); icon.classList.add('fa-eye-slash'); }
    } else {
        el.type = 'password';
        if (icon) { icon.classList.remove('fa-eye-slash'); icon.classList.add('fa-eye'); }
    }
}

function openChangeEmailModal() {
    document.getElementById('newEmail').value = '';
    document.getElementById('changeEmailModal').classList.add('show');
}

function changeEmail() {
    var email = document.getElementById('newEmail').value.trim();
    if (!email) { showAlert('Error', 'Email baru wajib diisi!', 'error'); return; }
    showAlert('Proses', 'Mengupdate email...', 'loading');
    apiCall('admin/update_email', 'PATCH', { email: email }).then(function() {
        showAlert('Berhasil', 'Email berhasil diupdate!', 'success');
        closeModal('changeEmailModal');
        loadSettingsData();
    }).catch(function(e) { showAlert('Error', e.message, 'error'); });
}

function openChangePasswordModal() {
    document.getElementById('newPasswordSettings').value = '';
    document.getElementById('confirmNewPassword').value = '';
    document.getElementById('changePasswordModal').classList.add('show');
}

function changePassword() {
    var pass = document.getElementById('newPasswordSettings').value.trim();
    var confirm = document.getElementById('confirmNewPassword').value.trim();
    if (!pass) { showAlert('Error', 'Password baru wajib diisi!', 'error'); return; }
    if (pass.length < 6) { showAlert('Error', 'Password minimal 6 karakter!', 'error'); return; }
    if (pass !== confirm) { showAlert('Error', 'Password tidak cocok!', 'error'); return; }
    showAlert('Proses', 'Mengupdate password...', 'loading');
    apiCall('admin/update_password', 'PATCH', { password: pass }).then(function() {
        showAlert('Berhasil', 'Password berhasil diupdate!', 'success');
        closeModal('changePasswordModal');
        loadSettingsData();
    }).catch(function(e) { showAlert('Error', e.message, 'error'); });
}

// ==================== KEY AKSI ====================
function addActionKey() {
    var key = document.getElementById('newActionKey').value.trim();
    if (!key) { showAlert('Error', 'Masukkan key aksi baru!', 'error'); return; }
    apiCall('action_keys', 'POST', { key: key, createdAt: Date.now() }).then(function() {
        showAlert('Berhasil', 'Key aksi ditambahkan!', 'success');
        document.getElementById('newActionKey').value = '';
        loadActionKeys();
    }).catch(function(e) { showAlert('Error', e.message, 'error'); });
}

function loadActionKeys() {
    apiCall('action_keys', 'GET').then(function(data) {
        var html = '';
        var count = 0;
        for (var k in data) {
            if (data[k] && data[k].key) {
                count++;
                var masked = '••••' + data[k].key.substring(data[k].key.length - 4);
                var date = data[k].createdAt ? new Date(data[k].createdAt).toLocaleString('id-ID') : '-';
                var isDefault = data[k].isDefault ? ' (Default)' : '';
                html += '<tr><td>' + masked + isDefault + '</td><td>' + date + '</td><td>' +
                    (data[k].isDefault ? '<span class="badge badge-blue">Default</span>' : '<button class="btn btn-danger btn-xs" onclick="deleteActionKey(\'' + k + '\')"><i class="fas fa-trash"></i></button>') +
                    '</td></tr>';
            }
        }
        if (count === 0) html = '<tr><td colspan="3" style="text-align:center;">Tidak ada key aksi</td></tr>';
        document.getElementById('actionKeysTable').innerHTML = html;
    });
}

function deleteActionKey(id) {
    showConfirm('Hapus key aksi ini?', function() {
        apiCall('action_keys/' + id, 'DELETE').then(function() {
            showAlert('Berhasil', 'Key aksi dihapus!', 'success');
            loadActionKeys();
        });
    });
}

// ==================== IP WHITELIST ====================
function addWhitelistIP() {
    var ip = document.getElementById('newWhitelistIP').value.trim();
    if (!ip) { showAlert('Error', 'Masukkan IP!', 'error'); return; }
    apiCall('ip_whitelist', 'POST', { ip: ip, createdAt: Date.now() }).then(function() {
        showAlert('Berhasil', 'IP ditambahkan ke whitelist!', 'success');
        document.getElementById('newWhitelistIP').value = '';
        loadWhitelistIP();
    }).catch(function(e) { showAlert('Error', e.message, 'error'); });
}

function loadWhitelistIP() {
    apiCall('ip_whitelist', 'GET').then(function(data) {
        var html = '';
        var count = 0;
        for (var k in data) {
            if (data[k] && data[k].ip) {
                count++;
                var date = data[k].createdAt ? new Date(data[k].createdAt).toLocaleString('id-ID') : '-';
                html += '<tr><td>' + data[k].ip + '</td><td>' + date + '</td><td><button class="btn btn-danger btn-xs" onclick="deleteWhitelistIP(\'' + k + '\')"><i class="fas fa-trash"></i></button></td></tr>';
            }
        }
        if (count === 0) html = '<tr><td colspan="3" style="text-align:center;">Tidak ada IP</td></tr>';
        document.getElementById('ipWhitelistTable').innerHTML = html;
    });
}

function deleteWhitelistIP(id) {
    showConfirm('Hapus IP dari whitelist?', function() {
        apiCall('ip_whitelist/' + id, 'DELETE').then(function() {
            showAlert('Berhasil', 'IP dihapus!', 'success');
            loadWhitelistIP();
        });
    });
}

// ==================== FP WHITELIST ====================
function addWhitelistFP() {
    var fp = document.getElementById('newWhitelistFP').value.trim();
    if (!fp) { showAlert('Error', 'Masukkan fingerprint!', 'error'); return; }
    apiCall('fp_whitelist', 'POST', { fp: fp, createdAt: Date.now() }).then(function() {
        showAlert('Berhasil', 'Fingerprint ditambahkan ke whitelist!', 'success');
        document.getElementById('newWhitelistFP').value = '';
        loadWhitelistFP();
    }).catch(function(e) { showAlert('Error', e.message, 'error'); });
}

function loadWhitelistFP() {
    apiCall('fp_whitelist', 'GET').then(function(data) {
        var html = '';
        var count = 0;
        for (var k in data) {
            if (data[k] && data[k].fp) {
                count++;
                var masked = data[k].fp.substring(0, 20) + '...';
                var date = data[k].createdAt ? new Date(data[k].createdAt).toLocaleString('id-ID') : '-';
                html += '<tr><td>' + masked + '</td><td>' + date + '</td><td><button class="btn btn-danger btn-xs" onclick="deleteWhitelistFP(\'' + k + '\')"><i class="fas fa-trash"></i></button></td></tr>';
            }
        }
        if (count === 0) html = '<tr><td colspan="3" style="text-align:center;">Tidak ada FP</td></tr>';
        document.getElementById('fpWhitelistTable').innerHTML = html;
    });
}

function deleteWhitelistFP(id) {
    showConfirm('Hapus fingerprint dari whitelist?', function() {
        apiCall('fp_whitelist/' + id, 'DELETE').then(function() {
            showAlert('Berhasil', 'Fingerprint dihapus!', 'success');
            loadWhitelistFP();
        });
    });
}

// ==================== MAINTENANCE ====================
function toggleMaintenance() {
    var el = document.getElementById('maintenanceToggle');
    var statusEl = document.getElementById('maintenanceStatusText');
    if (el.checked) {
        statusEl.innerHTML = '<span class="maintenance-status maintenance-on">ON</span>';
    } else {
        statusEl.innerHTML = '<span class="maintenance-status maintenance-off">OFF</span>';
    }
}

function saveMaintenance() {
    var status = document.getElementById('maintenanceToggle').checked;
    var msg = document.getElementById('maintenanceMessage').value.trim();
    apiCall('maintenance', 'PUT', {
        enabled: status,
        message: msg || 'Website sedang maintenance, silakan kembali nanti.'
    }).then(function() {
        showAlert('Berhasil', 'Pengaturan maintenance disimpan!', 'success');
    }).catch(function(e) {
        showAlert('Error', e.message, 'error');
    });
}

function loadMaintenance() {
    apiCall('maintenance', 'GET').then(function(data) {
        if (data && data.enabled !== undefined) {
            document.getElementById('maintenanceToggle').checked = data.enabled;
            document.getElementById('maintenanceMessage').value = data.message || '';
            toggleMaintenance();
        }
    });
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async function() {
    document.querySelectorAll('.modal').forEach(function(m) {
        m.addEventListener('click', function(e) {
            if (e.target === this) this.classList.remove('show');
        });
    });

    document.getElementById('loginPassword').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') login();
    });

    document.getElementById('accessKey').addEventListener('keypress', function(e) {
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
});