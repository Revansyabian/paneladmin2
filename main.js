const API_URL = '/api/revanstore';
const API_SECRET = '1417-1426-1527-1517';

let sessionId = null;
let currentAdmin = null;
let allUsers = [];
let allActivities = [];
let fingerprint = '';
let keyAttempts = 0;
let loginAttempts = 0;
let sessionTimer = null;
let selectedBanUser = null;
let clockInterval = null;
let statsInterval = null;
let activityLoaded = false;
let actionKeyVerified = false;
let actionKeyChecked = false;
let serverAdminKey = null;
let settingsKeyVerified = false;
let currentActivationTab = 'pending';

function encryptData(data) {
    return CryptoJS.AES.encrypt(JSON.stringify(data), API_SECRET).toString();
}

function decryptData(encrypted) {
    try {
        const decrypted = CryptoJS.AES.decrypt(encrypted, API_SECRET).toString(CryptoJS.enc.Utf8);
        return JSON.parse(decrypted);
    } catch (e) {
        return null;
    }
}

async function getFingerprint() {
    let fp = '';
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

async function apiCall(path, method = 'GET', data = {}) {
    if (!fingerprint) fingerprint = await getFingerprint();
    
    const payload = { path, method, data, timestamp: Date.now() };
    const encryptedPayload = encryptData(payload);
    
    const headers = {
        'Content-Type': 'application/json',
        'X-Fingerprint': fingerprint
    };
    
    if (sessionId) headers['X-Session'] = sessionId;
    if (currentAdmin) headers['X-Operator'] = currentAdmin;
    
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ data: encryptedPayload })
    });
    
    if (response.status === 401) {
        localStorage.removeItem('sessionId');
        sessionId = null;
        showAlert('Sesi Berakhir', 'Silakan login ulang.', 'error');
        logout();
        return null;
    }
    
    if (response.status === 429) {
        throw new Error('RATE_LIMIT: Terlalu banyak request, coba lagi nanti.');
    }
    
    const text = await response.text();
    if (!text || text === 'null') return null;
    
    try {
        const result = JSON.parse(text);
        if (result && result.data) {
            const decrypted = decryptData(result.data);
            if (decrypted) return decrypted;
        }
        return result;
    } catch (e) {
        console.error('[API] Parse error:', e);
        throw new Error('INVALID_RESPONSE: Format response tidak valid.');
    }
}

function showAlert(title, msg, type) {
    const overlay = document.getElementById('alertOverlay');
    const icon = document.getElementById('alertIcon');
    const titleEl = document.getElementById('alertTitle');
    const msgEl = document.getElementById('alertMessage');
    
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
        setTimeout(() => overlay.classList.remove('show'), 3000);
    }
}

function hideAlert() {
    const overlay = document.getElementById('alertOverlay');
    if (overlay) overlay.classList.remove('show');
}

function showBlockedScreen(ipAddress, fpValue) {
    const blockedScreen = document.getElementById('blockedScreen');
    const ipDisplay = document.getElementById('blockedIPDisplay');
    const fpDisplay = document.getElementById('blockedFPDisplay');
    
    document.querySelector('.blocked-title').textContent = '⛔ AKSES DITOLAK';
    document.querySelector('.blocked-subtitle').textContent = 
        'Anda telah melakukan 3 kali percobaan akses yang salah. ' +
        'Untuk keamanan, IP dan perangkat Anda telah diblokir sementara.';
    
    if (ipDisplay) ipDisplay.textContent = ipAddress || '-';
    if (fpDisplay) {
        fpDisplay.textContent = (fpValue && fpValue !== '-') 
            ? fpValue.substring(0, 20) + '...' 
            : '-';
    }
    
    document.getElementById('loginWrapper').style.display = 'none';
    document.getElementById('appContainer').style.display = 'none';
    
    if (blockedScreen) {
        blockedScreen.classList.add('show');
    }
}

async function checkBlockedOnLoad() {
    try {
        if (!fingerprint) fingerprint = await getFingerprint();
        
        console.log('[CHECK BLOCKED] Checking fingerprint:', fingerprint);
        
        const result = await apiCall('check_blocked', 'GET', {});
        
        console.log('[CHECK BLOCKED] Result:', result);
        
        if (result && result.blocked === true) {
            const ipValue = result.ip || fingerprint;
            showBlockedScreen(ipValue, fingerprint);
            return true;
        }
        
        return false;
    } catch (e) {
        console.error('[Check Blocked] Error:', e);
        return false;
    }
}

function blockIP(ip) {
    if (!ip || ip === '-' || ip === '' || ip === 'unknown') {
        console.log('[BLOCK IP] Skip invalid IP:', ip);
        return;
    }
    console.log('[BLOCK IP] Blocking IP:', ip);
    apiCall('block_ip', 'POST', { ip: ip }).then(result => {
        console.log('[BLOCK IP] Result:', result);
    }).catch(err => {
        console.error('[Block IP] Gagal:', err);
    });
}

function blockFP(fp) {
    if (!fp || fp === '-' || fp === '') {
        console.log('[BLOCK FP] Skip invalid FP:', fp);
        return;
    }
    console.log('[BLOCK FP] Blocking FP:', fp);
    apiCall('block_fp', 'POST', { fp: fp }).then(result => {
        console.log('[BLOCK FP] Result:', result);
    }).catch(err => {
        console.error('[Block FP] Gagal:', err);
    });
}

function unblockIP(ip) {
    if (!ip || ip === '-' || ip === '') return;
    apiCall('blocked_ips/' + ip.replace(/\./g, '_'), 'DELETE').catch(err => {
        console.error('[Unblock IP] Gagal:', err);
    });
    apiCall('blocked_ips/' + ip, 'DELETE').catch(err => {
        console.error('[Unblock IP] Gagal:', err);
    });
}

function unblockFP(fp) {
    if (!fp || fp === '-' || fp === '') return;
    apiCall('blocked_fp/' + fp, 'DELETE').catch(err => {
        console.error('[Unblock FP] Gagal:', err);
    });
}

function verifyKey() {
    const key = document.getElementById('accessKey').value.trim();
    if (!key) {
        showAlert('Error', 'Key wajib diisi!', 'error');
        return;
    }
    showAlert('Verifikasi', 'Memeriksa key...', 'loading');
    apiCall('access_key', 'GET', {})
        .then(result => {
            if (result && result.key === key) {
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
                    console.log('[VERIFY KEY] 3x salah, blocking IP & FP');
                    apiCall('block_ip', 'POST', { ip: fingerprint }).then(() => {
                        console.log('[VERIFY KEY] IP blocked via server');
                    });
                    apiCall('block_fp', 'POST', { fp: fingerprint }).then(() => {
                        console.log('[VERIFY KEY] FP blocked via server');
                    });
                    showAlert('Akses Diblokir', 'Terlalu banyak percobaan! IP & Perangkat Anda diblokir.', 'error');
                    setTimeout(() => {
                        checkBlockedOnLoad().then(isBlocked => {
                            if (!isBlocked) {
                                showBlockedScreen(fingerprint, fingerprint);
                            }
                        });
                    }, 2000);
                    return;
                }
                showAlert('Error', 'Key salah! Sisa ' + (3 - keyAttempts) + ' percobaan.', 'error');
            }
        })
        .catch(err => {
            hideAlert();
            showAlert('Error', err.message || 'Terjadi kesalahan pada server.', 'error');
        });
}

