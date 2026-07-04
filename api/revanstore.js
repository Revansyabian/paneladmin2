export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ADMIN_KEY = 'dhagwxwhu:f4afc5aa03e73130f5e055dfe6a708c4dc40759b';
  const FIREBASE_URL = 'https://dhagwxwhu-default-rtdb.firebaseio.com';

  try {
    const CryptoJS = await import('crypto-js');
    
    const decrypted = CryptoJS.default.AES.decrypt(req.body.data, ADMIN_KEY).toString(CryptoJS.default.enc.Utf8);
    if (!decrypted) {
      return res.status(200).json({ success: false, error: 'Invalid encryption' });
    }
    
    const { path, method, data } = JSON.parse(decrypted);

    // LOGIN
    if (path === 'login') {
      const response = await fetch(FIREBASE_URL + '/users.json');
      const users = await response.json();
      
      if (users) {
        for (const key in users) {
          if (users[key] && users[key].username === data.username && users[key].password === data.password) {
            const result = {
              success: true,
              data: {
                id: key,
                username: users[key].username,
                role: users[key].role || 'User',
                expiry_date: users[key].expiry_date || '',
                created: users[key].created || null,
                created_by: users[key].created_by || 'admin'
              }
            };
            const encrypted = CryptoJS.default.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
            return res.status(200).json({ encrypted: true, data: encrypted });
          }
        }
      }
      
      const failResult = { success: false, error: 'Username atau password salah' };
      const failEncrypted = CryptoJS.default.AES.encrypt(JSON.stringify(failResult), ADMIN_KEY).toString();
      return res.status(200).json({ encrypted: true, data: failEncrypted });
    }

    // GET USERS
    if (path === 'users' && (!method || method === 'GET')) {
      const response = await fetch(FIREBASE_URL + '/users.json');
      const users = await response.json();
      const result = users || {};
      const encrypted = CryptoJS.default.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
      return res.status(200).json({ encrypted: true, data: encrypted });
    }

    // CRUD OPERATIONS
    let url = FIREBASE_URL + '/' + path + '.json';
    let options = {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    const text = await response.text();
    const resultData = text && text !== 'null' ? JSON.parse(text) : null;
    const result = resultData || { success: true };
    const encrypted = CryptoJS.default.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
    return res.status(200).json({ encrypted: true, data: encrypted });

  } catch (error) {
    const errResult = { success: false, error: error.message };
    return res.status(200).json({ success: false, error: error.message });
  }
}