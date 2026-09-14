import CryptoJS from 'crypto-js';
import admin from 'firebase-admin';
import bcrypt from 'bcryptjs';

const ADMIN_KEY = process.env.ADMIN_KEY;
const API_SECRET = process.env.API_SECRET || '1417-1426-1527-1517';
if (!ADMIN_KEY) throw new Error('ADMIN_KEY is required!');

const SALT_ROUNDS = 12;
const SESSION_DURATION = 3600000;
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW = 60000;

if (!admin.apps.length) {
    const key = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
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

function encryptData(data) {
    return CryptoJS.AES.encrypt(JSON.stringify(data), ADMIN_KEY).toString();
}
function decryptData(raw) {
    if (!raw) return null;
    try {
        const bytes = CryptoJS.AES.decrypt(String(raw), ADMIN_KEY);
        const text = bytes.toString(CryptoJS.enc.Utf8);
        return text ? JSON.parse(text) : null;
    } catch {
        return null;
    }
}
function encryptResponse(data) {
    return { data: CryptoJS.AES.encrypt(JSON.stringify(data), API_SECRET).toString() };
}
function decryptRequest(encryptedData) {
    try {
        const bytes = CryptoJS.AES.decrypt(String(encryptedData), API_SECRET);
        const text = bytes.toString(CryptoJS.enc.Utf8);
        return text ? JSON.parse(text) : null;
    } catch {
        return null;
    }
}
async function hashPassword(password) {
    try { return await bcrypt.hash(String(password), await bcrypt.genSalt(SALT_ROUNDS)); }
    catch { return null; }
}
async function verifyPassword(password, hash) {
    try { return !!(password && hash && await bcrypt.compare(String(password), String(hash))); }
    catch { return false; }
}
function isBcryptHash(value) {
    return typeof value === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}
async function checkRateLimit(ip) {
    const key = String(ip || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    const ref = db.ref('rate_limits/' + key);
    const snap = await ref.once('value');
    const raw = snap.val();
    const now = Date.now();
    let data = raw?.data ? decryptData(raw.data) : null;
    if (data && now - (data.timestamp || 0) < RATE_LIMIT_WINDOW) {
        if ((data.count || 0) >= RATE_LIMIT_MAX) return false;
        data.count = (data.count || 0) + 1;
        await ref.set({ data: encryptData(data) });
        return true;
    }
    await ref.set({ data: encryptData({ count: 1, timestamp: now }) });
    return true;
}
function sanitizeInput(str) {
    return String(str ?? '').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}
function validateData(path, data) {
    if (!data || typeof data !== 'object') return false;
    if (path === 'users' || path.startsWith('users/')) {
        if (data.username !== undefined && (typeof data.username !== 'string' || data.username.length < 3)) return false;
    }
    return true;
}
async function createSession(email, ip, fp) {
    const sessionId = CryptoJS.lib.WordArray.random(32).toString();
    await db.ref('sessions/' + sessionId).set({
        data: encryptData({
            email, ip, fingerprint: fp || '', created: Date.now(),
            expires: Date.now() + SESSION_DURATION
        })
    });
    return sessionId;
}
async function checkSession(sessionId) {
    if (!sessionId) return null;
    const snap = await db.ref('sessions/' + sessionId).once('value');
    const raw = snap.val();
    if (!raw?.data) return null;
    const session = decryptData(raw.data);
    if (!session) return null;
    if (session.expires && Date.now() > session.expires) {
        await db.ref('sessions/' + sessionId).remove();
        return null;
    }
    return session;
}
async function destroySession(id) {
    if (id) await db.ref('sessions/' + id).remove();
}
async function isIPBlocked(ip) {
    if (!ip || ['unknown','::1','127.0.0.1'].includes(ip)) return false;
    const keys = [ip.replace(/\./g,'_'), ip, ip.replace(/:/g,'_')];
    for (const key of keys) {
        const raw = (await db.ref('blocked_ips/' + key).once('value')).val();
        const data = raw?.data ? decryptData(raw.data) : null;
        if (data?.blocked === true) return true;
    }
    return false;
}
async function isFPBlocked(fp) {
    if (!fp) return false;
    const raw = (await db.ref('blocked_fp/' + fp).once('value')).val();
    const data = raw?.data ? decryptData(raw.data) : null;
    return data?.blocked === true;
}
async function blockIP(ip) {
    if (!ip || ['unknown','::1','127.0.0.1'].includes(ip)) return;
    const data = encryptData({ ip, blocked:true, blocked_at:Date.now(), reason:'Too many failed attempts' });
    await db.ref('blocked_ips/' + ip.replace(/\./g,'_')).set({data});
    await db.ref('blocked_ips/' + ip).set({data});
}
async function blockFP(fp) {
    if (!fp) return;
    await db.ref('blocked_fp/' + fp).set({data:encryptData({
        fingerprint:fp, blocked:true, blocked_at:Date.now(), reason:'Too many failed attempts'
    })});
}
async function unblockIP(ip) {
    if (!ip) return;
    await db.ref('blocked_ips/' + ip.replace(/\./g,'_')).remove();
    await db.ref('blocked_ips/' + ip).remove();
}
async function unblockFP(fp) {
    if (fp) await db.ref('blocked_fp/' + fp).remove();
}
async function trackLoginAttempt(ip, fp) {
    const key = ip.replace(/[^a-zA-Z0-9_-]/g,'_') + '_' + (fp || 'nofp');
    const ref = db.ref('login_attempts/' + key);
    const raw = (await ref.once('value')).val();
    const old = raw?.data ? decryptData(raw.data) : null;
    const now = Date.now();
    if (old && now - (old.last_attempt || 0) <= 3600000) {
        old.count = (old.count || 0) + 1;
        old.last_attempt = now;
        await ref.set({data:encryptData(old)});
        return old.count;
    }
    await ref.set({data:encryptData({count:1,last_attempt:now,fingerprint:fp||''})});
    return 1;
}
async function resetLoginAttempt(ip, fp) {
    const key = ip.replace(/[^a-zA-Z0-9_-]/g,'_') + '_' + (fp || 'nofp');
    await db.ref('login_attempts/' + key).remove();
}

export default async function handler(req, res) {
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Fingerprint, X-Operator, X-Session');
    res.setHeader('Access-Control-Allow-Credentials','true');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    const fp = String(req.headers['x-fingerprint'] || '');
    if (!await checkRateLimit(ip)) return res.status(429).json(encryptResponse({error:'RATE_LIMIT: Terlalu banyak request.'}));

    try {
        const body = req.body;
        if (!body) return res.status(400).json(encryptResponse({error:'BAD_REQUEST: No data provided.'}));

        let parsed = null;
        if (body.data && typeof body.data === 'string') parsed = decryptRequest(body.data);
        else if (body.path && typeof body.path === 'string') parsed = body;
        if (!parsed) return res.status(403).json(encryptResponse({error:'FORBIDDEN: Invalid encryption.'}));
        if (!parsed.path || typeof parsed.path !== 'string' || parsed.path.length > 200)
            return res.status(400).json(encryptResponse({error:'BAD_REQUEST: Invalid path.'}));

        const publicPaths = [
            'admin/login_success','admin/auth','check_blocked','access_key','logout',
            'login','login_failed','login_success','migrate_passwords','block_ip','block_fp'
        ];
        if (!publicPaths.includes(parsed.path)) {
            const session = await checkSession(req.headers['x-session']);
            if (!session) return res.status(401).json(encryptResponse({error:'UNAUTHORIZED: Session required.'}));
        }

        if (parsed.path === 'check_blocked') {
            const ipBlocked = await isIPBlocked(ip);
            const fpBlocked = await isFPBlocked(fp);
            return res.json(encryptResponse({
                blocked: ipBlocked || fpBlocked, ipBlocked, fpBlocked,
                ip, fingerprint: fp, checkedAt: Date.now()
            }));
        }

        if (parsed.path === 'access_key' && parsed.method === 'GET') {
            const raw = (await db.ref('access_key').once('value')).val();
            return res.json(encryptResponse(raw?.data ? (decryptData(raw.data) || {}) : {}));
        }

        if (parsed.path === 'admin/auth' && parsed.method === 'GET') {
            const raw = (await db.ref('admin/auth').once('value')).val();
            return res.json(encryptResponse(raw?.data ? (decryptData(raw.data) || {}) : {}));
        }

        if ((parsed.path === 'admin/login_success' || parsed.path === 'login_success') && parsed.method === 'POST') {
            await resetLoginAttempt(ip, fp);
            const email = sanitizeInput(parsed.data?.email || parsed.data?.username || 'admin');
            const sessionId = await createSession(email, ip, fp);
            return res.json(encryptResponse({success:true,sessionId,email}));
        }

        if ((parsed.path === 'admin/login_failed' || parsed.path === 'login_failed') && parsed.method === 'POST') {
            const attempts = await trackLoginAttempt(ip, fp);
            if (attempts >= 3) {
                await blockIP(ip);
                if (fp) await blockFP(fp);
                return res.json(encryptResponse({blocked:true,attempts}));
            }
            return res.json(encryptResponse({attempts,remaining:3-attempts}));
        }

        if (parsed.path === 'logout' && parsed.method === 'POST') {
            await destroySession(req.headers['x-session']);
            return res.json(encryptResponse({success:true}));
        }

        if (parsed.path === 'block_ip' && parsed.method === 'POST') {
            const target = String(parsed.data?.ip || '');
            if (!target) return res.status(400).json(encryptResponse({error:'BAD_REQUEST: IP tidak valid.'}));
            await blockIP(target);
            return res.json(encryptResponse({success:true,blocked:true,ip:target}));
        }
        if (parsed.path === 'block_fp' && parsed.method === 'POST') {
            const target = String(parsed.data?.fp || '');
            if (!target) return res.status(400).json(encryptResponse({error:'BAD_REQUEST: FP required.'}));
            await blockFP(target);
            return res.json(encryptResponse({success:true,blocked:true,fp:target}));
        }

        if (parsed.path === 'login' && parsed.method === 'POST') {
            const users = (await db.ref('users').once('value')).val() || {};
            const username = sanitizeInput(parsed.data?.username || '');
            const password = parsed.data?.password || '';
            for (const key of Object.keys(users)) {
                const userData = decryptData(users[key]?.data);
                if (!userData || userData.username !== username) continue;
                let valid = false;
                if (userData.password_hash) valid = await verifyPassword(password, userData.password_hash);
                else if (userData.password) {
                    valid = password === userData.password;
                    if (valid) {
                        const h = await hashPassword(password);
                        if (h) {
                            const migrated = {...userData,password_hash:h};
                            delete migrated.password;
                            await db.ref('users/'+key).update({data:encryptData(migrated)});
                        }
                    }
                }
                if (!valid) continue;
                if (userData.banned === true) return res.json(encryptResponse({success:false,error:'banned',banUntil:userData.bannedUntil||0}));
                if (userData.banAkses === true && (!userData.banAksesUntil || userData.banAksesUntil === 0 || Date.now() < userData.banAksesUntil))
                    return res.json(encryptResponse({success:false,error:'banakses',banAksesUntil:userData.banAksesUntil||0}));
                if (userData.forceLogout === true) return res.json(encryptResponse({success:false,error:'force_logout'}));
                const sessionId = await createSession(username,ip,fp);
                return res.json(encryptResponse({success:true,sessionId,data:{
                    id:key,username:userData.username,role:userData.role||'Operator',
                    full_name:userData.full_name||userData.username,expiry_date:userData.expiry_date||'',
                    balance:userData.balance||0
                }}));
            }
            return res.json(encryptResponse({success:false}));
        }

        if (parsed.path === 'migrate_passwords' && parsed.method === 'POST') {
            const users = (await db.ref('users').once('value')).val() || {};
            let migrated=0, skipped=0, failed=0, plaintext=0, alreadyHashed=0;
            for (const key of Object.keys(users)) {
                try {
                    const data = decryptData(users[key]?.data);
                    if (!data?.username) { skipped++; continue; }
                    if (isBcryptHash(data.password_hash)) { alreadyHashed++; skipped++; continue; }
                    if (!data.password) { skipped++; continue; }
                    plaintext++;
                    const h = await hashPassword(data.password);
                    if (!h) { failed++; continue; }
                    const out = {...data,password_hash:h};
                    delete out.password;
                    await db.ref('users/'+key).update({data:encryptData(out)});
                    migrated++;
                } catch { failed++; }
            }
            return res.json(encryptResponse({success:true,migrated,skipped,failed,plaintext,alreadyHashed,total:Object.keys(users).length}));
        }

        const ref = db.ref(parsed.path);
        if (parsed.method === 'GET') {
            const snap = await ref.once('value');
            const raw = snap.val();
            const result = {};
            if (raw) {
                for (const key of Object.keys(raw)) {
                    if (raw[key]?.data) {
                        const dec = decryptData(raw[key].data);
                        if (dec !== null) { dec.id = key; result[key] = dec; }
                    }
                }
            }
            return res.json(encryptResponse(result));
        }
        if (parsed.method === 'POST') {
            if (!validateData(parsed.path, parsed.data)) return res.status(400).json(encryptResponse({error:'BAD_REQUEST: Invalid data.'}));
            const data = {...parsed.data};
            if (data.password) {
                const h = await hashPassword(data.password);
                if (!h) return res.status(500).json(encryptResponse({error:'HASH_FAILED'}));
                data.password_hash = h;
                delete data.password;
            }
            const newRef = ref.push();
            await newRef.set({data:encryptData(data)});
            return res.json(encryptResponse({success:true,id:newRef.key}));
        }
        if (parsed.method === 'PATCH') {
            const existing = (await ref.once('value')).val();
            const current = existing?.data ? (decryptData(existing.data) || {}) : {};
            const patch = {...(parsed.data||{})};
            if (patch.password) {
                const h = await hashPassword(patch.password);
                if (!h) return res.status(500).json(encryptResponse({error:'HASH_FAILED'}));
                patch.password_hash = h;
                delete patch.password;
            }
            await ref.set({data:encryptData({...current,...patch})});
            return res.json(encryptResponse({success:true}));
        }
        if (parsed.method === 'PUT') {
            await ref.set({data:encryptData(parsed.data||{})});
            return res.json(encryptResponse({success:true}));
        }
        if (parsed.method === 'DELETE') {
            await ref.remove();
            return res.json(encryptResponse({success:true}));
        }
        return res.status(400).json(encryptResponse({error:'BAD_REQUEST: Invalid method.'}));
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json(encryptResponse({error:'INTERNAL_ERROR'}));
    }
}
