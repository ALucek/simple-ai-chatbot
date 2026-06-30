import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

describe('proxy security headers', () => {
  const res = proxy(new NextRequest('http://localhost/'));

  it('sets the static security baseline', () => {
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('Permissions-Policy')).toBe(
      'camera=(), microphone=(), geolocation=()',
    );
  });

  it('keeps CSP and HSTS', () => {
    expect(res.headers.get('Content-Security-Policy')).toBeTruthy();
    expect(res.headers.get('Strict-Transport-Security')).toBeTruthy();
  });
});
