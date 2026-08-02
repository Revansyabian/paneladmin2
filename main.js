// main.js
(function() {
    'use strict';

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

    // ==================== KONFIGURASI ====================
    var API_URL = '/api/revanstore';
    var ADMIN_KEY = 'dhagwxwhu:f4afc5aa03e73130f5e055dfe6a708c4dc40759b';
    var API_KEY = '835a198a-7843-4e13-a085-331eb891100e';
    var currentAdmin = null;
    var allUsers = [];
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
    var currentSubTab = null;

    // ==================== DOM REFS ====================
    var $ = function(id) { return document.getElementById(id); };
    var alertOverlay = $('alertOverlay');
    var alertIcon = $('alertIcon');
    var alertTitle = $('alertTitle');
    var alertMessage = $('alertMessage');
    var confirmOverlay = $('confirmOverlay');
    var confirmMessage = $('confirmMessage');
    var confirmYes = $('confirmYes');
    var confirmNo = $('confirmNo');
    var actionModal = $('actionModal');
    var actionModalTitle = $('actionModalTitle');
    var actionModalBody = $('actionModalBody');
    var detailModal = $('detailModal');
    var detailModalTitle = $('detailModalTitle');
    var detailModalBody = $('detailModalBody');
    var mainContainer = $('mainContainer');
    var keyScreen = $('keyScreen');
    var loginScreen = $('loginScreen');
    var adminPanel = $('adminPanel');
    var accessKeyInput = $('accessKey');
    var loginEmail = $('loginEmail');
    var loginPassword = $('loginPassword');
    var loggedUser = $('loggedUser');
    var clockDisplay = $('clockDisplay');
    var statTotal = $('statTotal');
    var statActive = $('statActive');
    var statBanned = $('statBanned');
    var statExpired = $('statExpired');
    var activityListContainer = $('activityListContainer');

    // ==================== UTILITY ====================
    function esc(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function formatDate(d) { return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') + '/' + d.getFullYear(); }
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
    function debounce(key, fn, delay) {
        if (pendingRequests[key]) return;
        pendingRequests[key] = true;
        fn().finally(function() {
            setTimeout(function() { pendingRequests[key] = false; }, delay || 1500);
        });
    }
    function findUser(username) {
        return allUsers.find(function(u) { return u.username && u.username.toLowerCase() === username.toLowerCase(); });
    }

    // ==================== ALERT SYSTEM ====================
    function showAlert(t, m, type) {
        if (!alertOverlay) return;
        alertTitle.textContent = t;
        alertMessage.textContent = m;
        alertIcon.innerHTML = '';
        if (type === 'loading') {
            alertIcon.innerHTML = '<div class="spinner"></div>';
        } else if (type === 'success') {
            alertIcon.innerHTML = '<div style="font-size:40px;color:#10b981"><i class="fas fa-check-circle"></i></div>';
        } else if (type === 'error') {
            alertIcon.innerHTML = '<div style="font-size:40px;color:#ef4444"><i class="fas fa-times-circle"></i></div>';
        } else {
            alertIcon.innerHTML = '<div style="font-size:40px;color:#00bfff"><i class="fas fa-info-circle"></i></div>';
        }
        alertOverlay.classList.add('show');
        if (alertTimeout) clearTimeout(alertTimeout);
        if (type !== 'loading') {
            alertTimeout = setTimeout(function() {
                alertOverlay.classList.remove('show');
            }, 1800);
        }
    }
    function hideAlert() {
        if (alertOverlay) alertOverlay.classList.remove('show');
    }

    // ==================== CONFIRM SYSTEM ====================
    function showConfirm(msg, cb) {
        if (!confirmOverlay) {
            if (confirm(msg)) cb();
            return;
        }
        confirmMessage.textContent = msg;
        confirmOverlay.style.display = 'flex';
        confirmYes.onclick = function() {
            confirmOverlay.style.display = 'none';
            cb();
        };
        confirmNo.onclick = function() {
            confirmOverlay.style.display = 'none';
        };
        confirmOverlay.onclick = function(e) {
            if (e.target === confirmOverlay) confirmOverlay.style.display = 'none';
        };
    }

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

    // ==================== API CALL ====================
    async function apiCall(path, method, data) {
        if (!fingerprint) fingerprint = await getFingerprint();
        var payload = CryptoJS.AES.encrypt(JSON.stringify({ path: path, method: method, data: data }), ADMIN_KEY).toString();
        var res = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY,
                'X-Fingerprint': fingerprint
            },
            body: JSON.stringify({ data: payload })
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

    // ==================== BLOCKED SCREEN ====================
    function showBlockedScreen() {
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:20px;font-family:\'Segoe UI\',sans-serif;position:fixed;top:0;left:0;width:100%;height:100vh;background:#f8fafc"><div style="background:#fff;border-radius:20px;padding:40px 30px;max-width:420px;width:100%;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.04);border:1px solid #e2e8f0"><div style="font-size:56px;color:#ef4444;margin-bottom:18px"><i class="fas fa-lock"></i></div><h1 style="color:#1a1a2e;font-size:22px;margin-bottom:8px">AKSES DITOLAK</h1><p style="color:#64748b;font-size:14px">Maaf, akses diblokir.</p></div></div>';
    }

    // ==================== VERIFY KEY ====================
    async function verifyKey() {
        var key = accessKeyInput.value.trim();
        if (!key) return showAlert('Error', 'Key wajib diisi', 'error');
        showAlert('Verifikasi', 'Memeriksa key...', 'loading');
        try {
            var r = await apiCall('access_key', 'GET');
            if (r && r.key === key) {
                keyAttempts = 0;
                keyScreen.style.display = 'none';
                loginScreen.style.display = 'block';
                accessKeyInput.value = '';
                hideAlert();
                showAlert('Berhasil', 'Key valid!', 'success');
            } else {
                keyAttempts++;
                accessKeyInput.value = '';
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

    // ==================== LOGIN ====================
    async function login() {
        if (loginBlocked) {
            var rem = blockTimer ? Math.ceil((blockTimer - Date.now()) / 60000) : 0;
            if (rem <= 0) {
                loginBlocked = false;
                blockTimer = null;
            } else {
                return showAlert('Diblokir', 'Coba lagi ' + rem + ' menit.', 'error');
            }
        }
        var email = loginEmail.value.trim();
        var pass = loginPassword.value.trim();
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
                loggedUser.textContent = email;
                loginScreen.style.display = 'none';
                adminPanel.style.display = 'block';
                mainContainer.style.maxWidth = '840px';
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

    // ==================== LOGOUT ====================
    function logout() {
        currentAdmin = null;
        stopBg();
        if (sessionTimer) clearTimeout(sessionTimer);
        adminPanel.style.display = 'none';
        loginScreen.style.display = 'block';
        keyScreen.style.display = 'none';
        loginPassword.value = '';
        mainContainer.style.maxWidth = '440px';
        showAlert('Logout', 'Anda telah logout.', 'info');
    }

    // ==================== BACKGROUND TASKS ====================
    function startBg() {
        updateClock();
        clockInterval = setInterval(updateClock, 30000);
        statsInterval = setInterval(function() {
            if (currentAdmin) {
                loadUsers();
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
        clockDisplay.textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }

    // ==================== LOAD USERS ====================
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

    // ==================== UPDATE STATS ====================
    function updateStats() {
        statTotal.textContent = allUsers.length;
        statActive.textContent = allUsers.filter(function(u) {
            return !u.banned && !u.banAkses && calculateDaysLeft(u.expiry_date) > 0;
        }).length;
        statBanned.textContent = allUsers.filter(function(u) {
            return u.banned || u.banAkses;
        }).length;
        statExpired.textContent = allUsers.filter(function(u) {
            return !u.banned && !u.banAkses && calculateDaysLeft(u.expiry_date) <= 0 && calculateDaysLeft(u.expiry_date) !== 999999;
        }).length;
    }

    // ==================== LOAD ACTIVITY ====================
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
            if (!logs.length) {
                activityListContainer.innerHTML = '<div class="empty-state">Belum ada aktivitas</div>';
                return;
            }
            var h = '';
            logs.forEach(function(l) {
                var time = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
                var lb = {
                    login: 'Login',
                    topup: 'Top Up',
                    kuras: 'Kuras',
                    banned: 'Ban User',
                    unbanned: 'Unban User',
                    ban_akses: 'Ban Akses',
                    unban_akses: 'Unban Akses',
                    deleted: 'Hapus User'
                }[l.action] || l.action;
                h += '<div class="activity-item"><div class="activity-dot ' + (l.action || '') + '"></div><div class="activity-info"><span class="activity-user">' + esc(l.username || '-') + '</span> <span class="activity-desc">' + lb + (l.details ? ' — ' + l.details : '') + '</span></div><div class="activity-time">' + time + '</div></div>';
            });
            activityListContainer.innerHTML = h;
        } catch (e) {}
    }

    // ==================== ACTION MODAL ====================
    function openActionModal(action) {
        var titles = {
            ban: '🚫 Ban User',
            unban: '✅ Unban User',
            banakses: '🛡️ Ban Akses (IP & FP)',
            unbanakses: '🔓 Unban Akses'
        };
        actionModalTitle.textContent = titles[action] || 'Aksi';
        if (['ban', 'unban', 'banakses', 'unbanakses'].includes(action)) {
            actionModalBody.innerHTML = '<div class="input-box"><label>Cari User</label><input type="text" id="actionSearch" placeholder="Ketik username..." maxlength="30"></div><div id="actionUserList" style="max-height:200px;overflow-y:auto;margin-bottom:12px;display:flex;flex-direction:column;gap:4px"></div><div id="actionDurationRow" style="display:' + (action === 'banakses' ? 'block' : 'none') + ';margin-bottom:12px"><label style="font-size:11px;font-weight:600;color:var(--text);margin-bottom:4px;display:block">Durasi Ban</label><select id="actionDuration" style="width:100%;padding:10px 13px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;background:#fafbfc;font-family:inherit"><option value="3600000">1 Jam</option><option value="7200000">2 Jam</option><option value="21600000">6 Jam</option><option value="43200000">12 Jam</option><option value="86400000">24 Jam</option><option value="0">Permanen</option></select></div><div id="actionSelectedUser" style="margin-bottom:12px;font-size:12px;color:var(--sub)"></div><button class="btn btn-primary btn-block" id="executeActionBtn">' + titles[action] + '</button>';
            actionModal.classList.add('show');
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
    }

    function closeActionModal() {
        actionModal.classList.remove('show');
        selectedActionUser = null;
    }

    function searchUserList(action) {
        var q = document.getElementById('actionSearch') ? document.getElementById('actionSearch').value : '';
        var list = document.getElementById('actionUserList');
        if (!list) return;
        var filtered = allUsers.filter(function(u) {
            return u.username.toLowerCase().includes(q.toLowerCase());
        });
        if (!filtered.length) {
            list.innerHTML = '<div style="padding:8px;color:var(--sub);font-size:11px">Tidak ada user</div>';
            return;
        }
        list.innerHTML = filtered.map(function(u) {
            var isSel = selectedActionUser && selectedActionUser.id === u.id;
            return '<div class="user-check-card' + (isSel ? ' selected' : '') + '" data-userid="' + u.id + '" style="padding:8px 10px;border:1px solid ' + (isSel ? 'var(--blue)' : 'var(--border)') + ';border-radius:6px;cursor:pointer;font-size:11px;display:flex;align-items:center;gap:8px;background:' + (isSel ? '#e0f2fe' : '#fff') + '"><span style="width:16px;height:16px;border-radius:4px;border:2px solid ' + (isSel ? 'var(--blue)' : '#cbd5e1') + ';display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;background:' + (isSel ? 'var(--blue)' : 'transparent') + '">' + (isSel ? '✓' : '') + '</span>' + esc(u.username) + ' · ' + esc(u.role) + (u.banned ? ' 🔴' : '') + (u.banAkses ? ' 🛡️' : '') + '</div>';
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
        var selDiv = document.getElementById('actionSelectedUser');
        if (selDiv) {
            selDiv.innerHTML = selectedActionUser ? '✅ Dipilih: <b>' + esc(selectedActionUser.username) + '</b>' : '';
        }
        searchUserList('');
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
                await apiCall('users/' + target.id, 'PATCH', { banned: true });
            } else if (action === 'unban') {
                await apiCall('users/' + target.id, 'PATCH', { banned: false });
            } else if (action === 'banakses') {
                var dur = parseInt(document.getElementById('actionDuration').value);
                var until = dur === 0 ? 0 : Date.now() + dur;
                await apiCall('users/' + target.id, 'PATCH', { banAkses: true, banAksesUntil: until });
                if (target.ip) {
                    await apiCall('block_ip_manual', 'POST', { ip: target.ip });
                }
                if (target.fingerprint) {
                    await apiCall('block_fp_manual', 'POST', { fp: target.fingerprint });
                }
            } else if (action === 'unbanakses') {
                await apiCall('users/' + target.id, 'PATCH', { banAkses: false, banAksesUntil: 0 });
                if (target.ip) {
                    try { await apiCall('blocked_ips/' + target.ip.replace(/\./g, '_'), 'DELETE'); } catch(e) {}
                }
                if (target.fingerprint) {
                    try { await apiCall('blocked_fp/' + target.fingerprint, 'DELETE'); } catch(e) {}
                }
            }
            var msgMap = {
                ban: 'User dibanned!',
                unban: 'User di-unban!',
                banakses: 'Akses user dibanned!',
                unbanakses: 'Akses user di-unban!'
            };
            showAlert('Berhasil', msgMap[action], 'success');
            await loadUsers();
            updateStats();
            loadActivity();
        } catch (e) {
            showAlert('Error', e.message, 'error');
        }
    }

    // ==================== NAVIGATION ====================
    function navigateTo(tab) {
        currentSubTab = tab;
        adminPanel.style.display = 'none';
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
        var subPanel = document.getElementById('subPanel');
        if (subPanel) subPanel.style.display = 'none';
        adminPanel.style.display = 'block';
        loadActivity();
    }

    // ==================== RENDER ADD USER ====================
    function renderAddUser() {
        var nm = new Date();
        nm.setMonth(nm.getMonth() + 1);
        var content = document.getElementById('subPanelContent');
        content.innerHTML = '<div style="background:#fff;border-radius:14px;padding:20px;border:1px solid #e2e8f0"><div class="section-title" style="margin-bottom:14px"><i class="fas fa-plus"></i> Tambah User</div><div class="input-box"><label>Username</label><input type="text" id="newUser" maxlength="30"></div><div class="input-box"><label>Nomor</label><input type="text" id="newPhone" maxlength="20"></div><div class="input-box"><label>Password (min 6)</label><input type="password" id="newPass" maxlength="50"></div><div class="input-box"><label>Role</label><select id="newRole"><option>Admin</option><option selected>Operator</option><option>User</option><option>VIP</option><option>Premium</option><option>Trial</option></select></div><div class="input-box"><label>Masa Aktif (MM/DD/YYYY)</label><input type="text" id="newExpiryDate" value="' + formatDate(nm) + '" maxlength="10"></div><button class="btn btn-green btn-block" id="addUserBtn"><i class="fas fa-plus"></i> Tambah User</button></div>';
        document.getElementById('addUserBtn').addEventListener('click', addUserNow);
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
            await apiCall('users', 'POST', { username: u, phone: ph, password: p, role: r, expiry_date: e });
            showAlert('Berhasil', 'User ditambahkan!', 'success');
            closeSubPanel();
            await loadUsers();
            updateStats();
            loadActivity();
        } catch (e) {
            showAlert('Error', e.message, 'error');
        }
    }

    // ==================== RENDER USER LIST ====================
    function renderUserList() {
        var h = '<div style="background:#fff;border-radius:14px;padding:20px;border:1px solid #e2e8f0"><div class="section-title" style="margin-bottom:14px"><i class="fas fa-users"></i> List User (' + allUsers.length + ')</div>';
        if (!allUsers.length) {
            h += '<div class="empty-state">Tidak ada user</div>';
        } else {
            allUsers.forEach(function(u) {
                var d = calculateDaysLeft(u.expiry_date);
                var dt = d === 999999 ? 'PERMANENT' : (d < 0 ? Math.abs(d) + ' hari lalu' : d + ' hari tersisa');
                var status = u.banned ? '🔴 BANNED' : (u.banAkses ? '🛡️ BAN AKSES' : (d > 0 ? '🟢 AKTIF' : '⚫ EXPIRED'));
                h += '<div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;font-size:12px;cursor:pointer" data-userid="' + u.id + '"><b>' + esc(u.username) + '</b> · ' + esc(u.role) + ' · ' + dt + ' · ' + status + '<br><span style="color:var(--sub);font-size:10px">📱 ' + esc(u.phone || '-') + ' | 🌐 ' + esc(u.ip || '-') + ' | 🔒 ' + esc((u.fingerprint || '-').substring(0,12)) + '...</span></div>';
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

    // ==================== RENDER BANNED LIST ====================
    function renderBannedList() {
        var banned = allUsers.filter(function(u) { return u.banned === true; });
        var h = '<div style="background:#fff;border-radius:14px;padding:20px;border:1px solid #e2e8f0"><div class="section-title" style="margin-bottom:14px"><i class="fas fa-user-slash"></i> List Banned (' + banned.length + ')</div>';
        if (!banned.length) {
            h += '<div class="empty-state">Tidak ada user dibanned</div>';
        } else {
            banned.forEach(function(u) {
                h += '<div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;font-size:12px;cursor:pointer" data-userid="' + u.id + '"><b>' + esc(u.username) + '</b> · ' + esc(u.role) + ' · 🔴 BANNED<br><span style="color:var(--sub);font-size:10px">🌐 ' + esc(u.ip || '-') + ' | 🔒 ' + esc((u.fingerprint || '-').substring(0,12)) + '...</span></div>';
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

    // ==================== RENDER BAN AKSES LIST ====================
    function renderBanAksesList() {
        var ba = allUsers.filter(function(u) { return u.banAkses === true; });
        var h = '<div style="background:#fff;border-radius:14px;padding:20px;border:1px solid #e2e8f0"><div class="section-title" style="margin-bottom:14px"><i class="fas fa-shield-haltered"></i> List Ban Akses (' + ba.length + ')</div>';
        if (!ba.length) {
            h += '<div class="empty-state">Tidak ada user kena ban akses</div>';
        } else {
            ba.forEach(function(u) {
                var until = u.banAksesUntil ? (u.banAksesUntil === 0 ? 'PERMANEN' : 'Sampai ' + new Date(u.banAksesUntil).toLocaleString('id-ID')) : 'PERMANEN';
                h += '<div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;font-size:12px;cursor:pointer" data-userid="' + u.id + '"><b>' + esc(u.username) + '</b> · ' + esc(u.role) + ' · ⏱️ ' + until + '<br><span style="color:var(--sub);font-size:10px">🌐 ' + esc(u.ip || '-') + ' | 🔒 ' + esc((u.fingerprint || '-').substring(0,12)) + '...</span></div>';
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

    // ==================== DETAIL MODAL ====================
    function openDetailModal(id) {
        var u = allUsers.find(function(x) { return x.id === id; });
        if (!u) return;
        detailModalTitle.textContent = '👤 ' + esc(u.username);
        var d = calculateDaysLeft(u.expiry_date);
        var dt = d === 999999 ? 'PERMANENT' : (d < 0 ? Math.abs(d) + ' hari lalu' : d + ' hari tersisa');
        detailModalBody.innerHTML = '<div class="detail-row"><span class="detail-label">Username</span><span class="detail-value">' + esc(u.username) + '</span></div><div class="detail-row"><span class="detail-label">Nomor</span><span class="detail-value">' + esc(u.phone || '-') + '</span></div><div class="detail-row"><span class="detail-label">Password</span><span class="detail-value">' + esc(u.password || '-') + '</span></div><div class="detail-row"><span class="detail-label">Role</span><span class="detail-value">' + esc(u.role) + '</span></div><div class="detail-row"><span class="detail-label">Masa Aktif</span><span class="detail-value">' + esc(u.expiry_date) + ' (' + dt + ')</span></div><div class="detail-row"><span class="detail-label">IP</span><span class="detail-value">' + esc(u.ip || '-') + '</span></div><div class="detail-row"><span class="detail-label">Fingerprint</span><span class="detail-value">' + esc(u.fingerprint || '-') + '</span></div><div class="detail-row"><span class="detail-label">Status</span><span class="detail-value">' + (u.banned ? '🔴 BANNED' : u.banAkses ? '🛡️ BAN AKSES' : d > 0 ? '🟢 AKTIF' : '⚫ EXPIRED') + '</span></div>';
        detailModal.classList.add('show');
    }

    function closeDetailModal() {
        detailModal.classList.remove('show');
    }

    // ==================== EVENT LISTENERS ====================
    document.addEventListener('DOMContentLoaded', async function() {
        // Key & Login
        document.getElementById('verifyKeyBtn').addEventListener('click', verifyKey);
        accessKeyInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') verifyKey(); });
        document.getElementById('loginBtn').addEventListener('click', login);
        loginPassword.addEventListener('keypress', function(e) { if (e.key === 'Enter') login(); });
        document.getElementById('logoutBtn').addEventListener('click', logout);

        // Action Cards
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

        // Modal Closes
        document.getElementById('closeActionModalBtn').addEventListener('click', closeActionModal);
        document.getElementById('closeDetailModalBtn').addEventListener('click', closeDetailModal);
        actionModal.addEventListener('click', function(e) { if (e.target === actionModal) closeActionModal(); });
        detailModal.addEventListener('click', function(e) { if (e.target === detailModal) closeDetailModal(); });

        // Idle timer reset
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

        // Fingerprint & initial block check
        if (!fingerprint) fingerprint = await getFingerprint();
        try {
            var c = await apiCall('check_blocked', 'POST', { fingerprint: fingerprint });
            if (c && c.blocked) {
                showBlockedScreen();
                return;
            }
        } catch(e) {}
    });

    // Expose functions to global for inline onclick compatibility (minimal)
    window.verifyKey = verifyKey;
    window.login = login;
    window.logout = logout;
    window.navigateTo = navigateTo;
    window.closeSubPanel = closeSubPanel;
    window.openDetailModal = openDetailModal;
    window.closeDetailModal = closeDetailModal;
    window.openActionModal = openActionModal;
    window.closeActionModal = closeActionModal;
    window.selectActionUser = selectActionUser;
    window.executeAction = executeAction;
    window.addUserNow = addUserNow;
})();