export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ADMIN_KEY = 'dhagwxwhu:f4afc5aa03e73130f5e055dfe6a708c4dc40759b';
  const FIREBASE_URL = 'https://dhagwxwhu-default-rtdb.firebaseio.com';
  const CryptoJS = require('crypto-js');

  try {
    var decrypted = CryptoJS.AES.decrypt(req.body.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
    var { path, method, data } = JSON.parse(decrypted);
  } catch(e) {
    return res.status(200).json({ success: false, error: 'Invalid request' });
  }

  try {
    // LOGIN
    if (path === 'login') {
      var response = await fetch(FIREBASE_URL + '/users.json');
      var users = await response.json();
      for (var key in users) {
        if (users[key].username === data.username && users[key].password === data.password) {
          var result = { success: true, data: { id: key, username: users[key].username, role: users[key].role || 'User', expiry_date: users[key].expiry_date || '', created: users[key].created, created_by: users[key].created_by } };
          var encrypted = CryptoJS.AES.encrypt(JSON.stringify(result), ADMIN_KEY).toString();
          return res.status(200).json({ encrypted: true, data: encrypted });
        }
      }
      var failResult = { success: false, error: 'Username atau password salah' };
      var failEncrypted = CryptoJS.AES.encrypt(JSON.stringify(failResult), ADMIN_KEY).toString();
      return res.status(200).json({ encrypted: true, data: failEncrypted });
    }

    // GET USERS
    if (path === 'users' && (!method || method === 'GET')) {
      var response = await fetch(FIREBASE_URL + '/users.json');
      var users = await response.json();
      var encrypted = CryptoJS.AES.encrypt(JSON.stringify(users || {}), ADMIN_KEY).toString();
      return res.status(200).json({ encrypted: true, data: encrypted });
    }

    // CRUD
    var url = FIREBASE_URL + '/' + path + '.json';
    var options = { method: method || 'GET', headers: { 'Content-Type': 'application/json' } };
    
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    var response = await fetch(url, options);
    var text = await response.text();
    var result = text && text !== 'null' ? JSON.parse(text) : null;
    var encrypted = CryptoJS.AES.encrypt(JSON.stringify(result || { success: true }), ADMIN_KEY).toString();
    return res.status(200).json({ encrypted: true, data: encrypted });
  } catch (error) {
    var errResult = { success: false, error: error.message };
    var errEncrypted = CryptoJS.AES.encrypt(JSON.stringify(errResult), ADMIN_KEY).toString();
    return res.status(200).json({ encrypted: true, data: errEncrypted });
  }
}