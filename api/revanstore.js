import CryptoJS from 'crypto-js';
import admin from 'firebase-admin';
import bcrypt from 'bcryptjs';

const ADMIN_KEY = process.env.ADMIN_KEY;
if (!ADMIN_KEY) {
    throw new Error('ADMIN_KEY is required!');
}

const SALT_ROUNDS = 12;
const SESSION_DURATION = 3600000; // 1 jam
const SESSION_EXTEND_THRESHOLD = 300000; // 5 menit
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW = 60000;

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

// ==================== PASSWORD FUNCTIONS ====================
async function hashPassword(password) {
    try {
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        return await bcrypt.hash(password, salt);
    } catch (e) {
        console.error('Error hashing password:', e);
        return null;
    }
}

async function verifyPassword(password, hash) {
    try {
        return await bcrypt.compare(password, hash);
    } catch (e) {
        console.error('Error verifying password:', e);
        return false;
    }
}

// ==================== RATE LIMITING (FIREBASE-BASED) ====================
async function checkRateLimit(ip) {
    const key = ip.replace(/\./g, '_');
    const ref = db.ref('rate_limits/' + key);
    const snap = await ref.once('value');
    const raw = snap.val();
    const now = Date.now();
    
    if (raw && raw.data) {
        try {
            const data = decryptData(raw.data);
            if (now - (data.timestamp || 0) < RATE_LIMIT_WINDOW) {
                if ((data.count || 0) >= RATE_LIMIT_MAX) return false;
                data.count = (data.count || 0) + 1;
                await ref.set({ data: encryptData(data) });
                return true;
            }
        } catch (e) {}
    }
    
    await ref.set({ data: encryptData({ count: 1, timestamp: now }) });
    return true;
}

