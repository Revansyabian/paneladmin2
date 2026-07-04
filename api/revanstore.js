const crypto = require('crypto');
const admin = require('firebase-admin');

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
const ALGORITHM = 'aes-256-cbc';
const IV = Buffer.alloc(16, 0);
const KEY = Buffer.from(ADMIN_KEY.padEnd(32).slice(0, 32));

function encrypt(text) {
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, IV);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
}

function decrypt(text) {
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, IV);
  let decrypted = decipher.update(text, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ status: 'OK' });

  try {
    const body = req.body;
    if (!body || !body.data) return res.status(200).json({ error: 'No data' });

    const decrypted = decrypt(body.data);
    if (!decrypted) return res.status(200).json({ error: 'Access denied' });
    
    const { path, method, data } = JSON.parse(decrypted);
    const ref = db.ref(path);

    if (method === 'GET') {
      const snap = await ref.once('value');
      const raw = snap.val();
      
      if (path === 'admin/auth' && raw && raw.data) {
        const dec = decrypt(raw.data);
        const result = JSON.parse(dec);
        return res.status(200).json({ encrypted: true, data: encrypt(JSON.stringify(result)) });
      }
      
      const result = {};
      if (raw) {
        for (const key in raw) {
          if (raw[key] && raw[key].data) {
            try {
              const dec = decrypt(raw[key].data);
              result[key] = JSON.parse(dec);
              result[key].id = key;
            } catch(e) {}
          }
        }
      }
      
      return res.status(200).json({ encrypted: true, data: encrypt(JSON.stringify(result)) });
    }

    if (method === 'POST') {
      const enc = encrypt(JSON.stringify(data));
      const newRef = ref.push();
      await newRef.set({ data: enc });
      const result = { success: true, id: newRef.key };
      return res.status(200).json({ encrypted: true, data: encrypt(JSON.stringify(result)) });
    }

    if (method === 'PUT') {
      const enc = encrypt(JSON.stringify(data));
      await ref.set({ data: enc });
      const result = { success: true };
      return res.status(200).json({ encrypted: true, data: encrypt(JSON.stringify(result)) });
    }

    if (method === 'PATCH') {
      const snap = await ref.once('value');
      const existing = snap.val();
      let existingData = {};
      if (existing && existing.data) {
        const dec = decrypt(existing.data);
        existingData = JSON.parse(dec);
      }
      const merged = { ...existingData, ...data };
      const enc = encrypt(JSON.stringify(merged));
      await ref.update({ data: enc });
      const result = { success: true };
      return res.status(200).json({ encrypted: true, data: encrypt(JSON.stringify(result)) });
    }

    if (method === 'DELETE') {
      await ref.remove();
      const result = { success: true };
      return res.status(200).json({ encrypted: true, data: encrypt(JSON.stringify(result)) });
    }

    return res.status(200).json({ error: 'Invalid method' });

  } catch (error) {
    return res.status(200).json({ error: error.message });
  }
}