import CryptoJS from 'crypto-js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { action, payload, data } = req.body;
        const ADMIN_KEY = process.env.ADMIN_KEY;

        if (action === 'encrypt') {
            if (!payload) return res.status(400).json({ error: 'Payload required' });
            const encrypted = CryptoJS.AES.encrypt(JSON.stringify(payload), ADMIN_KEY).toString();
            return res.status(200).json({ data: 'admin:' + encrypted });
        }

        if (action === 'decrypt') {
            if (!data) return res.status(400).json({ error: 'Data required' });
            let encryptedData = data;
            if (encryptedData.startsWith('admin:')) {
                encryptedData = encryptedData.replace('admin:', '');
            }
            const decrypted = CryptoJS.AES.decrypt(encryptedData, ADMIN_KEY).toString(CryptoJS.enc.Utf8);
            if (!decrypted) return res.status(400).json({ error: 'Invalid' });
            return res.status(200).json({ data: JSON.parse(decrypted) });
        }

        return res.status(400).json({ error: 'Invalid action' });
    } catch(e) {
        return res.status(500).json({ error: e.message });
    }
}