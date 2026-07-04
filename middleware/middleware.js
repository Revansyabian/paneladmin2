import { NextResponse } from 'next/server';

const ALLOWED_ORIGIN = 'https://paneladmin2.vercel.app';
const API_KEY = '835a198a-7843-4e13-a085-331eb891100e';
const RATE_LIMIT = 30;
const RATE_WINDOW = 60;
const rateStore = new Map();

export function checkRateLimit(ip) {
    const now = Date.now();
    const key = ip;
    
    if (!rateStore.has(key)) {
        rateStore.set(key, { count: 0, reset: now + RATE_WINDOW * 1000 });
    }
    
    const data = rateStore.get(key);
    
    if (now > data.reset) {
        data.count = 0;
        data.reset = now + RATE_WINDOW * 1000;
    }
    
    data.count++;
    
    if (data.count > RATE_LIMIT) {
        return false;
    }
    
    return true;
}

export function checkOrigin(request) {
    const origin = request.headers.get('origin') || '';
    const referer = request.headers.get('referer') || '';
    const apiKey = request.headers.get('x-api-key') || '';
    const userAgent = request.headers.get('user-agent') || '';

    if (userAgent.includes('curl') || userAgent.includes('wget') || userAgent.includes('python') || userAgent.includes('Postman') || userAgent.includes('insomnia')) {
        if (apiKey !== API_KEY) {
            return { allowed: false, error: 'INVALID_CLIENT' };
        }
    }

    const isAllowedOrigin = origin === ALLOWED_ORIGIN || referer.startsWith(ALLOWED_ORIGIN);
    const isValidApiKey = apiKey === API_KEY;

    if (!isAllowedOrigin && !isValidApiKey) {
        return { allowed: false, error: 'INVALID_ORIGIN' };
    }

    return { allowed: true };
}

export function getSecurityHeaders() {
    return {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload'
    };
}

export function createErrorResponse(error, status) {
    const messages = {
        'INVALID_ORIGIN': {
            error: 'Akses ditolak. Gunakan web resmi paneladmin2.vercel.app',
            code: 'INVALID_ORIGIN'
        },
        'INVALID_CLIENT': {
            error: 'Akses ditolak. Gunakan web resmi paneladmin2.vercel.app',
            code: 'INVALID_CLIENT'
        },
        'RATE_LIMIT_EXCEEDED': {
            error: 'Terlalu banyak permintaan. Coba lagi nanti.',
            code: 'RATE_LIMIT_EXCEEDED',
            retry_after: RATE_WINDOW
        }
    };

    return new NextResponse(
        JSON.stringify(messages[error] || { error: 'Access denied' }),
        {
            status: status || 403,
            headers: { 'Content-Type': 'application/json' }
        }
    );
}

export function middleware(request) {
    const path = request.nextUrl.pathname;
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

    if (path === '/middleware/middleware') {
        return NextResponse.next();
    }

    const originCheck = checkOrigin(request);
    if (!originCheck.allowed) {
        return createErrorResponse(originCheck.error, 403);
    }

    if (!checkRateLimit(ip)) {
        return createErrorResponse('RATE_LIMIT_EXCEEDED', 429);
    }

    const response = NextResponse.next();
    const headers = getSecurityHeaders();

    for (const key in headers) {
        response.headers.set(key, headers[key]);
    }

    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT));
    response.headers.set('X-RateLimit-Remaining', String(Math.max(0, RATE_LIMIT - (rateStore.get(ip)?.count || 0))));

    return response;
}

export const config = {
    matcher: ['/api/:path*']
};