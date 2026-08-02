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
const RATE_LIMIT_MAX = 20;
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

const requestTimestamps = new Map();
const MIN_REQUEST_DELAY = 800;

function checkRequestDelay(ip, path) {
    if (
        path === 'login_success' ||
        path === 'login_failed' ||
        path === 'check_blocked' ||
        path === 'admin/login_success' ||
        path === 'admin/login_failed' ||
        path === 'users' ||
        path === 'activity_logs' ||
        path === 'blocked_ips' ||
        path === 'blocked_fp' ||
        path === 'admin/auth' ||
        path === 'access_key' ||
        path.startsWith('users/') ||
        path === 'block_ip_manual' ||
        path === 'block_fp_manual' ||
        path.startsWith('blocked_ips/') ||
        path.startsWith('blocked_fp/')
    ) return true;
    const now = Date.now();
    const last = requestTimestamps.get(ip) || 0;
    if (now - last < MIN_REQUEST_DELAY) return false;
    requestTimestamps.set(ip, now);
    return true;
}

async function decryptData(raw) {
    if (!raw) return raw;
    if (raw.data) {
        try {
            const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
            const decData = JSON.parse(dec);
            return { ...raw, ...decData };
        } catch (e) { return raw; }
    }
    return raw;
}

async function isIPBlocked(ip) {
    const snap = await db.ref('blocked_ips/' + ip.replace(/\./g, '_')).once('value');
    const raw = snap.val();
    if (raw && raw.data) {
        try {
            const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
            const data = JSON.parse(dec);
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
            const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
            const data = JSON.parse(dec);
            if (data && data.blocked) return true;
        } catch (e) {}
    }
    return false;
}

async function blockIP(ip) {
    const enc = CryptoJS.AES.encrypt(JSON.stringify({
        ip: ip,
        blocked: true,
        blocked_at: new Date().toISOString()
    }), ADMIN_KEY).toString();
    await db.ref('blocked_ips/' + ip.replace(/\./g, '_')).set({ data: enc });
}

async function blockFP(fp) {
    if (!fp) return;
    const enc = CryptoJS.AES.encrypt(JSON.stringify({
        fingerprint: fp,
        blocked: true,
        blocked_at: new Date().toISOString()
    }), ADMIN_KEY).toString();
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
            const data = JSON.parse(CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8));
            attempts = data.count || 0;
            lastAttempt = data.last_attempt || 0;
            if (now - lastAttempt > 3600000) {
                await ref.remove();
                const enc = CryptoJS.AES.encrypt(JSON.stringify({
                    count: 1,
                    last_attempt: now,
                    fingerprint: fp
                }), ADMIN_KEY).toString();
                await ref.set({ data: enc });
                return 1;
            }
        } catch (e) {}
    }
    const newCount = attempts + 1;
    const enc = CryptoJS.AES.encrypt(JSON.stringify({
        count: newCount,
        last_attempt: now,
        fingerprint: fp
    }), ADMIN_KEY).toString();
    await ref.set({ data: enc });
    return newCount;
}

async function resetLoginAttempt(ip, fp) {
    const key = ip.replace(/\./g, '_') + '_' + (fp || 'nofp');
    await db.ref('login_attempts/' + key).remove();
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
                    const parsed = JSON.parse(CryptoJS.AES.decrypt(data[key].data, ADMIN_KEY).toString(CryptoJS.enc.Utf8));
                    if (now - (parsed.last_attempt || 0) > 86400000) {
                        await db.ref('login_attempts/' + key).remove();
                    }
                } catch (e) {}
            }
        }
    } catch (e) {}
}

async function logActivity(username, action, details, ip, fp) {
    try {
        const enc = CryptoJS.AES.encrypt(JSON.stringify({
            username: username,
            action: action,
            details: details || '',
            ip: ip,
            fingerprint: fp,
            timestamp: Date.now()
        }), ADMIN_KEY).toString();
        const newRef = db.ref('activity_logs').push();
        await newRef.set({ data: enc });
    } catch (e) {}
}

