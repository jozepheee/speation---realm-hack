const legacyDestinations = require('./lib/legacyDestinations');

module.exports = {
  i18n: { locales: ['en', 'ml', 'hi'], defaultLocale: 'en', localeDetection: false },
  experimental: { proxyTimeout: 300000 },
  async rewrites() {
    const backend = (process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
    return [{ source: '/api/:path*', destination: `${backend}/:path*` }];
  },
  async redirects() {
    return Object.entries(legacyDestinations).map(([source, destination]) => ({ source, destination, permanent: false }));
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
    ] }];
  },
};
