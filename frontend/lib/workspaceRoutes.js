const legacyDestinations = require('./legacyDestinations');
const clinicianPages = new Set([
  '/clinician', '/knowledge-graph', '/clinician-application',
  '/about', '/explanation', '/forgot-password', '/reset-password', '/404',
]);

function workspaceDestination(pathname, role) {
  if (role === 'clinician' && !clinicianPages.has(pathname)) return '/clinician';
  return legacyDestinations[pathname] || null;
}
module.exports = { workspaceDestination };