export default async function handler(req, res) {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',');
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    else if (allowedOrigins.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Fingerprint');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    if (req.method === 'OPTIONS') return res.status(200).end();
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) return res.status(401).json({ error: 'Unauthorized' });
    const ip = req.headers['x-forwarded-for'] || 'unknown';
    const fp = req.headers['x-fingerprint'] || '';
    if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Terlalu banyak request. Coba lagi nanti.' });
    if (Math.random() < 0.05) cleanupOldAttempts().catch(() => {});

    try {
        const body = req.body;
        if (!body || !body.data) return res.status(400).json({ error: 'No data' });
        const decrypted = CryptoJS.AES.decrypt(body.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
        if (!decrypted) return res.status(403).json({ error: 'Access denied' });
        const parsed = JSON.parse(decrypted);
        if (!checkRequestDelay(ip, parsed.path)) return res.status(429).json({ error: 'Request terlalu cepat. Harap tunggu.' });
        if (!parsed.path || typeof parsed.path !== 'string' || parsed.path.length > 200) return res.status(400).json({ error: 'Invalid path' });
        const ref = db.ref(parsed.path);

        if (parsed.path === 'check_blocked' && parsed.method === 'POST') {
            const ipBlocked = await isIPBlocked(ip);
            const fpBlocked = fp ? await isFPBlocked(fp) : false;
            return res.status(200).json({ blocked: ipBlocked || fpBlocked });
        }

        if (parsed.path === 'access_key' && parsed.method === 'GET') {
            const snap = await db.ref('access_key').once('value');
            const raw = snap.val();
            if (raw && raw.data) {
                const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
                const result = JSON.parse(dec);
                const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
                return res.status(200).json({ encrypted: true, data: encrypted });
            }
            const encrypted = CryptoJS.AES.encrypt(JSON.stringify({ key: '' }), ADMIN_KEY).toString();
            return res.status(200).json({ encrypted: true, data: encrypted });
        }

        if (parsed.path === 'admin/auth' && parsed.method === 'GET') {
            const ipBlocked = await isIPBlocked(ip);
            const fpBlocked = fp ? await isFPBlocked(fp) : false;
            if (ipBlocked || fpBlocked) {
                const result = { blocked: true, message: 'Akses diblokir permanen' };
                const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
                return res.status(200).json({ encrypted: true, data: encrypted });
            }
            const snap = await ref.once('value');
            const raw = snap.val();
            if (raw && raw.data) {
                const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
                const result = JSON.parse(dec);
                const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
                return res.status(200).json({ encrypted: true, data: encrypted });
            }
            const encrypted = CryptoJS.AES.encrypt(JSON.stringify({}), ADMIN_KEY).toString();
            return res.status(200).json({ encrypted: true, data: encrypted });
        }

        if ((parsed.path === 'admin/login_failed' || parsed.path === 'login_failed') && parsed.method === 'POST') {
            const attempts = await trackLoginAttempt(ip, fp);
            await new Promise(r => setTimeout(r, Math.min(attempts * 500, 3000)));
            if (attempts >= 5) {
                await blockIP(ip);
                if (fp) await blockFP(fp);
                const result = { blocked: true, message: 'Diblokir permanen setelah 5x gagal' };
                const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
                return res.status(200).json({ encrypted: true, data: encrypted });
            }
            const result = { attempts: attempts, remaining: 5 - attempts };
            const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
            return res.status(200).json({ encrypted: true, data: encrypted });
        }

        if ((parsed.path === 'admin/login_success' || parsed.path === 'login_success') && parsed.method === 'POST') {
            await resetLoginAttempt(ip, fp);
            const result = { success: true };
            const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
            return res.status(200).json({ encrypted: true, data: encrypted });
        }

        if (parsed.path === 'login' && parsed.method === 'POST') {
            if (await isIPBlocked(ip) || (fp && await isFPBlocked(fp))) {
                const result = { blocked: true, message: 'IP atau Fingerprint diblokir.' };
                return res.status(200).json(result);
            }
            const snap = await db.ref('users').once('value');
            const users = snap.val();
            if (!users) return res.status(200).json({ success: false });

            for (const key in users) {
                const decryptedUser = await decryptData(users[key]);
                if (decryptedUser && decryptedUser.username === parsed.data.username && decryptedUser.password === parsed.data.password) {

                    if (decryptedUser.banned) {
                        return res.status(200).json({
                            success: false,
                            banned: true,
                            bannedUntil: decryptedUser.bannedUntil || 0,
                            message: 'Akun dibanned.'
                        });
                    }

                    if (decryptedUser.banAkses) {
                        if (decryptedUser.banAksesUntil === 0 || decryptedUser.banAksesUntil > Date.now()) {
                            return res.status(200).json({
                                success: false,
                                banAkses: true,
                                banAksesUntil: decryptedUser.banAksesUntil || 0,
                                message: 'Akses diblokir.'
                            });
                        } else {
                            const updatedData = { ...decryptedUser, banAkses: false, banAksesUntil: 0 };
                            await db.ref('users/' + key).update({
                                data: CryptoJS.AES.encrypt(JSON.stringify(updatedData), ADMIN_KEY).toString()
                            });
                        }
                    }

                    if (decryptedUser.forceLogout) {
                        return res.status(200).json({
                            success: false,
                            forceLogout: true,
                            message: 'Akun dikunci admin karena indikasi sharing akun.'
                        });
                    }

                    const updatedData = {
                        ...decryptedUser,
                        ip: ip,
                        fingerprint: fp,
                        lastLogin: { ip, fingerprint: fp, timestamp: Date.now() }
                    };
                    await db.ref('users/' + key).update({
                        data: CryptoJS.AES.encrypt(JSON.stringify(updatedData), ADMIN_KEY).toString()
                    });

                    await logActivity(decryptedUser.username, 'login', 'Login berhasil', ip, fp);

                    return res.status(200).json({
                        success: true,
                        data: {
                            id: key,
                            username: decryptedUser.username,
                            role: decryptedUser.role || 'Operator',
                            full_name: decryptedUser.full_name || '',
                            expiry_date: decryptedUser.expiry_date || ''
                        }
                    });
                }
            }
            return res.status(200).json({ success: false });
        }

        if (parsed.path === 'block_ip_manual' && parsed.method === 'POST') {
            await blockIP(parsed.data.ip);
            await logActivity('admin', 'ban_ip', 'IP ' + parsed.data.ip + ' dibanned', ip, fp);
            const encrypted = CryptoJS.AES.encrypt(JSON.stringify({ success: true }), ADMIN_KEY).toString();
            return res.status(200).json({ encrypted: true, data: encrypted });
        }

        if (parsed.path === 'block_fp_manual' && parsed.method === 'POST') {
            await blockFP(parsed.data.fp);
            await logActivity('admin', 'ban_fp', 'FP dibanned', ip, fp);
            const encrypted = CryptoJS.AES.encrypt(JSON.stringify({ success: true }), ADMIN_KEY).toString();
            return res.status(200).json({ encrypted: true, data: encrypted });
        }

        if (parsed.method === 'GET') {
            const snap = await ref.once('value');
            const raw = snap.val();
            const result = {};
            if (raw) {
                for (const key in raw) {
                    if (raw[key] && raw[key].data) {
                        try {
                            const dec = CryptoJS.AES.decrypt(raw[key].data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
                            result[key] = JSON.parse(dec);
                            result[key].id = key;
                        } catch (e) {}
                    }
                }
            }
            const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
            return res.status(200).json({ encrypted: true, data: encrypted });
        }

        if (parsed.method === 'POST') {
            const enc = CryptoJS.AES.encrypt(JSON.stringify(parsed.data), ADMIN_KEY).toString();
            const newRef = ref.push();
            await newRef.set({ data: enc });
            if (parsed.path === 'transactions') {
                await logActivity(
                    parsed.data.operator || 'unknown',
                    parsed.data.type || 'topup',
                    (parsed.data.type === 'topup' ? 'Top Up' : 'Kuras') + ' Rp ' + (parsed.data.amount || 0).toLocaleString(),
                    ip, fp
                );
            }
            const result = { success: true, id: newRef.key };
            const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
            return res.status(200).json({ encrypted: true, data: encrypted });
        }

        if (parsed.method === 'PUT') {
            const enc = CryptoJS.AES.encrypt(JSON.stringify(parsed.data), ADMIN_KEY).toString();
            await ref.set({ data: enc });
            const result = { success: true };
            const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
            return res.status(200).json({ encrypted: true, data: encrypted });
        }

        if (parsed.method === 'PATCH') {
            const snap = await ref.once('value');
            const existing = snap.val();
            let existingData = {};
            if (existing && existing.data) {
                try {
                    const dec = CryptoJS.AES.decrypt(existing.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
                    existingData = JSON.parse(dec);
                } catch (e) {}
            }
            const merged = Object.assign({}, existingData, parsed.data);
            const enc = CryptoJS.AES.encrypt(JSON.stringify(merged), ADMIN_KEY).toString();
            await ref.update({ data: enc });

            const username = existingData.username || 'unknown';
            if (parsed.data.banned === true) await logActivity(username, 'banned', 'User dibanned', ip, fp);
            if (parsed.data.banned === false) await logActivity(username, 'unbanned', 'User di-unban', ip, fp);
            if (parsed.data.banAkses === true) await logActivity(username, 'ban_akses', 'Akses user dibanned', ip, fp);
            if (parsed.data.banAkses === false) await logActivity(username, 'unban_akses', 'Akses user di-unban', ip, fp);
            if (parsed.data.forceLogout === true) await logActivity(username, 'force_logout', 'Force logout', ip, fp);
            if (parsed.data.forceLogout === false) await logActivity(username, 'unforce_logout', 'Izinkan login', ip, fp);

            const result = { success: true };
            const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
            return res.status(200).json({ encrypted: true, data: encrypted });
        }

        if (parsed.method === 'DELETE') {
            const snap = await ref.once('value');
            const raw = snap.val();
            if (raw && raw.data) {
                try {
                    const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
                    const userData = JSON.parse(dec);
                    if (userData.username) await logActivity(userData.username, 'deleted', 'User dihapus', ip, fp);
                } catch (e) {}
            }
            await ref.remove();
            const result = { success: true };
            const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
            return res.status(200).json({ encrypted: true, data: encrypted });
        }

        return res.status(400).json({ error: 'Invalid method' });
    } catch (error) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}