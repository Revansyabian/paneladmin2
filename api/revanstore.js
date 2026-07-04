import CryptoJS from 'crypto-js';
import admin from 'firebase-admin';
import middleware from 'middleware/middleware';

const ADMIN_KEY = process.env.ADMIN_KEY;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}

const db = admin.database();

export default async function handler(req, res) {
  const mid = middleware(req, res);
  if (mid.blocked) {
    return res.status(mid.status).json({ error: mid.error });
  }
  
  if (req.method === 'GET') return res.status(200).json({ status: 'OK' });

  try {
    const body = req.body;
    if (!body || !body.data) return res.status(400).json({ error: 'No data' });

    const decrypted = CryptoJS.AES.decrypt(body.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
    if (!decrypted) return res.status(403).json({ error: 'Access denied' });
    
    const parsed = JSON.parse(decrypted);
    const ref = db.ref(parsed.path);

    if (parsed.method === 'GET') {
      const snap = await ref.once('value');
      const raw = snap.val();
      
      if (parsed.path === 'admin/auth' && raw && raw.data) {
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