function login() {
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPassword').value.trim();
    if (!email || !pass) {
        showAlert('Error', 'Email & password wajib!', 'error');
        return;
    }
    showAlert('Verifikasi', 'Mohon tunggu...', 'loading');
    apiCall('admin/auth', 'GET', {})
        .then(result => {
            if (result && result.blocked) {
                hideAlert();
                checkBlockedOnLoad();
                return;
            }
            if (result && result.email === email && result.password === pass) {
                loginAttempts = 0;
                apiCall('admin/login_success', 'POST', { email: email })
                    .then(loginResult => {
                        if (loginResult && loginResult.success && loginResult.sessionId) {
                            sessionId = loginResult.sessionId;
                            localStorage.setItem('sessionId', sessionId);
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
                            sessionTimer = setTimeout(() => {
                                if (currentAdmin) {
                                    logout();
                                    showAlert('Sesi Berakhir', '30 menit idle.', 'info');
                                }
                            }, 1800000);
                        } else {
                            hideAlert();
                            showAlert('Gagal', 'Login gagal!', 'error');
                        }
                    });
            } else {
                loginAttempts++;
                apiCall('admin/login_failed', 'POST', {})
                    .then(() => {
                        hideAlert();
                        if (loginAttempts >= 3) {
                            console.log('[LOGIN] 3x salah, blocking IP & FP');
                            showAlert('Diblokir', 'Password salah 3x! IP & FP Anda diblokir.', 'error');
                            apiCall('block_ip', 'POST', { ip: fingerprint }).catch(() => {});
                            apiCall('block_fp', 'POST', { fp: fingerprint }).catch(() => {});
                            setTimeout(() => {
                                checkBlockedOnLoad();
                            }, 2000);
                        } else {
                            showAlert('Gagal', 'Email atau password salah! Sisa ' + (3 - loginAttempts) + ' percobaan.', 'error');
                        }
                    });
            }
        })
        .catch(err => {
            hideAlert();
            showAlert('Error', err.message || 'Terjadi kesalahan pada server.', 'error');
        });
}

function logout() {
    if (sessionId) {
        apiCall('logout', 'POST', {}).catch(() => {});
    }
    sessionId = null;
    localStorage.removeItem('sessionId');
    currentAdmin = null;
    activityLoaded = false;
    actionKeyVerified = false;
    actionKeyChecked = false;
    settingsKeyVerified = false;
    serverAdminKey = null;
    localStorage.removeItem('server_admin_key');
    document.getElementById('serverAdminKey').value = 'Belum login';
    document.getElementById('serverKeyStatus').innerHTML = '';
    document.getElementById('settingsKeyOverlay').classList.remove('show');
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

function showConfirm(msg, cb) {
    const overlay = document.getElementById('confirmOverlay');
    const msgEl = document.getElementById('confirmMessage');
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

function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('show');
}

function switchPage(pageName) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const page = document.getElementById('page-' + pageName);
    if (page) page.classList.add('active');
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        if (link.getAttribute('data-page') === pageName) link.classList.add('active');
    });
    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth <= 768) sidebar.classList.remove('open');
    if (pageName === 'settings') {
        if (!settingsKeyVerified) {
            showSettingsKeyOverlay();
        } else {
            loadSettings();
        }
    }
    if (pageName === 'all-users') renderAllUsersList();
    if (pageName === 'aktivasi-user') renderActivations();
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
    if (pageName === 'maintenance') loadMaintenanceStatus();
    if (pageName === 'path-manager') loadPathManager();
    if (pageName === 'dashboard') {
        updateRingkasan();
        loadUsers();
        loadActivity();
    }
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

function startBg() {
    updateClock();
    clockInterval = setInterval(updateClock, 60000);
    statsInterval = setInterval(function() {
        if (currentAdmin) {
            loadUsers();
        }
    }, 60000);
}

function updateClock() {
    const el = document.getElementById('clockDisplay');
    if (el) el.textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(d) {
    return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') + '/' + d.getFullYear();
}

function calculateDaysLeft(e) {
    if (!e) return -9999;
    const p = e.split('/');
    if (p.length !== 3) return -9999;
    const ex = new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1]));
    if (ex.getFullYear() === 9999) return 999999;
    const n = new Date();
    n.setHours(0, 0, 0, 0);
    return Math.floor((ex - n) / (1000 * 60 * 60 * 24));
}

function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

function loadUsers() {
    apiCall('users', 'GET').then(function(data) {
        allUsers = [];
        for (let key in data) {
            if (data[key] && data[key].username) {
                data[key].id = key;
                data[key].banned = data[key].banned || false;
                data[key].banAkses = data[key].banAkses || false;
                data[key].forceLogout = data[key].forceLogout || false;
                data[key].ip = data[key].ip || '';
                data[key].fingerprint = data[key].fingerprint || '';
                data[key].phone = data[key].phone || '';
                data[key].email = data[key].email || '';
                data[key].expiry_date = data[key].expiry_date || '';
                data[key].activationStatus = data[key].activationStatus || 'none';
                data[key].paket = data[key].paket || '';
                allUsers.push(data[key]);
            }
        }
        updateStats();
        updateAllTables();
    }).catch(function() {});
}

function updateStats() {
    const total = allUsers.length;
    const active = allUsers.filter(u => !u.banned && !u.banAkses && !u.forceLogout && calculateDaysLeft(u.expiry_date) > 0).length;
    const banned = allUsers.filter(u => u.banned).length;
    const banAkses = allUsers.filter(u => u.banAkses).length;
    const pending = allUsers.filter(u => u.activationStatus === 'pending').length;
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statActive').textContent = active;
    document.getElementById('statBanned').textContent = banned;
    document.getElementById('statPending').textContent = pending;
    document.getElementById('ringkasanAktif').textContent = active;
    document.getElementById('ringkasanBanned').textContent = banned;
    document.getElementById('ringkasanBanAkses').textContent = banAkses;
    document.getElementById('ringkasanPending').textContent = pending;
    document.getElementById('webStatPending').textContent = pending;
    document.getElementById('distPending').textContent = pending;
}

function loadActivity() {
    apiCall('activity_logs', 'GET').then(function(data) {
        allActivities = [];
        const logs = [];
        for (let key in data) {
            if (data[key] && data[key].username) {
                data[key].id = key;
                allActivities.push(data[key]);
                logs.push(data[key]);
            }
        }
        logs.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
        renderDashboardLog(logs.slice(0, 30));
        activityLoaded = true;
    }).catch(function() { activityLoaded = false; });
}

function renderDashboardLog(logs) {
    const container = document.getElementById('activityListContainer');
    if (!container) return;
    if (!logs || !logs.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Belum ada aktivitas</div>';
        return;
    }
    container.innerHTML = buildLogHTML(logs);
}

function renderActivityLogPage() {
    const container = document.getElementById('allActivityLog');
    if (!container) return;
    if (!allActivities.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Tidak ada aktivitas</div>';
        return;
    }
    container.innerHTML = buildLogHTML(allActivities);
}

function renderSuspiciousLogPage() {
    const container = document.getElementById('suspiciousActivityLog');
    if (!container) return;
    const suspicious = allActivities.filter(l => ['sharing_detected', 'ip_changed', 'fp_changed', 'login_failed'].includes(l.action));
    if (!suspicious.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Tidak ada aktivitas mencurigakan</div>';
        return;
    }
    container.innerHTML = buildLogHTML(suspicious);
}

