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

// ==================== BLOCK FUNCTIONS (FIX - PAKAI IP YANG BENAR) ====================
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

// ==================== VERIFY KEY (FIX) ====================
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
                    
                    // ==================== AMBIL IP DARI SERVER ====================
                    // Karena kita tidak punya IP client di browser, kita block fingerprint sebagai identitas
                    // TAPI seharusnya server yang block IP berdasarkan request
                    
                    // Kirim request ke server agar server block IP & FP
                    apiCall('block_ip', 'POST', { ip: fingerprint }).then(() => {
                        console.log('[VERIFY KEY] IP blocked via server');
                    });
                    apiCall('block_fp', 'POST', { fp: fingerprint }).then(() => {
                        console.log('[VERIFY KEY] FP blocked via server');
                    });
                    
                    showAlert('Akses Diblokir', 'Terlalu banyak percobaan! IP & Perangkat Anda diblokir.', 'error');
                    setTimeout(() => {
                        // Cek status block dari server
                        checkBlockedOnLoad().then(isBlocked => {
                            if (!isBlocked) {
                                // Force show blocked jika server belum merespon
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

// ==================== LOGIN (FIX) ====================
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
                            
                            // Kirim request ke server agar server block IP & FP
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

// ==================== FUNGSI LAINNYA (SAMA SEPERTI SEBELUMNYA) ====================
// ... (semua fungsi loadUsers, loadActivity, dll tetap sama)

// ==================== DOM READY ====================
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

// EXPOSE GLOBAL FUNCTIONS
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