import CryptoJS from 'crypto-js';

const ADMIN_KEY = process.env.ADMIN_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ status: 'OK' });

  try {
    const body = req.body;
    if (!body || !body.data) return res.status(400).json({ error: 'No data' });

    const decrypted = CryptoJS.AES.decrypt(body.data, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
    if (!decrypted) return res.status(403).json({ error: 'Access denied' });
    
    const parsed = JSON.parse(decrypted);

    return res.status(200).json({
      encrypted: true,
      data: CryptoJS.AES.encrypt(JSON.stringify({ received: parsed }), ADMIN_KEY).toString()
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}