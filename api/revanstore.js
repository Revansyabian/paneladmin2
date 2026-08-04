import CryptoJS from 'crypto-js';
import admin from 'firebase-admin';

const ADMIN_KEY = process.env.ADMIN_KEY;

if (!admin.apps.length) {
    const key = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: key
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
}

const db = admin.database();
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW = 60000;

function checkRateLimit(ip) {
    const now = Date.now();
    if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, []);
    const requests = rateLimitMap.get(ip).filter(t => now - t < RATE_LIMIT_WINDOW);
    if (requests.length >= RATE_LIMIT_MAX) return false;
    requests.push(now);
    rateLimitMap.set(ip, requests);
    return true;
}

function decryptData(raw) {
    if (!raw) return raw;
    try {
        let encryptedData = raw;
        if (encryptedData.startsWith('admin:')) {
            encryptedData = encryptedData.replace('admin:', '');
        }
        const dec = CryptoJS.AES.decrypt(encryptedData, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
        return JSON.parse(dec);
    } catch (e) { return raw; }
}

function encryptData(data) {
    return 'admin:' + CryptoJS.AES.encrypt(JSON.stringify(data), ADMIN_KEY).toString();
}

export default async function handler(req, res) {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',');
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    else if (allowedOrigins.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Fingerprint, X-Operator');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const fp = req.headers['x-fingerprint'] || '';

    if (!checkRateLimit(ip)) {
        return res.status(429).json({ error: 'Terlalu banyak request. Coba lagi nanti.' });
    }

    try {
        const body = req.body;
        if (!body || !body.data) {
            return res.status(400).json({ error: 'No data' });
        }

        const decrypted = decryptData(body.data);
        if (!decrypted) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const parsed = decrypted;

        if (!parsed.path || typeof parsed.path !== 'string' || parsed.path.length > 200) {
            return res.status(400).json({ error: 'Invalid path' });
        }

        const ref = db.ref(parsed.path);

        if (parsed.path === 'check_blocked' && parsed.method === 'POST') {
            const ipBlocked = await isIPBlocked(ip);
            const fpBlocked = fp ? await isFPBlocked(fp) : false;
            const result = { blocked: ipBlocked || fpBlocked };
            return res.status(200).json({ data: encryptData(result) });
        }

        if (parsed.path === 'access_key' && parsed.method === 'GET') {
            const snap = await db.ref('access_key').once('value');
            const raw = snap.val();
            let result = { key: '' };
            if (raw && raw.data) {
                try {
                    const dec = decryptData(raw.data);
                    result = dec;
                } catch (e) {}
            }
            return res.status(200).json({ data: encryptData(result) });
        }

        if (parsed.path === 'admin/auth' && parsed.method === 'GET') {
            const ipBlocked = await isIPBlocked(ip);
            const fpBlocked = fp ? await isFPBlocked(fp) : false;
            if (ipBlocked || fpBlocked) {
                const result = { blocked: true };
                return res.status(200).json({ data: encryptData(result) });
            }
            const snap = await ref.once('value');
            const raw = snap.val();
            let result = {};
            if (raw && raw.data) {
                try {
                    const dec = decryptData(raw.data);
                    result = dec;
                } catch (e) {}
            }
            return res.status(200).json({ data: encryptData(result) });
        }

        if ((parsed.path === 'admin/login_failed' || parsed.path === 'login_failed') && parsed.method === 'POST') {
            const attempts = await trackLoginAttempt(ip, fp);
            await new Promise(r => setTimeout(r, Math.min(attempts * 500, 3000)));
            if (attempts >= 5) {
                await blockIP(ip);
                if (fp) await blockFP(fp);
                await logActivity('system', 'auto_block', 'Auto block setelah ' + attempts + 'x gagal', ip, fp);
                const result = { blocked: true, message: 'Diblokir permanen setelah 5x gagal' };
                return res.status(200).json({ data: encryptData(result) });
            }
            const result = { attempts: attempts, remaining: 5 - attempts };
            return res.status(200).json({ data: encryptData(result) });
        }

        if ((parsed.path === 'admin/login_success' || parsed.path === 'login_success') && parsed.method === 'POST') {
            await resetLoginAttempt(ip, fp);
            const result = { success: true };
            return res.status(200).json({ data: encryptData(result) });
        }

        if (parsed.path === 'login' && parsed.method === 'POST') {
            if (await isIPBlocked(ip) || (fp && await isFPBlocked(fp))) {
                const result = { blocked: true, message: 'IP atau Fingerprint diblokir.' };
                return res.status(200).json({ data: encryptData(result) });
            }

            const snap = await db.ref('users').once('value');
            const users = snap.val();
            if (!users) {
                const result = { success: false, message: 'User tidak ditemukan' };
                return res.status(200).json({ data: encryptData(result) });
            }

            const username = parsed.data.username;
            const password = parsed.data.password;
            const currentIP = parsed.data.ip || ip;
            const currentFP = parsed.data.fingerprint || fp;

            for (const key in users) {
                const userData = decryptData(users[key].data);
                if (userData && userData.username === username && userData.password === password) {

                    if (userData.banned) {
                        const result = {
                            success: false,
                            banned: true,
                            bannedUntil: userData.bannedUntil || 0,
                            message: 'Akun dibanned.'
                        };
                        return res.status(200).json({ data: encryptData(result) });
                    }

                    if (userData.banAkses) {
                        if (userData.banAksesUntil === 0 || userData.banAksesUntil > Date.now()) {
                            const result = {
                                success: false,
                                banAkses: true,
                                banAksesUntil: userData.banAksesUntil || 0,
                                message: 'Akses diblokir.'
                            };
                            return res.status(200).json({ data: encryptData(result) });
                        } else {
                            const updatedData = { ...userData, banAkses: false, banAksesUntil: 0 };
                            await db.ref('users/' + key).update({
                                data: encryptData(updatedData)
                            });
                            await logActivity(username, 'unban_akses_auto', 'Ban akses expired', currentIP, currentFP);
                        }
                    }

                    if (userData.forceLogout) {
                        const result = {
                            success: false,
                            forceLogout: true,
                            message: 'Akun dikunci admin karena indikasi sharing akun.'
                        };
                        return res.status(200).json({ data: encryptData(result) });
                    }

                    const ipHistory = userData.ipHistory || [];
                    if (currentIP && (!ipHistory.length || ipHistory[ipHistory.length - 1] !== currentIP)) {
                        ipHistory.push(currentIP);
                        if (ipHistory.length > 10) ipHistory.shift();
                    }

                    const fpHistory = userData.fpHistory || [];
                    if (currentFP && (!fpHistory.length || fpHistory[fpHistory.length - 1] !== currentFP)) {
                        fpHistory.push(currentFP);
                        if (fpHistory.length > 10) fpHistory.shift();
                    }

                    const updatedData = {
                        ...userData,
                        ip: currentIP,
                        fingerprint: currentFP,
                        ipHistory: ipHistory,
                        fpHistory: fpHistory,
                        lastLogin: {
                            ip: currentIP,
                            fingerprint: currentFP,
                            timestamp: Date.now()
                        }
                    };

                    await db.ref('users/' + key).update({
                        data: encryptData(updatedData)
                    });

                    await logActivity(username, 'login_success', 'Login berhasil. IP: ' + currentIP, currentIP, currentFP);
                    await resetLoginAttempt(ip, fp);

                    const result = {
                        success: true,
                        data: {
                            id: key,
                            username: userData.username,
                            role: userData.role || 'Operator',
                            full_name: userData.full_name || userData.username,
                            expiry_date: userData.expiry_date || '',
                            ip: currentIP,
                            fingerprint: currentFP
                        }
                    };
                    return res.status(200).json({ data: encryptData(result) });
                }
            }

            await logActivity(username, 'login_failed', 'Password salah atau user tidak ditemukan', currentIP, currentFP);
            const result = { success: false, message: 'User tidak ditemukan atau password salah' };
            return res.status(200).json({ data: encryptData(result) });
        }

        if (parsed.path === 'block_ip_manual' && parsed.method === 'POST') {
            await blockIP(parsed.data.ip);
            await logActivity('admin', 'block_ip', 'IP ' + parsed.data.ip + ' diblokir manual', ip, fp);
            return res.status(200).json({ data: encryptData({ success: true }) });
        }

        if (parsed.path === 'block_fp_manual' && parsed.method === 'POST') {
            await blockFP(parsed.data.fp);
            await logActivity('admin', 'block_fp', 'FP diblokir manual', ip, fp);
            return res.status(200).json({ data: encryptData({ success: true }) });
        }

        if (parsed.path === 'action_keys' && parsed.method === 'GET') {
            const snap = await ref.once('value');
            const raw = snap.val();
            const result = {};
            if (raw) {
                for (const key in raw) {
                    if (raw[key] && raw[key].data) {
                        try {
                            const dec = decryptData(raw[key].data);
                            result[key] = dec;
                            result[key].id = key;
                        } catch (e) {}
                    }
                }
            }
            return res.status(200).json({ data: encryptData(result) });
        }

        if (parsed.path === 'action_keys' && parsed.method === 'POST') {
            const decryptedKey = decryptData(parsed.data.key);
            const keyValue = decryptedKey.key;
            
            const enc = encryptData({ key: keyValue, createdAt: Date.now() });
            const newRef = ref.push();
            await newRef.set({ data: enc });
            
            return res.status(200).json({ data: encryptData({ success: true, id: newRef.key }) });
        }

        if (parsed.path === 'action_keys/verify' && parsed.method === 'POST') {
            const decryptedKey = decryptData(parsed.data.key);
            const inputKey = decryptedKey.key;
            
            const snap = await db.ref('action_keys').once('value');
            const raw = snap.val();
            let valid = false;
            if (raw) {
                for (const key in raw) {
                    if (raw[key] && raw[key].data) {
                        try {
                            const dec = decryptData(raw[key].data);
                            if (dec && dec.key === inputKey) {
                                valid = true;
                                break;
                            }
                        } catch (e) {}
                    }
                }
            }
            return res.status(200).json({ data: encryptData({ valid: valid }) });
        }

        if (parsed.path.startsWith('action_keys/') && parsed.method === 'DELETE') {
            const id = parsed.path.replace('action_keys/', '');
            await db.ref('action_keys/' + id).remove();
            return res.status(200).json({ data: encryptData({ success: true }) });
        }

        if (parsed.path === 'ip_whitelist' && parsed.method === 'GET') {
            const snap = await ref.once('value');
            const raw = snap.val();
            const result = {};
            if (raw) {
                for (const key in raw) {
                    if (raw[key] && raw[key].data) {
                        try {
                            const dec = decryptData(raw[key].data);
                            result[key] = dec;
                            result[key].id = key;
                        } catch (e) {}
                    }
                }
            }
            return res.status(200).json({ data: encryptData(result) });
        }

        if (parsed.path === 'ip_whitelist' && parsed.method === 'POST') {
            const enc = encryptData({ ip: parsed.data.ip, createdAt: Date.now() });
            const newRef = ref.push();
            await newRef.set({ data: enc });
            return res.status(200).json({ data: encryptData({ success: true, id: newRef.key }) });
        }

        if (parsed.path.startsWith('ip_whitelist/') && parsed.method === 'DELETE') {
            const id = parsed.path.replace('ip_whitelist/', '');
            await db.ref('ip_whitelist/' + id).remove();
            return res.status(200).json({ data: encryptData({ success: true }) });
        }

        if (parsed.path === 'fp_whitelist' && parsed.method === 'GET') {
            const snap = await ref.once('value');
            const raw = snap.val();
            const result = {};
            if (raw) {
                for (const key in raw) {
                    if (raw[key] && raw[key].data) {
                        try {
                            const dec = decryptData(raw[key].data);
                            result[key] = dec;
                            result[key].id = key;
                        } catch (e) {}
                    }
                }
            }
            return res.status(200).json({ data: encryptData(result) });
        }

        if (parsed.path === 'fp_whitelist' && parsed.method === 'POST') {
            const enc = encryptData({ fp: parsed.data.fp, createdAt: Date.now() });
            const newRef = ref.push();
            await newRef.set({ data: enc });
            return res.status(200).json({ data: encryptData({ success: true, id: newRef.key }) });
        }

        if (parsed.path.startsWith('fp_whitelist/') && parsed.method === 'DELETE') {
            const id = parsed.path.replace('fp_whitelist/', '');
            await db.ref('fp_whitelist/' + id).remove();
            return res.status(200).json({ data: encryptData({ success: true }) });
        }

        // ==================== GET ADMIN KEY UNTUK OPSI 2 ====================
        if (parsed.path === 'admin/get_key' && parsed.method === 'GET') {
            const result = { adminKey: encryptData(ADMIN_KEY) };
            return res.status(200).json({ data: encryptData(result) });
        }

        // ==================== GENERIC CRUD ====================
        if (parsed.method === 'GET') {
            const snap = await ref.once('value');
            const raw = snap.val();
            const result = {};
            if (raw) {
                for (const key in raw) {
                    if (raw[key] && raw[key].data) {
                        try {
                            const dec = decryptData(raw[key].data);
                            result[key] = dec;
                            result[key].id = key;
                        } catch (e) {}
                    }
                }
            }
            return res.status(200).json({ data: encryptData(result) });
        }

        if (parsed.method === 'POST') {
            const enc = encryptData(parsed.data);
            const newRef = ref.push();
            await newRef.set({ data: enc });

            if (parsed.path === 'transactions') {
                const operator = parsed.data.operator || 'unknown';
                const type = parsed.data.type || 'topup';
                const typeText = type === 'topup' ? 'Top Up' : type === 'kuras' ? 'Kuras' : 'Ganti Nama';
                const amount = parsed.data.amount || 0;
                await logActivity(operator, type, typeText + ' Rp ' + amount.toLocaleString() + ' ke ' + (parsed.data.accountName || ''), ip, fp);
            }

            if (parsed.path === 'activity_logs') {
                await logActivity(
                    parsed.data.username || 'unknown',
                    parsed.data.action || 'unknown',
                    parsed.data.details || '',
                    ip, fp
                );
            }

            const result = { success: true, id: newRef.key };
            return res.status(200).json({ data: encryptData(result) });
        }

        if (parsed.method === 'PUT') {
            const enc = encryptData(parsed.data);
            await ref.set({ data: enc });
            return res.status(200).json({ data: encryptData({ success: true }) });
        }

        if (parsed.method === 'PATCH') {
            const snap = await ref.once('value');
            const existing = snap.val();
            let existingData = {};
            if (existing && existing.data) {
                try {
                    const dec = decryptData(existing.data);
                    existingData = dec;
                } catch (e) {}
            }
            const merged = Object.assign({}, existingData, parsed.data);
            const enc = encryptData(merged);
            await ref.update({ data: enc });

            const username = existingData.username || 'unknown';
            if (parsed.data.banned === true) await logActivity(username, 'banned', 'User dibanned', ip, fp);
            if (parsed.data.banned === false) await logActivity(username, 'unbanned', 'User di-unban', ip, fp);
            if (parsed.data.banAkses === true) await logActivity(username, 'ban_akses', 'Akses user dibanned. Durasi: ' + (parsed.data.banAksesUntil === 0 ? 'Permanen' : new Date(parsed.data.banAksesUntil).toLocaleString('id-ID')), ip, fp);
            if (parsed.data.banAkses === false) await logActivity(username, 'unban_akses', 'Akses user di-unban', ip, fp);
            if (parsed.data.forceLogout === true) await logActivity(username, 'force_logout', 'User ditangguhkan (force logout)', ip, fp);
            if (parsed.data.forceLogout === false) await logActivity(username, 'unforce_logout', 'Tangguhan dilepas', ip, fp);

            return res.status(200).json({ data: encryptData({ success: true }) });
        }

        if (parsed.method === 'DELETE') {
            const snap = await ref.once('value');
            const raw = snap.val();
            if (raw && raw.data) {
                try {
                    const userData = decryptData(raw.data);
                    if (userData.username) {
                        await logActivity(userData.username, 'deleted', 'Data dihapus', ip, fp);
                    }
                } catch (e) {}
            }
            await ref.remove();
            return res.status(200).json({ data: encryptData({ success: true }) });
        }

        return res.status(400).json({ error: 'Invalid method' });
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

async function isIPBlocked(ip) {
    if (!ip) return false;
    const snap = await db.ref('blocked_ips/' + ip.replace(/\./g, '_')).once('value');
    const raw = snap.val();
    if (raw && raw.data) {
        try {
            const data = decryptData(raw.data);
            if (data && data.blocked) return true;
        } catch (e) {}
    }
    return false;
}

async function isFPBlocked(fp) {
    if (!fp) return false;
    const snap = await db.ref('blocked_fp/' + fp).once('value');
    const raw = snap.val();
    if (raw && raw.data) {
        try {
            const data = decryptData(raw.data);
            if (data && data.blocked) return true;
        } catch (e) {}
    }
    return false;
}

async function blockIP(ip) {
    if (!ip) return;
    const enc = encryptData({
        ip: ip,
        blocked: true,
        blocked_at: new Date().toISOString()
    });
    await db.ref('blocked_ips/' + ip.replace(/\./g, '_')).set({ data: enc });
}

async function blockFP(fp) {
    if (!fp) return;
    const enc = encryptData({
        fingerprint: fp,
        blocked: true,
        blocked_at: new Date().toISOString()
    });
    await db.ref('blocked_fp/' + fp).set({ data: enc });
}

async function trackLoginAttempt(ip, fp) {
    const key = ip.replace(/\./g, '_') + '_' + (fp || 'nofp');
    const ref = db.ref('login_attempts/' + key);
    const snap = await ref.once('value');
    const raw = snap.val();
    const now = Date.now();
    let attempts = 0,
        lastAttempt = 0;
    if (raw && raw.data) {
        try {
            const data = decryptData(raw.data);
            attempts = data.count || 0;
            lastAttempt = data.last_attempt || 0;
            if (now - lastAttempt > 3600000) {
                await ref.remove();
                const enc = encryptData({
                    count: 1,
                    last_attempt: now,
                    fingerprint: fp
                });
                await ref.set({ data: enc });
                return 1;
            }
        } catch (e) {}
    }
    const newCount = attempts + 1;
    const enc = encryptData({
        count: newCount,
        last_attempt: now,
        fingerprint: fp
    });
    await ref.set({ data: enc });
    return newCount;
}

async function resetLoginAttempt(ip, fp) {
    const key = ip.replace(/\./g, '_') + '_' + (fp || 'nofp');
    await db.ref('login_attempts/' + key).remove();
}

async function logActivity(username, action, details, ip, fp) {
    try {
        const enc = encryptData({
            username: username,
            action: action,
            details: details || '',
            ip: ip || '',
            fingerprint: fp || '',
            timestamp: Date.now()
        });
        const newRef = db.ref('activity_logs').push();
        await newRef.set({ data: enc });
    } catch (e) {}
}

async function cleanupOldAttempts() {
    try {
        const snap = await db.ref('login_attempts').once('value');
        const data = snap.val();
        if (!data) return;
        const now = Date.now();
        for (const key in data) {
            if (data[key] && data[key].data) {
                try {
                    const parsed = decryptData(data[key].data);
                    if (now - (parsed.last_attempt || 0) > 86400000) {
                        await db.ref('login_attempts/' + key).remove();
                    }
                } catch (e) {}
            }
        }
    } catch (e) {}
}

async function checkSharingDetection(userData, currentIP, currentFP, userId) {
    const prevIP = userData.ip || '';
    const prevFP = userData.fingerprint || '';
    
    const ipChanged = prevIP && currentIP && prevIP !== currentIP;
    const fpChanged = prevFP && currentFP && prevFP !== currentFP;
    
    if (ipChanged || fpChanged) {
        await logActivity(
            userData.username,
            fpChanged ? 'fp_changed' : 'ip_changed',
            'IP: ' + currentIP + ' | FP: ' + (currentFP ? currentFP.substring(0, 12) + '...' : 'none'),
            currentIP,
            currentFP
        );
        
        if (ipChanged && fpChanged) {
            const updatedData = { ...userData, forceLogout: true };
            const enc = encryptData(updatedData);
            await db.ref('users/' + userId).update({ data: enc });
            
            await logActivity(
                userData.username,
                'sharing_detected',
                'IP & FP berbeda! Auto force logout. IP: ' + currentIP + ', FP: ' + (currentFP ? currentFP.substring(0, 12) + '...' : 'none'),
                currentIP,
                currentFP
            );
            
            return true;
        }
    }
    
    return false;
}