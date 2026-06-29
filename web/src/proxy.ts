import { NextRequest, NextResponse } from 'next/server';
import { buildCSP } from '@/lib/csp';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export function proxy(request: NextRequest) {
  const dev = process.env.NODE_ENV !== 'production';
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCSP(API_URL, dev, nonce);

  // Pass the nonce and policy on the request so Next stamps its own inline scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains',
  );
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
