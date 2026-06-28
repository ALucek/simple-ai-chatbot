export function buildCSP(apiOrigin: string, dev: boolean): string {
  const gsi = 'https://accounts.google.com/gsi/';
  return [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline' ${gsi}client${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline' ${gsi}style`,
    `img-src 'self' data:`,
    `connect-src 'self' ${apiOrigin} ${gsi}${dev ? ' ws:' : ''}`,
    `font-src 'self'`,
    `frame-src ${gsi}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ');
}