function buildLogHTML(logs) {
    const labels = {
        sharing_detected: 'SHARING DETEKSI',
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
    let html = '';
    logs.forEach(function(l) {
        const time = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
        const label = labels[l.action] || l.action;
        const isSuspicious = ['sharing_detected', 'login_failed', 'ip_changed', 'fp_changed'].includes(l.action);
        const details = l.details ? ' — ' + esc(l.details) : '';
        html += '<div class="activity-item' + (isSuspicious ? ' suspicious' : '') + '">' +
            '<div class="activity-dot ' + (l.action || '') + '"></div>' +
            '<div class="activity-info"><span class="activity-user">' + esc(l.username) + '</span> <span class="activity-desc">' + esc(label) + details + '</span></div>' +
            '<div class="activity-time">' + time + '</div></div>';
    });
    return html;
}

function clearAllLogs() {
    showConfirm('Hapus SEMUA log secara permanen?', function() {
        showAlert('Proses', 'Menghapus semua log...', 'loading');
        apiCall('activity_logs', 'GET').then(function(data) {
            if (!data || Object.keys(data).length === 0) {
                hideAlert();
                showAlert('Info', 'Log sudah kosong!', 'info');
                return;
            }
            const keys = Object.keys(data);
            let count = 0;
            const promises = [];
            keys.forEach(function(key) {
                promises.push(apiCall('activity_logs/' + key, 'DELETE').then(function() { count++; }));
            });
            Promise.all(promises).then(function() {
                allActivities = [];
                activityLoaded = false;
                document.getElementById('activityListContainer').innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Log kosong</div>';
                document.getElementById('allActivityLog').innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Log kosong</div>';
                document.getElementById('suspiciousActivityLog').innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Tidak ada</div>';
                hideAlert();
                showAlert('Berhasil', count + ' log berhasil dihapus!', 'success');
            });
        }).catch(function() {
            hideAlert();
            showAlert('Error', 'Gagal menghapus log!', 'error');
        });
    });
}

function openAddUserModal() {
    const nm = new Date();
    nm.setMonth(nm.getMonth() + 1);
    document.getElementById('newExpiryDate').value = formatDate(nm);
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('newEmail').value = '';
    document.getElementById('newPhone').value = '';
    document.getElementById('newRole').value = 'Operator';
    document.getElementById('addUserModal').classList.add('show');
}

function addUserNow() {
    const u = document.getElementById('newUsername').value.trim();
    const p = document.getElementById('newPassword').value.trim();
    const em = document.getElementById('newEmail').value.trim();
    const ph = document.getElementById('newPhone').value.trim();
    const r = document.getElementById('newRole').value;
    const e = document.getElementById('newExpiryDate').value.trim();
    if (!u || !p || !e) {
        showAlert('Error', 'Username, password, dan masa aktif wajib diisi!', 'error');
        return;
    }
    if (p.length < 6) {
        showAlert('Error', 'Password minimal 6 karakter!', 'error');
        return;
    }
    showAlert('Proses', 'Menambahkan user...', 'loading');
    const userData = {
        username: u,
        password: p,
        email: em,
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
        activationStatus: 'active',
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

function deleteUser(id) {
    const u = allUsers.find(x => x.id === id);
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

function openEditUserModal(id) {
    const u = allUsers.find(x => x.id === id);
    if (!u) return;
    document.getElementById('editUserId').value = u.id;
    document.getElementById('editUsername').value = u.username;
    document.getElementById('editPassword').value = '';
    document.getElementById('editEmail').value = u.email || '';
    document.getElementById('editPhone').value = u.phone || '';
    document.getElementById('editRole').value = u.role || 'Operator';
    document.getElementById('editExpiryDate').value = u.expiry_date || '';
    document.getElementById('editIP').value = u.ip || '-';
    document.getElementById('editFP').value = u.fingerprint || '-';
    document.getElementById('editUserModal').classList.add('show');
}

function saveUserEdit() {
    const id = document.getElementById('editUserId').value;
    const u = document.getElementById('editUsername').value.trim();
    const p = document.getElementById('editPassword').value.trim();
    const em = document.getElementById('editEmail').value.trim();
    const ph = document.getElementById('editPhone').value.trim();
    const r = document.getElementById('editRole').value;
    const e = document.getElementById('editExpiryDate').value.trim();
    if (!u) {
        showAlert('Error', 'Username wajib diisi!', 'error');
        return;
    }
    showAlert('Proses', 'Menyimpan perubahan...', 'loading');
    const d = { username: u, role: r, expiry_date: e, email: em };
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

function updateUserFormat() {
    const id = document.getElementById('editUserId').value;
    const u = document.getElementById('editUsername').value.trim();
    const p = document.getElementById('editPassword').value.trim();
    const em = document.getElementById('editEmail').value.trim();
    const ph = document.getElementById('editPhone').value.trim();
    const r = document.getElementById('editRole').value;
    const e = document.getElementById('editExpiryDate').value.trim();
    const ip = document.getElementById('editIP').value.trim();
    const fp = document.getElementById('editFP').value.trim();
    if (!u) {
        showAlert('Error', 'Username wajib diisi!', 'error');
        return;
    }
    showConfirm('Update format user "' + u + '"?', function() {
        showAlert('Proses', 'Mengupdate format...', 'loading');
        const d = { username: u, role: r, expiry_date: e, phone: ph || '', email: em || '', ip: ip || '', fingerprint: fp || '' };
        if (p) d.password = p;
        apiCall('users/' + id, 'PATCH', d).then(function() {
            showAlert('Berhasil', 'Format user diupdate!', 'success');
            closeModal('editUserModal');
            loadUsers();
            activityLoaded = false;
            loadActivity();
        }).catch(function(e) {
            showAlert('Error', e.message, 'error');
        });
    });
}

function searchBanUser() {
    const q = document.getElementById('banUserSearch') ? document.getElementById('banUserSearch').value.toLowerCase() : '';
    const list = document.getElementById('banUserList');
    if (!list) return;
    const filtered = allUsers.filter(u => u.username.toLowerCase().includes(q) && u.banned === false);
    if (!filtered.length) {
        list.innerHTML = '<div style="padding:12px;color:var(--sub);text-align:center;"><i class="fas fa-search"></i> Tidak ditemukan atau sudah di-ban</div>';
        selectedBanUser = null;
        document.getElementById('banSelectedUser').innerHTML = '';
        return;
    }
    list.innerHTML = filtered.map(u => {
        const isSel = selectedBanUser && selectedBanUser.id === u.id;
        let badges = '';
        if (u.banAkses) badges += ' <span class="badge badge-yellow">AKSES</span>';
        if (u.forceLogout) badges += ' <span class="badge badge-yellow">FORCE</span>';
        return '<div class="user-check' + (isSel ? ' selected' : '') + '" onclick="selectBanUser(\'' + u.id + '\')">' + esc(u.username) + ' · ' + esc(u.role) + badges + '</div>';
    }).join('');
}

function selectBanUser(id) {
    selectedBanUser = allUsers.find(u => u.id === id);
    const el = document.getElementById('banSelectedUser');
    if (el) el.innerHTML = selectedBanUser ? 'Dipilih: <b>' + esc(selectedBanUser.username) + '</b>' : '';
    document.querySelectorAll('#banUserList .user-check').forEach(el => el.classList.remove('selected'));
    if (selectedBanUser) {
        const items = document.querySelectorAll('#banUserList .user-check');
        items.forEach(el => {
            if (el.textContent.includes(selectedBanUser.username)) el.classList.add('selected');
        });
    }
}

function executeBanUser() {
    if (!selectedBanUser) {
        showAlert('Error', 'Pilih user terlebih dahulu!', 'error');
        return;
    }
    const dur = parseInt(document.getElementById('banDuration').value);
    const name = selectedBanUser.username;
    const durText = dur === 0 ? 'PERMANEN' : 'sampai ' + new Date(Date.now() + dur).toLocaleString('id-ID');
    showConfirm('Ban user "' + name + '" ' + durText + '?', function() {
        showAlert('Proses', 'Memproses ban...', 'loading');
        const patchData = { banned: true, bannedUntil: dur === 0 ? 0 : Date.now() + dur };
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

function doAction(action, target) {
    showAlert('Proses', 'Memproses...', 'loading');
    let patchData = {};
    if (action === 'unban') {
        patchData = { banned: false, bannedUntil: 0 };
    } else if (action === 'banakses') {
        const dur = 86400000;
        patchData = { banAkses: true, banAksesUntil: Date.now() + dur };
        if (target.ip && target.ip !== '-' && target.ip !== '') {
            blockIP(target.ip);
        }
        if (target.fingerprint && target.fingerprint !== '-' && target.fingerprint !== '') {
            blockFP(target.fingerprint);
        }
    } else if (action === 'unbanakses') {
        patchData = { banAkses: false, banAksesUntil: 0 };
        if (target.ip && target.ip !== '-' && target.ip !== '') {
            unblockIP(target.ip);
        }
        if (target.fingerprint && target.fingerprint !== '-' && target.fingerprint !== '') {
            unblockFP(target.fingerprint);
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

function updateAllTables() {
    renderAllUsersList();
    renderUnbannedTable();
    renderBanAksesTable();
    renderUnbanAksesTable();
    renderForceTable();
    renderUnforceTable();
    renderProblemTable();
    updateRingkasan();
    renderWebStats();
    renderActivations();
}

function renderAllUsersList() {
    const container = document.getElementById('allUsersList');
    const count = document.getElementById('allUsersCount');
    if (!container) return;
    if (count) count.textContent = allUsers.length;
    if (!allUsers.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i> Tidak ada user</div>';
        return;
    }
    container.innerHTML = allUsers.map(u => {
        const initials = esc(u.username.substring(0, 1).toUpperCase());
        let badges = '';
        if (u.banned) badges += '<span class="badge badge-red">Banned</span> ';
        if (u.banAkses) badges += '<span class="badge badge-yellow">Ban Akses</span> ';
        if (u.forceLogout) badges += '<span class="badge badge-orange">Tangguh</span> ';
        if (u.activationStatus === 'pending') badges += '<span class="badge badge-yellow">Pending</span> ';
        if (u.activationStatus === 'accepted') badges += '<span class="badge badge-green">Aktif</span> ';
        if (u.activationStatus === 'rejected') badges += '<span class="badge badge-red">Ditolak</span> ';
        return '<div class="user-info-card">' +
            '<div class="user-info-avatar">' + initials + '</div>' +
            '<div class="user-info-details">' +
            '<div class="user-info-name">' + esc(u.username) + '</div>' +
            '<div class="user-info-meta">' +
            '<span><i class="fas fa-tag"></i> ' + esc(u.role || '-') + '</span>' +
            '<span><i class="fas fa-envelope"></i> ' + (u.email ? esc(u.email) : '-') + '</span>' +
            '<span><i class="fas fa-phone"></i> ' + (u.phone ? esc(u.phone) : '-') + '</span>' +
            '<span><i class="fas fa-calendar"></i> ' + (u.expiry_date || '-') + '</span>' +
            '</div>' +
            '<div style="margin-top:4px;">' + badges + '</div>' +
            '</div>' +
            '<div class="user-info-actions">' +
            '<button class="btn btn-outline btn-sm" onclick="openEditUserModal(\'' + u.id + '\')"><i class="fas fa-edit"></i></button>' +
            '<button class="btn btn-danger btn-sm" onclick="deleteUser(\'' + u.id + '\')"><i class="fas fa-trash"></i></button>' +
            '</div>' +
            '</div>';
    }).join('');
}

function renderActivations() {
    const pending = allUsers.filter(u => u.activationStatus === 'pending');
    const accepted = allUsers.filter(u => u.activationStatus === 'accepted');
    const rejected = allUsers.filter(u => u.activationStatus === 'rejected');
    document.getElementById('countPending').textContent = pending.length;
    document.getElementById('countAccepted').textContent = accepted.length;
    document.getElementById('countRejected').textContent = rejected.length;
    renderActivationList('pendingActivationsList', pending, 'pending');
    renderActivationList('acceptedActivationsList', accepted, 'accepted');
    renderActivationList('rejectedActivationsList', rejected, 'rejected');
}

function renderActivationList(containerId, users, status) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!users.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Tidak ada user</div>';
        return;
    }
    container.innerHTML = users.map(u => {
        const initials = esc(u.username.substring(0, 1).toUpperCase());
        let actionButtons = '';
        if (status === 'pending') {
            actionButtons = '<button class="btn btn-success btn-sm" onclick="acceptActivation(\'' + u.id + '\')"><i class="fas fa-check"></i> Terima</button> ' +
                '<button class="btn btn-danger btn-sm" onclick="rejectActivation(\'' + u.id + '\')"><i class="fas fa-times"></i> Tolak</button>';
        }
        return '<div class="user-info-card">' +
            '<div class="user-info-avatar">' + initials + '</div>' +
            '<div class="user-info-details">' +
            '<div class="user-info-name">' + esc(u.username) + '</div>' +
            '<div class="user-info-meta">' +
            '<span><i class="fas fa-envelope"></i> ' + (u.email ? esc(u.email) : '-') + '</span>' +
            '<span><i class="fas fa-phone"></i> ' + (u.phone ? esc(u.phone) : '-') + '</span>' +
            '<span><i class="fas fa-box"></i> ' + (u.paket ? esc(u.paket) : '-') + '</span>' +
            '<span><i class="fas fa-calendar"></i> ' + (u.createdAt ? new Date(u.createdAt).toLocaleDateString('id-ID') : '-') + '</span>' +
            '</div>' +
            '</div>' +
            '<div class="user-info-actions">' + actionButtons + '</div>' +
            '</div>';
    }).join('');
}

function switchActivationTab(tab) {
    currentActivationTab = tab;
    document.getElementById('tabPending').classList.remove('active');
    document.getElementById('tabAccepted').classList.remove('active');
    document.getElementById('tabRejected').classList.remove('active');
    document.getElementById('sectionPending').classList.remove('show');
    document.getElementById('sectionAccepted').classList.remove('show');
    document.getElementById('sectionRejected').classList.remove('show');
    if (tab === 'pending') {
        document.getElementById('tabPending').classList.add('active');
        document.getElementById('sectionPending').classList.add('show');
    } else if (tab === 'accepted') {
        document.getElementById('tabAccepted').classList.add('active');
        document.getElementById('sectionAccepted').classList.add('show');
    } else {
        document.getElementById('tabRejected').classList.add('active');
        document.getElementById('sectionRejected').classList.add('show');
    }
}

// ==================== FUNGSI HITUNG MASA AKTIF ====================
function calculateExpiryDate(paket) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let expiryDate = new Date(today);
    
    if (!paket) {
        // Default 7 hari jika tidak ada paket
        expiryDate.setDate(expiryDate.getDate() + 7);
        return formatDate(expiryDate);
    }
    
    const paketLower = paket.toLowerCase().trim();
    
    if (paketLower.includes('permanen') || paketLower === 'permanen') {
        return '12/31/9999';
    }
    
    // Ekstrak angka dari paket
    const angkaMatch = paket.match(/\d+/);
    if (!angkaMatch) {
        // Jika tidak ada angka, default 7 hari
        expiryDate.setDate(expiryDate.getDate() + 7);
        return formatDate(expiryDate);
    }
    
    const jumlah = parseInt(angkaMatch[0]);
    
    if (paketLower.includes('minggu') || paketLower.includes('pekan')) {
        expiryDate.setDate(expiryDate.getDate() + (jumlah * 7));
    } else if (paketLower.includes('bulan')) {
        expiryDate.setMonth(expiryDate.getMonth() + jumlah);
    } else if (paketLower.includes('tahun')) {
        expiryDate.setFullYear(expiryDate.getFullYear() + jumlah);
    } else if (paketLower.includes('hari')) {
        expiryDate.setDate(expiryDate.getDate() + jumlah);
    } else {
        // Default 7 hari jika tidak dikenal
        expiryDate.setDate(expiryDate.getDate() + 7);
    }
    
    return formatDate(expiryDate);
}

// ==================== ACCEPT ACTIVATION (FIX) ====================
function acceptActivation(id) {
    const u = allUsers.find(x => x.id === id);
    if (!u) return;
    
    let paket = u.paket || '';
    let expiryDate = u.expiry_date || '';
    
    // Jika tidak ada expiry_date, hitung dari paket
    if (!expiryDate || expiryDate === '') {
        expiryDate = calculateExpiryDate(paket);
    }
    
    const paketDisplay = paket || 'Tidak ada paket';
    
    showConfirm('Terima aktivasi akun "' + u.username + '"?\nPaket: ' + paketDisplay + '\nMasa aktif: ' + expiryDate, function() {
        showAlert('Proses', 'Menerima aktivasi...', 'loading');
        
        const updateData = {
            activationStatus: 'accepted',
            isActive: true,
            banned: false,
            banAkses: false,
            forceLogout: false,
            expiry_date: expiryDate
        };
        
        apiCall('users/' + id, 'PATCH', updateData).then(function() {
            showAlert('Berhasil', 'Akun "' + u.username + '" telah diaktifkan!\nMasa aktif: ' + expiryDate, 'success');
            loadUsers();
        }).catch(function(e) {
            showAlert('Error', e.message, 'error');
        });
    });
}

function rejectActivation(id) {
    const u = allUsers.find(x => x.id === id);
    if (!u) return;
    showConfirm('Tolak aktivasi akun "' + u.username + '"?', function() {
        showAlert('Proses', 'Menolak aktivasi...', 'loading');
        apiCall('users/' + id, 'PATCH', { activationStatus: 'rejected', isActive: false }).then(function() {
            showAlert('Berhasil', 'Akun "' + u.username + '" telah ditolak!', 'success');
            loadUsers();
        }).catch(function(e) {
            showAlert('Error', e.message, 'error');
        });
    });
}

function renderUnbannedTable() {
    const tbody = document.getElementById('unbannedUsersTable');
    if (!tbody) return;
    const unbanned = allUsers.filter(u => u.banned === true);
    if (!unbanned.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Tidak ada</td></tr>';
        return;
    }
    tbody.innerHTML = unbanned.map(u => {
        const durasi = u.bannedUntil === 0 ? 'Permanen' : new Date(u.bannedUntil).toLocaleString('id-ID');
        return '<tr><td><b>' + esc(u.username) + '</b></td><td>' + esc(u.role || '-') + '</td><td>' + durasi + '</td><td><button class="btn btn-success btn-xs" onclick="doAction(\'unban\', allUsers.find(function(x){return x.id===\'' + u.id + '\'}))">Unban</button></td></tr>';
    }).join('');
}

function renderBanAksesTable() {
    const tbody = document.getElementById('banaksesUsersTable');
    if (!tbody) return;
    const users = allUsers.filter(u => u.banAkses === false);
    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Tidak ada</td></tr>';
        return;
    }
    tbody.innerHTML = users.map(u => {
        let statusBadge = '';
        if (u.banned) statusBadge += '<span class="status-badge banned">BANNED</span> ';
        if (u.forceLogout) statusBadge += '<span class="status-badge force">TANGGUH</span> ';
        const ipDisplay = u.ip && u.ip !== '-' ? '<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">' + esc(u.ip) + '</code>' : '<span style="color:var(--sub);">-</span>';
        const fpDisplay = u.fingerprint && u.fingerprint !== '-' ? '<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:11px;">' + esc(u.fingerprint) + '</code>' : '<span style="color:var(--sub);">-</span>';
        return '<tr><td><b>' + esc(u.username) + '</b> ' + statusBadge + '</td><td>' + esc(u.role || '-') + '</td><td>' + ipDisplay + '</td><td>' + fpDisplay + '</td><td><span class="badge badge-green">Belum</span></td><td><button class="btn btn-danger btn-xs" onclick="doAction(\'banakses\', allUsers.find(function(x){return x.id===\'' + u.id + '\'}))">Ban Akses</button></td></tr>';
    }).join('');
}

function renderUnbanAksesTable() {
    const tbody = document.getElementById('unbanaksesUsersTable');
    if (!tbody) return;
    const unbanakses = allUsers.filter(u => u.banAkses === true);
    if (!unbanakses.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Tidak ada</td></tr>';
        return;
    }
    tbody.innerHTML = unbanakses.map(u => {
        const ipDisplay = u.ip && u.ip !== '-' ? '<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">' + esc(u.ip) + '</code>' : '<span style="color:var(--sub);">-</span>';
        const fpDisplay = u.fingerprint && u.fingerprint !== '-' ? '<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:11px;">' + esc(u.fingerprint) + '</code>' : '<span style="color:var(--sub);">-</span>';
        return '<tr><td><b>' + esc(u.username) + '</b></td><td>' + esc(u.role || '-') + '</td><td>' + ipDisplay + '</td><td>' + fpDisplay + '</td><td><button class="btn btn-success btn-xs" onclick="doAction(\'unbanakses\', allUsers.find(function(x){return x.id===\'' + u.id + '\'}))">Unban Akses</button></td></tr>';
    }).join('');
}

function renderForceTable() {
    const tbody = document.getElementById('forceUsersTable');
    if (!tbody) return;
    const users = allUsers.filter(u => u.forceLogout === false);
    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Tidak ada</td></tr>';
        return;
    }
    tbody.innerHTML = users.map(u => {
        let statusBadge = '';
        if (u.banned) statusBadge += '<span class="status-badge banned">BANNED</span> ';
        if (u.banAkses) statusBadge += '<span class="status-badge banakses">BAN AKSES</span> ';
        return '<tr><td><b>' + esc(u.username) + '</b> ' + statusBadge + '</td><td>' + esc(u.role || '-') + '</td><td><span class="badge badge-green">Belum</span></td><td><button class="btn btn-danger btn-xs" onclick="doAction(\'force\', allUsers.find(function(x){return x.id===\'' + u.id + '\'}))">Tangguhkan</button></td></tr>';
    }).join('');
}

function renderUnforceTable() {
    const tbody = document.getElementById('unforceUsersTable');
    if (!tbody) return;
    const unforce = allUsers.filter(u => u.forceLogout === true);
    if (!unforce.length) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Tidak ada</td></tr>';
        return;
    }
    tbody.innerHTML = unforce.map(u => {
        return '<tr><td><b>' + esc(u.username) + '</b></td><td>' + esc(u.role || '-') + '</td><td><button class="btn btn-success btn-xs" onclick="doAction(\'unforce\', allUsers.find(function(x){return x.id===\'' + u.id + '\'}))">Lepas Tangguh</button></td></tr>';
    }).join('');
}

function renderProblemTable() {
    const tbody = document.getElementById('problemUsersTable');
    if (!tbody) return;
    const problems = allUsers.filter(u => u.banned === true || u.banAkses === true || u.forceLogout === true);
    if (!problems.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Tidak ada</td></tr>';
        return;
    }
    tbody.innerHTML = problems.map(u => {
        let badges = '';
        if (u.banned) badges += '<span class="badge badge-red">Banned</span> ';
        if (u.banAkses) badges += '<span class="badge badge-yellow">Ban Akses</span> ';
        if (u.forceLogout) badges += '<span class="badge badge-orange">Tangguh</span> ';
        return '<tr><td><b>' + esc(u.username) + '</b></td><td>' + esc(u.role || '-') + '</td><td>' + badges + '</td><td><button class="btn btn-outline btn-xs" onclick="openEditUserModal(\'' + u.id + '\')">Edit</button></td></tr>';
    }).join('');
}

function renderWebStats() {
    const total = allUsers.length;
    const active = allUsers.filter(u => !u.banned && !u.banAkses && !u.forceLogout && calculateDaysLeft(u.expiry_date) > 0).length;
    const banned = allUsers.filter(u => u.banned).length;
    const banAkses = allUsers.filter(u => u.banAkses).length;
    const pending = allUsers.filter(u => u.activationStatus === 'pending').length;
    const totalLogins = allActivities.filter(l => l.action === 'login_success').length;
    document.getElementById('webStatTotalUsers').textContent = total;
    document.getElementById('webStatActiveUsers').textContent = active;
    document.getElementById('webStatBannedUsers').textContent = banned;
    document.getElementById('webStatBanAkses').textContent = banAkses;
    document.getElementById('webStatPending').textContent = pending;
    document.getElementById('webStatTotalLogins').textContent = totalLogins;
    document.getElementById('distAktif').textContent = active;
    document.getElementById('distBanned').textContent = banned;
    document.getElementById('distBanAkses').textContent = banAkses;
    document.getElementById('distPending').textContent = pending;
}

function updateRingkasan() {
    const active = allUsers.filter(u => !u.banned && !u.banAkses && !u.forceLogout && calculateDaysLeft(u.expiry_date) > 0).length;
    const banned = allUsers.filter(u => u.banned).length;
    const banAkses = allUsers.filter(u => u.banAkses).length;
    const pending = allUsers.filter(u => u.activationStatus === 'pending').length;
    document.getElementById('ringkasanAktif').textContent = active;
    document.getElementById('ringkasanBanned').textContent = banned;
    document.getElementById('ringkasanBanAkses').textContent = banAkses;
    document.getElementById('ringkasanPending').textContent = pending;
}

function loadMaintenanceStatus() {
    apiCall('maintenance_status', 'GET').then(function(data) {
        if (data && data.maintenance) {
            document.getElementById('maintenanceStatusBadge').textContent = 'ON';
            document.getElementById('maintenanceStatusBadge').className = 'badge badge-red';
            document.getElementById('maintenanceTitle').value = data.title || '';
            document.getElementById('maintenanceMessage').value = data.message || '';
            document.getElementById('maintenanceUntil').value = data.until || 0;
        } else {
            document.getElementById('maintenanceStatusBadge').textContent = 'OFF';
            document.getElementById('maintenanceStatusBadge').className = 'badge badge-green';
        }
    });
}

function enableMaintenance() {
    const title = document.getElementById('maintenanceTitle').value.trim();
    const message = document.getElementById('maintenanceMessage').value.trim();
    const until = parseInt(document.getElementById('maintenanceUntil').value) || 0;
    showAlert('Proses', 'Mengaktifkan maintenance...', 'loading');
    apiCall('maintenance_status', 'PUT', { maintenance: true, title: title || '', message: message || '', until: until }).then(function() {
        showAlert('Berhasil', 'Maintenance diaktifkan!', 'success');
        loadMaintenanceStatus();
    }).catch(function(e) {
        showAlert('Error', e.message, 'error');
    });
}

function disableMaintenance() {
    showConfirm('Nonaktifkan maintenance?', function() {
        showAlert('Proses', 'Menonaktifkan...', 'loading');
        apiCall('maintenance_status', 'PUT', { maintenance: false }).then(function() {
            showAlert('Berhasil', 'Maintenance dinonaktifkan!', 'success');
            loadMaintenanceStatus();
        }).catch(function(e) {
            showAlert('Error', e.message, 'error');
        });
    });
}

const pathList = [
    { name: 'Check Blocked', current: 'check_blocked' },
    { name: 'Check Account Status', current: 'check_account_status' },
    { name: 'Login', current: 'login' },
    { name: 'Login Failed', current: 'login_failed' },
    { name: 'Login Success', current: 'login_success' },
    { name: 'Users', current: 'users' },
    { name: 'Blocked IPs', current: 'blocked_ips' },
    { name: 'Blocked FP', current: 'blocked_fp' },
    { name: 'Login Attempts', current: 'login_attempts' },
    { name: 'Activity Logs', current: 'activity_logs' },
    { name: 'Transactions', current: 'transactions' },
    { name: 'Maintenance Status', current: 'maintenance_status' },
    { name: 'Access Key', current: 'access_key' },
    { name: 'Action Keys', current: 'action_keys' },
    { name: 'IP Whitelist', current: 'ip_whitelist' },
    { name: 'FP Whitelist', current: 'fp_whitelist' },
    { name: 'Block IP', current: 'block_ip' },
    { name: 'Block FP', current: 'block_fp' }
];

function loadPathManager() {
    const tbody = document.getElementById('pathManagerTable');
    if (!tbody) return;
    tbody.innerHTML = pathList.map(p => {
        return '<tr><td><b>' + p.name + '</b></td><td><code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">' + p.current + '</code></td><td><input type="text" id="newPath_' + p.current.replace(/\./g, '_') + '" placeholder="Path baru..." style="padding:6px;border:1px solid var(--border);border-radius:4px;width:100%;"></td><td><button class="btn btn-primary btn-xs" onclick="updatePath(\'' + p.current + '\')"><i class="fas fa-save"></i> Simpan</button></td></tr>';
    }).join('');
}

function updatePath(oldPath) {
    const inputId = 'newPath_' + oldPath.replace(/\./g, '_');
    const newPath = document.getElementById(inputId).value.trim();
    if (!newPath) {
        showAlert('Error', 'Path baru wajib diisi!', 'error');
        return;
    }
    showConfirm('Ganti path "' + oldPath + '" menjadi "' + newPath + '"?', function() {
        showAlert('Proses', 'Mengupdate path...', 'loading');
        apiCall('path_aliases', 'POST', { oldPath: oldPath, newPath: newPath }).then(function() {
            showAlert('Berhasil', 'Path berhasil diupdate!', 'success');
            const item = pathList.find(p => p.current === oldPath);
            if (item) item.current = newPath;
            loadPathManager();
        }).catch(function(e) {
            showAlert('Error', e.message, 'error');
        });
    });
}

function startPasswordMigration() {
    showConfirm('Mulai migrasi password?', function() {
        const progressEl = document.getElementById('migrationProgress');
        const resultEl = document.getElementById('migrationResult');
        progressEl.classList.add('show');
        resultEl.style.display = 'none';
        showAlert('Proses', 'Migrasi password dimulai...', 'loading');
        apiCall('migrate_passwords', 'POST', {}).then(function(result) {
            progressEl.classList.remove('show');
            hideAlert();
            if (result && result.success) {
                resultEl.className = 'migration-result success';
                resultEl.style.display = 'block';
                resultEl.innerHTML = '<i class="fas fa-check-circle"></i> <b>Migrasi berhasil!</b><br>Berhasil: <b>' + (result.migrated || 0) + '</b><br>Dilewati: <b>' + (result.skipped || 0) + '</b><br>Gagal: <b>' + (result.failed || 0) + '</b>';
                showAlert('Berhasil', 'Migrasi selesai!', 'success');
                loadUsers();
            } else {
                resultEl.className = 'migration-result error';
                resultEl.style.display = 'block';
                resultEl.innerHTML = '<i class="fas fa-times-circle"></i> <b>Migrasi gagal!</b>';
                showAlert('Error', 'Migrasi gagal!', 'error');
            }
        }).catch(function(e) {
            progressEl.classList.remove('show');
            hideAlert();
            resultEl.className = 'migration-result error';
            resultEl.style.display = 'block';
            resultEl.innerHTML = '<i class="fas fa-times-circle"></i> <b>Error:</b> ' + esc(e.message);
            showAlert('Error', e.message, 'error');
        });
    });
}

function showSettingsKeyOverlay() {
    document.getElementById('settingsActionKeyInput').value = '';
    document.getElementById('settingsKeyOverlay').classList.add('show');
}

function closeSettingsKeyOverlay() {
    document.getElementById('settingsKeyOverlay').classList.remove('show');
    document.getElementById('settingsActionKeyInput').value = '';
}

function verifySettingsActionKey() {
    const key = document.getElementById('settingsActionKeyInput').value.trim();
    if (!key) {
        showAlert('Error', 'Masukkan key aksi!', 'error');
        return;
    }
    apiCall('action_keys', 'GET').then(function(data) {
        let valid = false;
        for (let k in data) {
            if (data[k] && data[k].key === key) {
                valid = true;
                break;
            }
        }
        if (valid) {
            settingsKeyVerified = true;
            closeSettingsKeyOverlay();
            showAlert('Berhasil', 'Key aksi valid!', 'success');
            loadSettings();
        } else {
            showAlert('Error', 'Key aksi salah!', 'error');
        }
    });
}

function loadSettings() {
    if (!settingsKeyVerified) return;
    apiCall('admin/auth', 'GET').then(function(r) {
        if (r) {
            document.getElementById('settingsEmail').value = r.email || '••••••••@••••••••';
            document.getElementById('settingsPassword').value = '••••••••';
            document.getElementById('displayAdminKey').value = '••••••••';
        }
    });
    loadActionKeys();
    loadWhitelistIP();
    loadWhitelistFP();
    checkActionKeyExists();
    loadServerKeyFromStorage();
}

function togglePassword() {
    const el = document.getElementById('settingsPassword');
    const icon = document.getElementById('togglePassIcon');
    if (!settingsKeyVerified) {
        showAlert('Error', 'Verifikasi key aksi!', 'error');
        return;
    }
    if (el.type === 'password') {
        el.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
        setTimeout(function() {
            el.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }, 3000);
    } else {
        el.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

function openChangeEmailModal() {
    if (!settingsKeyVerified) {
        showAlert('Error', 'Verifikasi key aksi!', 'error');
        return;
    }
    document.getElementById('newEmailChange').value = '';
    document.getElementById('changeEmailModal').classList.add('show');
}

function changeEmail() {
    const email = document.getElementById('newEmailChange').value.trim();
    if (!email) {
        showAlert('Error', 'Email wajib diisi!', 'error');
        return;
    }
    showAlert('Proses', 'Mengupdate email...', 'loading');
    apiCall('admin/update_email', 'PATCH', { email: email }).then(function() {
        showAlert('Berhasil', 'Email diupdate!', 'success');
        closeModal('changeEmailModal');
        loadSettings();
    }).catch(function(e) {
        showAlert('Error', e.message, 'error');
    });
}

function openChangePasswordModal() {
    if (!settingsKeyVerified) {
        showAlert('Error', 'Verifikasi key aksi!', 'error');
        return;
    }
    document.getElementById('newPasswordSettings').value = '';
    document.getElementById('confirmNewPassword').value = '';
    document.getElementById('changePasswordModal').classList.add('show');
}

function changePassword() {
    const pass = document.getElementById('newPasswordSettings').value.trim();
    const confirm = document.getElementById('confirmNewPassword').value.trim();
    if (!pass || pass.length < 6) {
        showAlert('Error', 'Password minimal 6 karakter!', 'error');
        return;
    }
    if (pass !== confirm) {
        showAlert('Error', 'Password tidak cocok!', 'error');
        return;
    }
    showAlert('Proses', 'Mengupdate password...', 'loading');
    apiCall('admin/update_password', 'PATCH', { password: pass }).then(function() {
        showAlert('Berhasil', 'Password diupdate!', 'success');
        closeModal('changePasswordModal');
        loadSettings();
    }).catch(function(e) {
        showAlert('Error', e.message, 'error');
    });
}

function checkActionKeyExists() {
    if (actionKeyChecked) return;
    apiCall('action_keys', 'GET').then(function(data) {
        let count = 0;
        for (let k in data) {
            if (data[k] && data[k].key) count++;
        }
        if (count === 0) {
            apiCall('action_keys', 'POST', { key: 'RevanStore2026', createdAt: Date.now(), isDefault: true }).then(function() {
                loadActionKeys();
            });
        }
        actionKeyChecked = true;
    });
}

function addActionKey() {
    if (!settingsKeyVerified) {
        showAlert('Error', 'Verifikasi key aksi!', 'error');
        return;
    }
    const key = document.getElementById('newActionKey').value.trim();
    if (!key) {
        showAlert('Error', 'Masukkan key!', 'error');
        return;
    }
    apiCall('action_keys', 'POST', { key: key, createdAt: Date.now() }).then(function() {
        showAlert('Berhasil', 'Key ditambahkan!', 'success');
        document.getElementById('newActionKey').value = '';
        loadActionKeys();
    }).catch(function(e) {
        showAlert('Error', e.message, 'error');
    });
}

function loadActionKeys() {
    if (!settingsKeyVerified) {
        document.getElementById('actionKeysTable').innerHTML = '<tr><td colspan="3" style="text-align:center;">Verifikasi key aksi</td></tr>';
        return;
    }
    apiCall('action_keys', 'GET').then(function(data) {
        let html = '';
        for (let k in data) {
            if (data[k] && data[k].key) {
                const masked = '••••' + data[k].key.substring(data[k].key.length - 4);
                const date = data[k].createdAt ? new Date(data[k].createdAt).toLocaleString('id-ID') : '-';
                html += '<tr><td>' + masked + '</td><td>' + date + '</td><td>' + (data[k].isDefault ? '<span class="badge badge-blue">Default</span>' : '<button class="btn btn-danger btn-xs" onclick="deleteActionKey(\'' + k + '\')"><i class="fas fa-trash"></i></button>') + '</td></tr>';
            }
        }
        document.getElementById('actionKeysTable').innerHTML = html || '<tr><td colspan="3" style="text-align:center;">Tidak ada key</td></tr>';
    });
}

function deleteActionKey(id) {
    showConfirm('Hapus key ini?', function() {
        apiCall('action_keys/' + id, 'DELETE').then(function() {
            showAlert('Berhasil', 'Key dihapus!', 'success');
            loadActionKeys();
        });
    });
}

function addWhitelistIP() {
    if (!settingsKeyVerified) {
        showAlert('Error', 'Verifikasi key aksi!', 'error');
        return;
    }
    const ip = document.getElementById('newWhitelistIP').value.trim();
    if (!ip) {
        showAlert('Error', 'Masukkan IP!', 'error');
        return;
    }
    apiCall('ip_whitelist', 'POST', { ip: ip, createdAt: Date.now() }).then(function() {
        showAlert('Berhasil', 'IP ditambahkan!', 'success');
        document.getElementById('newWhitelistIP').value = '';
        loadWhitelistIP();
    });
}

function loadWhitelistIP() {
    if (!settingsKeyVerified) {
        document.getElementById('ipWhitelistTable').innerHTML = '<tr><td colspan="3" style="text-align:center;">Verifikasi key aksi</td></tr>';
        return;
    }
    apiCall('ip_whitelist', 'GET').then(function(data) {
        let html = '';
        for (let k in data) {
            if (data[k] && data[k].ip) {
                const date = data[k].createdAt ? new Date(data[k].createdAt).toLocaleString('id-ID') : '-';
                html += '<tr><td>' + data[k].ip + '</td><td>' + date + '</td><td><button class="btn btn-danger btn-xs" onclick="deleteWhitelistIP(\'' + k + '\')"><i class="fas fa-trash"></i></button></td></tr>';
            }
        }
        document.getElementById('ipWhitelistTable').innerHTML = html || '<tr><td colspan="3" style="text-align:center;">Tidak ada IP</td></tr>';
    });
}

function deleteWhitelistIP(id) {
    showConfirm('Hapus IP?', function() {
        apiCall('ip_whitelist/' + id, 'DELETE').then(function() {
            showAlert('Berhasil', 'IP dihapus!', 'success');
            loadWhitelistIP();
        });
    });
}

function addWhitelistFP() {
    if (!settingsKeyVerified) {
        showAlert('Error', 'Verifikasi key aksi!', 'error');
        return;
    }
    const fp = document.getElementById('newWhitelistFP').value.trim();
    if (!fp) {
        showAlert('Error', 'Masukkan FP!', 'error');
        return;
    }
    apiCall('fp_whitelist', 'POST', { fp: fp, createdAt: Date.now() }).then(function() {
        showAlert('Berhasil', 'FP ditambahkan!', 'success');
        document.getElementById('newWhitelistFP').value = '';
        loadWhitelistFP();
    });
}

function loadWhitelistFP() {
    if (!settingsKeyVerified) {
        document.getElementById('fpWhitelistTable').innerHTML = '<tr><td colspan="3" style="text-align:center;">Verifikasi key aksi</td></tr>';
        return;
    }
    apiCall('fp_whitelist', 'GET').then(function(data) {
        let html = '';
        for (let k in data) {
            if (data[k] && data[k].fp) {
                const masked = data[k].fp;
                const date = data[k].createdAt ? new Date(data[k].createdAt).toLocaleString('id-ID') : '-';
                html += '<tr><td><code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:11px;">' + masked + '</code></td><td>' + date + '</td><td><button class="btn btn-danger btn-xs" onclick="deleteWhitelistFP(\'' + k + '\')"><i class="fas fa-trash"></i></button></td></tr>';
            }
        }
        document.getElementById('fpWhitelistTable').innerHTML = html || '<tr><td colspan="3" style="text-align:center;">Tidak ada FP</td></tr>';
    });
}

function deleteWhitelistFP(id) {
    showConfirm('Hapus FP?', function() {
        apiCall('fp_whitelist/' + id, 'DELETE').then(function() {
            showAlert('Berhasil', 'FP dihapus!', 'success');
            loadWhitelistFP();
        });
    });
}

function getAdminKeyFromServer() {
    if (!currentAdmin) {
        showAlert('Error', 'Login dulu!', 'error');
        return;
    }
    apiCall('admin/get_key', 'GET', {}).then(function(result) {
        if (result && result.adminKey) {
            serverAdminKey = result.adminKey;
            document.getElementById('serverAdminKey').value = 'Key didapat!';
            document.getElementById('serverKeyStatus').innerHTML = 'Berhasil!';
            localStorage.setItem('server_admin_key', result.adminKey);
            showAlert('Berhasil', 'Key diambil!', 'success');
        } else {
            showAlert('Error', 'Gagal ambil key!', 'error');
        }
    });
}

function clearServerKey() {
    serverAdminKey = null;
    localStorage.removeItem('server_admin_key');
    document.getElementById('serverAdminKey').value = 'Belum login';
    document.getElementById('serverKeyStatus').innerHTML = 'Key dihapus.';
}

function loadServerKeyFromStorage() {
    const saved = localStorage.getItem('server_admin_key');
    if (saved) {
        document.getElementById('serverAdminKey').value = 'Key tersedia';
        document.getElementById('serverKeyStatus').innerHTML = 'Key tersedia di localStorage';
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    document.querySelectorAll('.modal').forEach(m => {
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
    document.getElementById('settingsActionKeyInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') verifySettingsActionKey();
    });
    document.addEventListener('click', function() {
        if (currentAdmin && sessionTimer) {
            clearTimeout(sessionTimer);
            sessionTimer = setTimeout(() => {
                if (currentAdmin) {
                    logout();
                    showAlert('Sesi Berakhir', '30 menit idle.', 'info');
                }
            }, 1800000);
        }
    });
    
    const isBlocked = await checkBlockedOnLoad();
    if (isBlocked) return;
    
    const savedSession = localStorage.getItem('sessionId');
    if (savedSession) {
        sessionId = savedSession;
        try {
            await loadUsers();
            await loadActivity();
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('loginWrapper').style.display = 'none';
            document.getElementById('appContainer').style.display = 'block';
            currentAdmin = 'Admin';
            document.getElementById('loggedUser').textContent = 'Admin';
            document.getElementById('navbarUserName').textContent = 'Admin';
            switchPage('dashboard');
        } catch (e) {
            sessionId = null;
            localStorage.removeItem('sessionId');
        }
    }
    if (!fingerprint) fingerprint = await getFingerprint();
});

window.verifyKey = verifyKey;
window.login = login;
window.logout = logout;
window.showBlockedScreen = showBlockedScreen;
window.checkBlockedOnLoad = checkBlockedOnLoad;
window.blockIP = blockIP;
window.blockFP = blockFP;
window.unblockIP = unblockIP;
window.unblockFP = unblockFP;
window.switchPage = switchPage;
window.toggleSidebar = toggleSidebar;
window.showAlert = showAlert;
window.hideAlert = hideAlert;
window.showConfirm = showConfirm;
window.closeModal = closeModal;
window.verifySettingsActionKey = verifySettingsActionKey;
window.closeSettingsKeyOverlay = closeSettingsKeyOverlay;
window.openAddUserModal = openAddUserModal;
window.addUserNow = addUserNow;
window.deleteUser = deleteUser;
window.openEditUserModal = openEditUserModal;
window.saveUserEdit = saveUserEdit;
window.updateUserFormat = updateUserFormat;
window.searchBanUser = searchBanUser;
window.selectBanUser = selectBanUser;
window.executeBanUser = executeBanUser;
window.doAction = doAction;
window.clearAllLogs = clearAllLogs;
window.switchActivationTab = switchActivationTab;
window.acceptActivation = acceptActivation;
window.rejectActivation = rejectActivation;
window.enableMaintenance = enableMaintenance;
window.disableMaintenance = disableMaintenance;
window.updatePath = updatePath;
window.startPasswordMigration = startPasswordMigration;
window.togglePassword = togglePassword;
window.openChangeEmailModal = openChangeEmailModal;
window.changeEmail = changeEmail;
window.openChangePasswordModal = openChangePasswordModal;
window.changePassword = changePassword;
window.addActionKey = addActionKey;
window.deleteActionKey = deleteActionKey;
window.addWhitelistIP = addWhitelistIP;
window.deleteWhitelistIP = deleteWhitelistIP;
window.addWhitelistFP = addWhitelistFP;
window.deleteWhitelistFP = deleteWhitelistFP;
window.getAdminKeyFromServer = getAdminKeyFromServer;
window.clearServerKey = clearServerKey;