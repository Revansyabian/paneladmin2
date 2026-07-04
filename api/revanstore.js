const admin = require('firebase-admin');
const CryptoJS = require('crypto-js');

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const decrypted = CryptoJS.AES.decrypt(req.body.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
    if (!decrypted) return res.status(200).json({ success: false, error: 'Access denied' });
    
    const { path, method, data } = JSON.parse(decrypted);

    // LOGIN
    if (path === 'login') {
      const snap = await db.ref('admin/auth').once('value');
      const encryptedData = snap.val();
      
      if (encryptedData) {
        const decData = CryptoJS.AES.decrypt(encryptedData.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
        const admin = JSON.parse(decData);
        
        if (admin.email === data.email && admin.password === data.password) {
          const result = { success: true, data: { email: admin.email, role: admin.role } };
          const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
          return res.status(200).json({ encrypted: true, data: encrypted });
        }
      }
      
      const fail = { success: false, error: 'Email atau password salah' };
      const enc = CryptoJS.AES.encrypt(JSON.stringify(fail), ADMIN_KEY).toString();
      return res.status(200).json({ encrypted: true, data: enc });
    }

    // GET
    if (method === 'GET') {
      const snap = await ref.once('value');
      const rawData = snap.val() || {};
      
      // Dekripsi semua data
      const decryptedData = {};
      for (const key in rawData) {
        try {
          const dec = CryptoJS.AES.decrypt(rawData[key].data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
          decryptedData[key] = JSON.parse(dec);
          decryptedData[key].id = key;
          decryptedData[key].created = rawData[key].created;
          decryptedData[key].created_by = rawData[key].created_by;
        } catch(e) {
          decryptedData[key] = rawData[key];
        }
      }
      
      const encrypted = CryptoJS.AES.encrypt(JSON.stringify(decryptedData), ADMIN_KEY).toString();
      return res.status(200).json({ encrypted: true, data: encrypted });
    }

    // POST, PUT, PATCH (SIMPAN TERENKRIPSI)
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      // Enkripsi data sebelum simpan
      const encryptedData = CryptoJS.AES.encrypt(JSON.stringify(data), ADMIN_KEY).toString();
      
      if (method === 'POST') {
        const newRef = ref.push();
        await newRef.set({ data: encryptedData, created: Date.now(), created_by: data.created_by || 'system' });
        const result = { success: true, id: newRef.key };
        const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
        return res.status(200).json({ encrypted: true, data: encrypted });
      }
      
      if (method === 'PUT') {
        await ref.set({ data: encryptedData, created: Date.now() });
        const result = { success: true };
        const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
        return res.status(200).json({ encrypted: true, data: encrypted });
      }
      
      if (method === 'PATCH') {
        const existingSnap = await ref.once('value');
        const existing = existingSnap.val();
        
        if (existing && existing.data) {
          const decExisting = CryptoJS.AES.decrypt(existing.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
          const existingData = JSON.parse(decExisting);
          
          // Merge data
          for (const k in data) {
            existingData[k] = data[k];
          }
          
          const mergedEncrypted = CryptoJS.AES.encrypt(JSON.stringify(existingData), ADMIN_KEY).toString();
          await ref.update({ data: mergedEncrypted, updated: Date.now(), updated_by: data.updated_by || 'system' });
        } else {
          await ref.update({ data: encryptedData, updated: Date.now(), updated_by: data.updated_by || 'system' });
        }
        
        const result = { success: true };
        const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
        return res.status(200).json({ encrypted: true, data: encrypted });
      }
    }

    // DELETE
    if (method === 'DELETE') {
      await ref.remove();
      const result = { success: true };
      const encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
      return res.status(200).json({ encrypted: true, data: encrypted });
    }

    return res.status(200).json({ success: false, error: 'Invalid method' });

  } catch (error) {
    const err = { success: false, error: error.message };
    const enc = CryptoJS.AES.encrypt(JSON.stringify(err), ADMIN_KEY).toString();
    return res.status(200).json({ encrypted: true, data: enc });
  }
}