// ==================== INPUT SANITIZATION ====================
function sanitizeInput(str) {
    if (!str) return '';
    return String(str)
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/`/g, '&#96;');
}

// ==================== DATA VALIDATION ====================
function validateData(path, data) {
    if (!data || typeof data !== 'object') return false;
    
    if (path === 'users' || path.startsWith('users/')) {
        if (data.username !== undefined && (typeof data.username !== 'string' || data.username.length < 3)) return false;
        if (data.password !== undefined && (typeof data.password !== 'string' || data.password.length < 6)) return false;
    }
    
    if (path === 'transactions') {
        if (data.amount !== undefined && (typeof data.amount !== 'number' || data.amount <= 0)) return false;
        if (data.type !== undefined && !['topup', 'kuras', 'gantinama'].includes(data.type)) return false;
    }
    
    return true;
}

function decryptData(raw) {
    if (!raw) return raw;
    try {
        const dec = CryptoJS.AES.decrypt(raw, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
        return JSON.parse(dec);
    } catch (e) { return raw; }
}

function encryptData(data) {
    return CryptoJS.AES.encrypt(JSON.stringify(data), ADMIN_KEY).toString();
}

// ==================== SESSION FUNCTIONS ====================
async function createSession(email, ip, fp) {
    const sessionId = CryptoJS.lib.WordArray.random(32).toString();
    
    const sessionData = {
        email: email,
        ip: ip,
        fingerprint: fp || '',
        created: Date.now(),
        expires: Date.now() + SESSION_DURATION
    };
    
    const enc = encryptData(sessionData);
    await db.ref('sessions/' + sessionId).set({ data: enc });
    
    return sessionId;
}

async function checkSession(sessionId) {
    if (!sessionId) return null;
    const snap = await db.ref('sessions/' + sessionId).once('value');
    const raw = snap.val();
    if (!raw || !raw.data) return null;
    
    try {
        const session = decryptData(raw.data);
        if (session.expires && Date.now() > session.expires) {
            await db.ref('sessions/' + sessionId).remove();
            return null;
        }
        return session;
    } catch(e) {
        return null;
    }
}

async function destroySession(sessionId) {
    if (sessionId) {
        await db.ref('sessions/' + sessionId).remove();
    }
}

async function cleanupExpiredSessions() {
    try {
        const snap = await db.ref('sessions').once('value');
        const data = snap.val();
        if (!data) return;
        const now = Date.now();
        for (const key in data) {
            if (data[key] && data[key].data) {
                try {
                    const session = decryptData(data[key].data);
                    if (session.expires && now > session.expires) {
                        await db.ref('sessions/' + key).remove();
                    }
                } catch (e) {}
            }
        }
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

// ==================== SCHEDULER ====================
setInterval(cleanupExpiredSessions, 3600000); // Setiap 1 jam
setInterval(cleanupOldAttempts, 86400000); // Setiap 24 jam

export default async function handler(req, res) {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',');
    const origin = req.headers.origin;
    
    // CORS - Hanya izinkan origin yang terdaftar
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    } else if (!origin) {
        // Allow same-origin requests (no Origin header)
        res.setHeader('Access-Control-Allow-Origin', '*');
    } else {
        // Tolak origin yang tidak dikenal
        return res.status(403).json({ error: 'Origin not allowed' });
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Fingerprint, X-Operator, X-Session');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const fp = req.headers['x-fingerprint'] || '';

    if (!await checkRateLimit(ip)) {
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

        // ==================== CHECK SESSION ====================
        const publicPaths = ['admin/login_success', 'admin/auth', 'check_blocked', 'access_key', 'logout', 'login', 'login_failed', 'login_success'];
        
        if (!publicPaths.includes(parsed.path)) {
            const sessionId = req.headers['x-session'];
            if (!sessionId) {
                return res.status(401).json({ error: 'Session required', data: encryptData({ error: 'Unauthorized' }) });
            }
            
            const session = await checkSession(sessionId);
            if (!session) {
                return res.status(401).json({ error: 'Invalid or expired session', data: encryptData({ error: 'Unauthorized' }) });
            }
            
            // Extend session
            if (session.expires && Date.now() > session.expires - SESSION_EXTEND_THRESHOLD) {
                session.expires = Date.now() + SESSION_DURATION;
                const enc = encryptData(session);
                await db.ref('sessions/' + sessionId).update({ data: enc });
            }
        }

        const ref = db.ref(parsed.path);

        // ==================== CHECK BLOCKED ====================
        if (parsed.path === 'check_blocked' && parsed.method === 'POST') {
            const ipBlocked = await isIPBlocked(ip);
            const fpBlocked = fp ? await isFPBlocked(fp) : false;
            const result = { blocked: ipBlocked || fpBlocked };
            return res.status(200).json({ data: encryptData(result) });
        }

        // ==================== ACCESS KEY ====================
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

        // ==================== ADMIN AUTH ====================
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

        // ==================== LOGIN FAILED ====================
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

        // ==================== LOGIN SUCCESS ====================
        if ((parsed.path === 'admin/login_success' || parsed.path === 'login_success') && parsed.method === 'POST') {
            await resetLoginAttempt(ip, fp);
            
            const email = sanitizeInput(parsed.data.email || parsed.data.username || 'admin');
            
            const sessionId = await createSession(email, ip, fp);
            
            const oldSession = req.headers['x-session'];
            if (oldSession) {
                await destroySession(oldSession);
            }
            
            const result = { 
                success: true, 
                sessionId: sessionId,
                email: email
            };
            
            return res.status(200).json({ data: encryptData(result) });
        }

        // ==================== LOGOUT ====================
        if (parsed.path === 'logout' && parsed.method === 'POST') {
            const sessionId = req.headers['x-session'];
            if (sessionId) {
                await destroySession(sessionId);
            }
            const result = { success: true, message: 'Logout berhasil' };
            return res.status(200).json({ data: encryptData(result) });
        }

        // ==================== USER LOGIN (DENGAN BCRYPT) ====================
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

            const username = sanitizeInput(parsed.data.username);
            const password = parsed.data.password;
            const currentIP = parsed.data.ip || ip;
            const currentFP = parsed.data.fingerprint || fp;

            for (const key in users) {
                const userData = decryptData(users[key].data);
                
                if (userData && userData.username === username) {
                    let isPasswordValid = false;
                    
                    // Verifikasi password - support hash dan legacy plaintext
                    if (userData.password_hash) {
                        isPasswordValid = await verifyPassword(password, userData.password_hash);
                    } else if (userData.password) {
                        // Legacy plaintext - temporary support + auto-migrasi
                        isPasswordValid = (password === userData.password);
                        
                        if (isPasswordValid) {
                            const hashedPassword = await hashPassword(password);
                            if (hashedPassword) {
                                const updatedData = { ...userData, password_hash: hashedPassword };
                                delete updatedData.password;
                                await db.ref('users/' + key).update({ data: encryptData(updatedData) });
                                await logActivity(username, 'password_migrated', 'Password di-hash otomatis', currentIP, currentFP);
                            }
                        }
                    }
                    
                    if (!isPasswordValid) {
                        continue; // Password salah, coba user lain
                    }

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

                    const sessionId = await createSession(username, currentIP, currentFP);

                    const result = {
                        success: true,
                        sessionId: sessionId,
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

        // ==================== MIGRASI PASSWORD ====================
        if (parsed.path === 'migrate_passwords' && parsed.method === 'POST') {
            const snap = await db.ref('users').once('value');
            const users = snap.val();
            
            if (!users) {
                const result = { success: false, error: 'Tidak ada user untuk dimigrasi' };
                return res.status(200).json({ data: encryptData(result) });
            }
            
            let migrated = 0;
            let skipped = 0;
            let failed = 0;
            const migratedUsers = [];
            
            for (const key in users) {
                try {
                    const userData = decryptData(users[key].data);
                    
                    if (!userData || !userData.username) {
                        skipped++;
                        continue;
                    }
                    
                    // Cek apakah sudah di-hash
                    if (userData.password_hash) {
                        skipped++;
                        continue;
                    }
                    
                    // Cek apakah ada password plaintext
                    if (!userData.password) {
                        skipped++;
                        continue;
                    }
                    
                    // Hash password
                    const hashedPassword = await hashPassword(userData.password);
                    if (!hashedPassword) {
                        failed++;
                        continue;
                    }
                    
                    // Update data user
                    const updatedData = { ...userData };
                    updatedData.password_hash = hashedPassword;
                    delete updatedData.password;
                    
                    await db.ref('users/' + key).update({ data: encryptData(updatedData) });
                    
                    migrated++;
                    migratedUsers.push(userData.username);
                    
                    await logActivity(userData.username, 'password_migrated', 'Password di-hash (migrasi massal)', ip, fp);
                    
                } catch (e) {
                    failed++;
                    console.error('Migrasi error untuk user:', e.message);
                }
            }
            
            const result = {
                success: true,
                migrated: migrated,
                skipped: skipped,
                failed: failed,
                total: Object.keys(users).length,
                migratedUsers: migratedUsers
            };
            
            return res.status(200).json({ data: encryptData(result) });
        }

        // ==================== BLOCK IP MANUAL ====================
        if (parsed.path === 'block_ip_manual' && parsed.method === 'POST') {
            await blockIP(parsed.data.ip);
            await logActivity('admin', 'block_ip', 'IP ' + parsed.data.ip + ' diblokir manual', ip, fp);
            return res.status(200).json({ data: encryptData({ success: true }) });
        }

        // ==================== BLOCK FP MANUAL ====================
        if (parsed.path === 'block_fp_manual' && parsed.method === 'POST') {
            await blockFP(parsed.data.fp);
            await logActivity('admin', 'block_fp', 'FP diblokir manual', ip, fp);
            return res.status(200).json({ data: encryptData({ success: true }) });
        }

        // ==================== ACTION KEYS ====================
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
            const keyValue = parsed.data.key;
            
            const enc = encryptData({ key: keyValue, createdAt: Date.now() });
            const newRef = ref.push();
            await newRef.set({ data: enc });
            
            return res.status(200).json({ data: encryptData({ success: true, id: newRef.key }) });
        }

        if (parsed.path.startsWith('action_keys/') && parsed.method === 'DELETE') {
            const id = parsed.path.replace('action_keys/', '');
            await db.ref('action_keys/' + id).remove();
            return res.status(200).json({ data: encryptData({ success: true }) });
        }

        // ==================== IP WHITELIST ====================
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
            const enc = encryptData({ ip: sanitizeInput(parsed.data.ip), createdAt: Date.now() });
            const newRef = ref.push();
            await newRef.set({ data: enc });
            return res.status(200).json({ data: encryptData({ success: true, id: newRef.key }) });
        }

        if (parsed.path.startsWith('ip_whitelist/') && parsed.method === 'DELETE') {
            const id = parsed.path.replace('ip_whitelist/', '');
            await db.ref('ip_whitelist/' + id).remove();
            return res.status(200).json({ data: encryptData({ success: true }) });
        }

        // ==================== FP WHITELIST ====================
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
            const enc = encryptData({ fp: sanitizeInput(parsed.data.fp), createdAt: Date.now() });
            const newRef = ref.push();
            await newRef.set({ data: enc });
            return res.status(200).json({ data: encryptData({ success: true, id: newRef.key }) });
        }

        if (parsed.path.startsWith('fp_whitelist/') && parsed.method === 'DELETE') {
            const id = parsed.path.replace('fp_whitelist/', '');
            await db.ref('fp_whitelist/' + id).remove();
            return res.status(200).json({ data: encryptData({ success: true }) });
        }

        // ==================== GET ADMIN KEY ====================
        if (parsed.path === 'admin/get_key' && parsed.method === 'GET') {
            const result = { adminKey: ADMIN_KEY };
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
            // Validasi data
            if (!validateData(parsed.path, parsed.data)) {
                return res.status(400).json({ error: 'Invalid data', data: encryptData({ error: 'Data tidak valid' }) });
            }
            
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
            
            // Jika ada password baru, hash dulu
            if (parsed.data.password) {
                const hashedPassword = await hashPassword(parsed.data.password);
                if (hashedPassword) {
                    parsed.data.password_hash = hashedPassword;
                    delete parsed.data.password;
                }
            }
            
            const merged = Object.assign({}, existingData, parsed.data);
            const enc = encryptData(merged);
            await ref.update({ data: enc });

            const username = existingData.username || 'unknown';
            if (parsed.data.banned === true) await logActivity(username, 'banned', 'User dibanned', ip, fp);
            if (parsed.data.banned === false) await logActivity(username, 'unbanned', 'User di-unban', ip, fp);
            if (parsed.data.banAkses === true) await logActivity(username, 'ban_akses', 'Akses user dibanned', ip, fp);
            if (parsed.data.banAkses === false) await logActivity(username, 'unban_akses', 'Akses user di-unban', ip, fp);
            if (parsed.data.forceLogout === true) await logActivity(username, 'force_logout', 'User ditangguhkan', ip, fp);
            if (parsed.data.forceLogout === false) await logActivity(username, 'unforce_logout', 'Tangguhan dilepas', ip, fp);
            if (parsed.data.password_hash) await logActivity(username, 'password_changed', 'Password diubah', ip, fp);

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

// ==================== HELPER FUNCTIONS ====================
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
            username: sanitizeInput(username),
            action: sanitizeInput(action),
            details: sanitizeInput(details || ''),
            ip: ip || '',
            fingerprint: fp || '',
            timestamp: Date.now()
        });
        const newRef = db.ref('activity_logs').push();
        await newRef.set({ data: enc });
    } catch (e) {}
}