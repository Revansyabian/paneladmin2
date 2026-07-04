const rateLimitMap = new Map();

export default function middleware(req, res) {
  const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || [];
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  
  if (req.method === 'OPTIONS') {
    return { blocked: true, status: 200 };
  }
  
  const ip = req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, []);
  const requests = rateLimitMap.get(ip).filter(t => now - t < 60000);
  if (requests.length >= 30) {
    return { blocked: true, status: 429, error: 'Too many requests' };
  }
  requests.push(now);
  rateLimitMap.set(ip, requests);
  
  const API_KEY = process.env.API_KEY;
  if (!req.headers['x-api-key'] || req.headers['x-api-key'] !== API_KEY) {
    return { blocked: true, status: 401, error: 'Unauthorized' };
  }
  
  return { blocked: false };
}