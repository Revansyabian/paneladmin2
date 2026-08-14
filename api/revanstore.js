import CryptoJS from 'crypto-js';
import admin from 'firebase-admin';
import bcrypt from 'bcryptjs';

const ADMIN_KEY = process.env.ADMIN_KEY;
if (!ADMIN_KEY) {
    throw new Error('ADMIN_KEY is required!');
}

const SALT_ROUNDS = 12;
const SESSION_DURATION = 3600000;
const SESSION_EXTEND_THRESHOLD = 300000;
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

async function hashPassword(password) {
    try {
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        return await bcrypt.hash(password, salt);
    } catch (e) {
        return null;
    }
}

async function verifyPassword(password, hash) {
    try {
        return await bcrypt.compare(password, hash);
    } catch (e) {
        return false;
    }
}

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

function sanitizeInput(str) {
    if (!str) return '';
    return String(str)
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

function validateData(path, data) {
    if (!data || typeof data !== 'object') return false;
    if (path === 'users' || path.startsWith('users/')) {
        if (data.username !== undefined && (typeof data.username !== 'string' || data.username.length < 3)) return false;
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

export default async function handler(req, res) {
    // ==================== CORS ====================
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Fingerprint, X-Operator, X-Session');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const fp = req.headers['x-fingerprint'] || '';

    if (!await checkRateLimit(ip)) {
        return res.status(429).json({ error: 'Terlalu banyak request.' });
    }

    try {
        let parsed;
        const body = req.body;
        
        if (!body) {
            return res.status(400).json({ error: 'No data' });
        }
        
        // SUPPORT BOTH FORMATS
        if (body.path && typeof body.path === 'string') {
            parsed = body;
        } else if (body.data && typeof body.data === 'string') {
            const decrypted = decryptData(body.data);
            if (!decrypted) {
                return res.status(403).json({ error: 'Access denied' });
            }
            parsed = decrypted;
        } else if (body.data && typeof body.data === 'object') {
            parsed = body.data;
        } else {
            return res.status(400).json({ error: 'No data' });
        }

        if (!parsed.path || typeof parsed.path !== 'string' || parsed.path.length > 200) {
            return res.status(400).json({ error: 'Invalid path' });
        }

        const ref = db.ref(parsed.path);

        // ==================== CHECK SESSION ====================
        const publicPaths = ['admin/login_success', 'admin/auth', 'check_blocked', 'access_key', 'logout', 'login', 'login_failed', 'login_success', 'migrate_passwords'];
        
        if (!publicPaths.includes(parsed.path)) {
            const sessionId = req.headers['x-session'];
            if (!sessionId) {
                return res.status(401).json({ error: 'Session required' });
            }
            const session = await checkSession(sessionId);
            if (!session) {
                return res.status(401).json({ error: 'Invalid or expired session' });
            }
        }

        // ==================== CHECK BLOCKED ====================
        if (parsed.path === 'check_blocked' && parsed.method === 'POST') {
            const ipBlocked = await isIPBlocked(ip);
            const fpBlocked = fp ? await isFPBlocked(fp) : false;
            return res.status(200).json({ blocked: ipBlocked || fpBlocked });
        }

        // ==================== ACCESS KEY ====================
        if (parsed.path === 'access_key' && parsed.method === 'GET') {
            const snap = await db.ref('access_key').once('value');
            const raw = snap.val();
            let result = { key: '' };
            if (raw && raw.data) {
                try { result = decryptData(raw.data); } catch (e) {}
            }
            return res.status(200).json(result);
        }

        // ==================== ADMIN AUTH ====================
        if (parsed.path === 'admin/auth' && parsed.method === 'GET') {
            const snap = await ref.once('value');
            const raw = snap.val();
            let result = {};
            if (raw && raw.data) {
                try { result = decryptData(raw.data); } catch (e) {}
            }
            return res.status(200).json(result);
        }

        // ==================== LOGIN SUCCESS ====================
        if ((parsed.path === 'admin/login_success' || parsed.path === 'login_success') && parsed.method === 'POST') {
            await resetLoginAttempt(ip, fp);
            const email = sanitizeInput(parsed.data?.email || parsed.data?.username || 'admin');
            const sessionId = await createSession(email, ip, fp);
            return res.status(200).json({ success: true, sessionId: sessionId, email: email });
        }

        // ==================== LOGIN FAILED ====================
        if ((parsed.path === 'admin/login_failed' || parsed.path === 'login_failed') && parsed.method === 'POST') {
            const attempts = await trackLoginAttempt(ip, fp);
            await new Promise(r => setTimeout(r, Math.min(attempts * 500, 3000)));
            if (attempts >= 5) {
                await blockIP(ip);
                if (fp) await blockFP(fp);
                return res.status(200).json({ blocked: true });
            }
            return res.status(200).json({ attempts: attempts, remaining: 5 - attempts });
        }

        // ==================== LOGOUT ====================
        if (parsed.path === 'logout' && parsed.method === 'POST') {
            const sessionId = req.headers['x-session'];
            if (sessionId) await destroySession(sessionId);
            return res.status(200).json({ success: true });
        }

        // ==================== USER LOGIN ====================
        if (parsed.path === 'login' && parsed.method === 'POST') {
            const snap = await db.ref('users').once('value');
            const users = snap.val();
            if (!users) return res.status(200).json({ success: false });

            const username = sanitizeInput(parsed.data?.username || '');
            const password = parsed.data?.password || '';
            
            for (const key in users) {
                const userData = decryptData(users[key].data);
                if (userData && userData.username === username) {
                    let isPasswordValid = false;
                    
                    if (userData.password_hash) {
                        isPasswordValid = await verifyPassword(password, userData.password_hash);
                    } else if (userData.password) {
                        isPasswordValid = (password === userData.password);
                        if (isPasswordValid) {
                            const hashedPassword = await hashPassword(password);
                            if (hashedPassword) {
                                const updatedData = { ...userData, password_hash: hashedPassword };
                                delete updatedData.password;
                                await db.ref('users/' + key).update({ data: encryptData(updatedData) });
                            }
                        }
                    }
                    
                    if (!isPasswordValid) continue;
                    
                    const sessionId = await createSession(username, ip, fp);
                    return res.status(200).json({
                        success: true,
                        sessionId: sessionId,
                        data: {
                            id: key,
                            username: userData.username,
                            role: userData.role || 'Operator',
                            full_name: userData.full_name || userData.username,
                            expiry_date: userData.expiry_date || ''
                        }
                    });
                }
            }
            
            return res.status(200).json({ success: false });
        }

        // ==================== MIGRASI PASSWORD ====================
        if (parsed.path === 'migrate_passwords' && parsed.method === 'POST') {
            const snap = await db.ref('users').once('value');
            const users = snap.val();
            if (!users) return res.status(200).json({ success: false, error: 'Tidak ada user' });
            
            let migrated = 0, skipped = 0, failed = 0;
            
            for (const key in users) {
                try {
                    const userData = decryptData(users[key].data);
                    if (!userData || !userData.username) { skipped++; continue; }
                    if (userData.password_hash) { skipped++; continue; }
                    if (!userData.password) { skipped++; continue; }
                    
                    const hashedPassword = await hashPassword(userData.password);
                    if (!hashedPassword) { failed++; continue; }
                    
                    const updatedData = { ...userData, password_hash: hashedPassword };
                    delete updatedData.password;
                    await db.ref('users/' + key).update({ data: encryptData(updatedData) });
                    migrated++;
                } catch (e) {
                    failed++;
                }
            }
            
            return res.status(200).json({ success: true, migrated, skipped, failed, total: Object.keys(users).length });
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
            return res.status(200).json(result);
        }

        if (parsed.method === 'POST') {
            if (!validateData(parsed.path, parsed.data)) {
                return res.status(400).json({ error: 'Invalid data' });
            }
            
            // Hash password jika ada
            let dataToSave = { ...parsed.data };
            if (dataToSave.password) {
                const hashedPassword = await hashPassword(dataToSave.password);
                if (hashedPassword) {
                    dataToSave.password_hash = hashedPassword;
                    delete dataToSave.password;
                }
            }
            
            const enc = encryptData(dataToSave);
            const newRef = ref.push();
            await newRef.set({ data: enc });
            
            return res.status(200).json({ success: true, id: newRef.key });
        }

        if (parsed.method === 'PATCH') {
            const snap = await ref.once('value');
            const existing = snap.val();
            let existingData = {};
            if (existing && existing.data) {
                try { existingData = decryptData(existing.data); } catch (e) {}
            }
            
            let dataToMerge = { ...parsed.data };
            if (dataToMerge.password) {
                const hashedPassword = await hashPassword(dataToMerge.password);
                if (hashedPassword) {
                    dataToMerge.password_hash = hashedPassword;
                    delete dataToMerge.password;
                }
            }
            
            const merged = Object.assign({}, existingData, dataToMerge);
            const enc = encryptData(merged);
            await ref.update({ data: enc });
            
            return res.status(200).json({ success: true });
        }

        if (parsed.method === 'PUT') {
            const enc = encryptData(parsed.data);
            await ref.set({ data: enc });
            return res.status(200).json({ success: true });
        }

        if (parsed.method === 'DELETE') {
            await ref.remove();
            return res.status(200).json({ success: true });
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
    const enc = encryptData({ ip, blocked: true, blocked_at: new Date().toISOString() });
    await db.ref('blocked_ips/' + ip.replace(/\./g, '_')).set({ data: enc });
}

async function blockFP(fp) {
    if (!fp) return;
    const enc = encryptData({ fingerprint: fp, blocked: true, blocked_at: new Date().toISOString() });
    await db.ref('blocked_fp/' + fp).set({ data: enc });
}

async function trackLoginAttempt(ip, fp) {
    const key = ip.replace(/\./g, '_') + '_' + (fp || 'nofp');
    const ref = db.ref('login_attempts/' + key);
    const snap = await ref.once('value');
    const raw = snap.val();
    const now = Date.now();
    let attempts = 0;
    
    if (raw && raw.data) {
        try {
            const data = decryptData(raw.data);
            attempts = data.count || 0;
            if (now - (data.last_attempt || 0) > 3600000) {
                await ref.remove();
                const enc = encryptData({ count: 1, last_attempt: now, fingerprint: fp });
                await ref.set({ data: enc });
                return 1;
            }
        } catch (e) {}
    }
    
    const enc = encryptData({ count: attempts + 1, last_attempt: now, fingerprint: fp });
    await ref.set({ data: enc });
    return attempts + 1;
}

async function resetLoginAttempt(ip, fp) {
    const key = ip.replace(/\./g, '_') + '_' + (fp || 'nofp');
    await db.ref('login_attempts/' + key).remove();
}