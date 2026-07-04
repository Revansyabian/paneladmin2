export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  return res.status(200).json({
    status: 'OK',
    env_ada: {
      ADMIN_KEY: process.env.ADMIN_KEY ? 'ADA' : 'KOSONG',
      API_KEY: process.env.API_KEY ? 'ADA' : 'KOSONG',
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? 'ADA' : 'KOSONG',
      FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? 'ADA' : 'KOSONG',
      FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? 'ADA' : 'KOSONG',
      FIREBASE_DATABASE_URL: process.env.FIREBASE_DATABASE_URL ? 'ADA' : 'KOSONG',
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ? 'ADA' : 'KOSONG'
    }
  });
}