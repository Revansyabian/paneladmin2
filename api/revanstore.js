import CryptoJS from 'crypto-js';
import admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            type: "service_account",
            project_id: "dhagwxwhu",
            private_key_id: "f4afc5aa03e73130f5e055dfe6a708c4dc40759b",
            private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDa1ySxVtAR7yk3\noWtpNRDYlT/p4MhiJzqD4eIKlyhIVH6bgYBXGd+HtWUIoO3Gv+HBKZQ71ESDOaSH\nxEBsZJV84HyqrjntjdaC5sac5+IJ7e1wfDhK/RCIDLHyjjlI0rsc8wOV5Qi95qUA\nUymh6UNE9YsUJMwX+KfkiI8nV1AOGUigqKQ26ucT9B1u5v/iP9RiwXZv08DLbMfl\nXSZHU0ctSo5Yo0fBdXsRAGFmYh7eIUjkL+L8h6xbbKfVsp6fFvu871H/qP6v0NcG\nC1ZRoywy4xdCJMMrw/1b3WDgInYV9Bzr3h+L2mdPk17GvGPgY292RN+Qn4uUD2tX\noW98kaKbAgMBAAECggEAMvN1WQ6vygUnUQr1oZyXy/1P0KmjreqZPpxoTvPrjo+R\nnK4VjfH5r7SFjfE9+xCwxJLkLtvYib7xdiS0pSf0AAuaKvj+hrcH0xlc86ovYAVz\ny0U4rAjogOyHv8PqRXC+3NodoxgcpW4eS4mRP1+6aENM+scod4pOuLAsuEmlW2qM\nSmi63miQEToiI2e5eHQYoA15cTVsddz1Nes05rKVAdnMgtyQF3/F2SaIAkxhqJbu\nclliVZwU9himfYkZderoWCfIoIIaikbdoYaZa5Z+rF9fgEpvlSNiP4wukTpIYBnW\nHuxT5EIQib+wXfaWO+Km2h+9qEuZrEsXJsDb4jbmzQKBgQD1jIFu/VM4xA9VbfYW\nKmKEyrw0SAjsmuROg2es5c7jCcdC5OQOGmhMJMXHJUF9Ekz2/OlzEPoBy6IMYuJQ\n3PZG84vmDGGOTS0QNXt7HZm4X2Ahf8w+cg2avYZRltCNgJwVZaP/Gb/i1TU3yWdf\n+NWFxeZvfC9nbVfNXWO+oHHgfwKBgQDkJ5+F+RE3v6/56oucv5Bzo0sadxGCgNte\n5sEjwAAHnsFoULBnLWZd6NeFKNXfPpHFb+wwEJ/vkI+zKREIEpHiD058qgqPl/GM\n6KraKxZooSLgjtkjHM0WTpskGbdaJwcsu4e3sZlRLw7Z8dCpkPvz5Li8+H2hgaFa\nr3jDI0Ov5QKBgHRHjEe+CPn5xnUjNIT8n1jZFNUBQ9Cf7PvNOHxk+1sCl2zzLZgM\nI1XjmBEdcGzFDNNtozONV4cgImYRMbEvYiTpUlenh0829t8VJJuBwfjQmZpjhZoQ\nsqaTl5btf2dy/vcXAdldHURSyPfZFW4aTSsjM2OaAGzPF+Q1lHWCT0sLAoGAaHec\nG4QH1jb3JL+4XXV5dvl2EhAi/FZ0G+gc13m6icKvXExV+WhYTvemd1pTU30a0gSF\naRyznsXahnZvTfrywUew8HQLkeRIvfRrBqpkAFSH27qMwf8WCPjFIKqFwcnNBzZ2\n1i2DviCF9FU87eds9ifsTtqY67KnZxahfPhQreECgYAjjTEXBMJ5h4pXEykLhXPg\nhsFqaj2OcdZVx4LYE9H2FzN7qbEQRlkreTdJe8l/ai15P9HXN8zGHaLLy6h2jpP5\nFzUjV0AEMbekXU418o0HPKfRTIAHSRvv4RpIGpNypWwqO3KZnLAQv0WrvGus7YUQ\nEhRzMA67jAl74Op3hQymIg==\n-----END PRIVATE KEY-----\n",
            client_email: "firebase-adminsdk-fbsvc@dhagwxwhu.iam.gserviceaccount.com",
            client_id: "101642214777392044779"
        }),
        databaseURL: "https://dhagwxwhu-default-rtdb.firebaseio.com"
    });
}

const db = admin.database();
const ADMIN_KEY = 'dhagwxwhu:f4afc5aa03e73130f5e055dfe6a708c4dc40759b';
const API_KEY = '835a198a-7843-4e13-a085-331eb891100e';
const ALLOWED_ORIGINS = [
    'https://paneladmin2.vercel.app/',
];

async function isIPBlocked(ip) {
    const snap = await db.ref('admin/blocked_ips/' + ip.replace(/\./g, '_')).once('value');
    return snap.exists();
}

async function verifyAPIKey(key) {
    return key === API_KEY;
}

async function apiLogin(email, password) {
    const snap = await db.ref('admin/auth').once('value');
    const raw = snap.val();

    if (raw && raw.data) {
        const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
        const admin = JSON.parse(dec);

        if (admin.email === email && admin.password === password) {
            return {
                success: true,
                message: 'Login berhasil',
                data: { email: admin.email, role: admin.role }
            };
        }
    }

    return { success: false, message: 'Email atau password salah' };
}

