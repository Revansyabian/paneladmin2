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

async function isIPBlocked(ip) {
  const snap = await db.ref('blocked_ips/' + ip.replace(/\./g, '_')).once('value');
  const raw = snap.val();
  if (raw && raw.data) {
    try {
      const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
      const data = JSON.parse(dec);
      if (data && data.blocked) return true;
    } catch(e) {}
  }
  return false;
}

async function isFPBlocked(fp) {
  const snap = await db.ref('blocked_fp/' + fp).once('value');
  const raw = snap.val();
  if (raw && raw.data) {
    try {
      const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
      const data = JSON.parse(dec);
      if (data && data.blocked) return true;
    } catch(e) {}
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
  
  let attempts = 0;
  let lastAttempt = 0;
  
  if (raw && raw.data) {
    try {
      const dec = CryptoJS.AES.decrypt(raw.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
      const data = JSON.parse(dec);
      attempts = data.count || 0;
      lastAttempt = data.last_attempt || 0;
    } catch(e) {}
  }
  
  if (now - lastAttempt > 3600000) {
    const enc = CryptoJS.AES.encrypt(JSON.stringify({
      count: 1,
      last_attempt: now,
      fingerprint: fp
    }), ADMIN_KEY).toString();
    await ref.set({ data: enc });
    return 1;
  }
  
  const newCount = attempts + 1;
  const enc = CryptoJS.AES.encrypt(JSON.stringify({
    count: newCount,
    last_attempt: now,
    fingerprint: fp
  }), ADMIN_KEY).toString();
  await ref.update({ data: enc });
  return newCount;
}

async function resetLoginAttempt(ip, fp) {
  const key = ip.replace(/\./g, '_') + '_' + (fp || 'nofp');
  await db.ref('login_attempts/' + key).remove();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Fingerprint');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
  const fp = req.headers['x-fingerprint'] || '';
  
  if (req.method === 'GET') return res.status(200).json({ status: 'OK' });

  try {
    const body = req.body;
    if (!body || !body.data) return res.status(400).json({ error: 'No data' });

    const decrypted = CryptoJS.AES.decrypt(body.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
    if (!decrypted) return res.status(403).json({ error: 'Access denied' });
    
    const parsed = JSON.parse(decrypted);
    const ref = db.ref(parsed.path);

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

    if (parsed.path === 'admin/login_failed' && parsed.method === 'POST') {
      const attempts = await trackLoginAttempt(ip, fp);
      
      await new Promise(r => setTimeout(r, attempts * 1000));
      
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

    if (parsed.path === 'admin/login_success' && parsed.method === 'POST') {
      await resetLoginAttempt(ip, fp);
      const result = { success: true };
      const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
      return res.status(200).json({ encrypted: true, data: encrypted });
    }

    const ipBlocked = await isIPBlocked(ip);
    const fpBlocked = fp ? await isFPBlocked(fp) : false;
    
    if (ipBlocked || fpBlocked) {
      const result = { blocked: true };
      const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
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
            } catch(e) {}
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
        const dec = CryptoJS.AES.decrypt(existing.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
        existingData = JSON.parse(dec);
      }
      const merged = Object.assign({}, existingData, parsed.data);
      const enc = CryptoJS.AES.encrypt(JSON.stringify(merged), ADMIN_KEY).toString();
      await ref.update({ data: enc });
      const result = { success: true };
      const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
      return res.status(200).json({ encrypted: true, data: encrypted });
    }

    if (parsed.method === 'DELETE') {
      await ref.remove();
      const result = { success: true };
      const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
      return res.status(200).json({ encrypted: true, data: encrypted });
    }

    return res.status(400).json({ error: 'Invalid method' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}