async function apiGetUsers() {
    const snap = await db.ref('users').once('value');
    const raw = snap.val() || {};
    const users = [];

    for (const key in raw) {
        if (raw[key] && raw[key].data) {
            try {
                const dec = CryptoJS.AES.decrypt(raw[key].data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
                const user = JSON.parse(dec);
                user.id = key;
                users.push(user);
            } catch (e) {}
        }
    }

    return { success: true, total: users.length, users: users };
}

async function apiAddUser(userData) {
    if (!userData.username || !userData.password) {
        return { success: false, message: 'Username dan password wajib diisi' };
    }

    const users = await apiGetUsers();
    const exists = users.users.some(function(u) {
        return u.username === userData.username;
    });

    if (exists) {
        return { success: false, message: 'Username sudah digunakan' };
    }

    const enc = CryptoJS.AES.encrypt(JSON.stringify({
        username: userData.username,
        phone: userData.phone || '',
        password: userData.password,
        role: userData.role || 'User',
        expiry_date: userData.expiry_date || '12/31/2026'
    }), ADMIN_KEY).toString();

    const ref = db.ref('users').push();
    await ref.set({ data: enc, created: Date.now(), created_by: userData.created_by || 'api' });

    return { success: true, message: 'User berhasil ditambahkan', id: ref.key };
}

function checkOrigin(origin, referer) {
    if (!origin && !referer) return false;
    
    for (const allowed of ALLOWED_ORIGINS) {
        if (origin && origin.startsWith(allowed)) return true;
        if (referer && referer.startsWith(allowed)) return true;
    }
    
    return false;
}

export default async function handler(req, res) {
    const origin = req.headers['origin'] || '';
    const referer = req.headers['referer'] || '';
    const isAPI = req.body && (req.body.action === 'api_login' || req.body.action === 'api_get_users' || req.body.action === 'api_add_user');
    const isEncrypted = req.body && req.body.data;

    if (!isAPI && !isEncrypted) {
        return res.status(200).json({ status: 'OK', version: '2.0' });
    }

    if (isAPI) {
        const apiKey = req.headers['x-api-key'] || req.body.api_key || '';
        const validKey = await verifyAPIKey(apiKey);

        if (!validKey) {
            return res.status(401).json({
                error: 'Akses ditolak. Gunakan web resmi topupbussidku.web.id',
                code: 'INVALID_API_KEY'
            });
        }
    }

    if (isEncrypted) {
        const allowed = checkOrigin(origin, referer);
        if (!allowed) {
            return res.status(403).json({
                error: 'Akses ditolak. Gunakan web resmi topupbussidku.web.id',
                code: 'INVALID_ORIGIN'
            });
        }
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    try {
        const body = req.body;

        if (body.action === 'api_login') {
            const result = await apiLogin(body.email, body.password);
            return res.status(200).json(result);
        }

        if (body.action === 'api_get_users') {
            const result = await apiGetUsers();
            return res.status(200).json(result);
        }

        if (body.action === 'api_add_user') {
            const result = await apiAddUser(body.user || body);
            return res.status(200).json(result);
        }

        if (!body.data) {
            return res.status(200).json({ error: 'No data' });
        }

        res.setHeader('Access-Control-Allow-Origin', 'https://topupbussidku.web.id');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        const decrypted = CryptoJS.AES.decrypt(body.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
        if (!decrypted) {
            return res.status(200).json({ error: 'Access denied' });
        }

        const { path, method, data } = JSON.parse(decrypted);

        if (path === 'admin/auth' && method === 'GET') {
            const blocked = await isIPBlocked(ip);
            if (blocked) {
                const result = { success: false, error: 'IP diblokir', blocked: true };
                const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
                return res.status(200).json({ encrypted: true, data: encrypted });
            }
        }

        const ref = db.ref(path);

        if (method === 'GET') {
            const snap = await ref.once('value');
            const raw = snap.val();

            if (path === 'admin/auth' && raw && raw.data) {
                const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
                const result = JSON.parse(dec);
                const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
                return res.status(200).json({ encrypted: true, data: encrypted });
            }

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

        if (method === 'POST') {
            const enc = CryptoJS.AES.encrypt(JSON.stringify(data), ADMIN_KEY).toString();
            const newRef = ref.push();
            await newRef.set({ data: enc });
            const result = { success: true, id: newRef.key };
            const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
            return res.status(200).json({ encrypted: true, data: encrypted });
        }

        if (method === 'PUT') {
            const enc = CryptoJS.AES.encrypt(JSON.stringify(data), ADMIN_KEY).toString();
            await ref.set({ data: enc });
            const result = { success: true };
            const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
            return res.status(200).json({ encrypted: true, data: encrypted });
        }

        if (method === 'PATCH') {
            const snap = await ref.once('value');
            const existing = snap.val();
            let existingData = {};
            if (existing && existing.data) {
                const dec = CryptoJS.AES.decrypt(existing.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
                existingData = JSON.parse(dec);
            }
            const merged = { ...existingData, ...data };
            const enc = CryptoJS.AES.encrypt(JSON.stringify(merged), ADMIN_KEY).toString();
            await ref.update({ data: enc });
            const result = { success: true };
            const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
            return res.status(200).json({ encrypted: true, data: encrypted });
        }

        if (method === 'DELETE') {
            await ref.remove();
            const result = { success: true };
            const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
            return res.status(200).json({ encrypted: true, data: encrypted });
        }

        return res.status(200).json({ error: 'Invalid method' });

    } catch (error) {
        return res.status(200).json({ error: error.message });
    }
}