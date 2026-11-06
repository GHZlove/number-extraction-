const path = require('node:path');

const ORIGIN = 'nextract://game';
const APP_URL = `${ORIGIN}/index.html`;
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};

function isGameURL(value) {
  try { const u = new URL(value); return u.protocol === 'nextract:' && u.hostname === 'game' && !u.username && !u.password && !u.port; }
  catch { return false; }
}
function resolveAsset(root, value) {
  if (!isGameURL(value)) return null;
  let decoded;
  try { decoded = decodeURIComponent(new URL(value).pathname); } catch { return null; }
  if (/[\\\0:]/.test(decoded) || decoded.split('/').includes('..')) return null;
  const file = path.resolve(root, '.' + (decoded === '/' ? '/index.html' : decoded));
  const relative = path.relative(path.resolve(root), file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !TYPES[path.extname(file)]) return null;
  return {file,type:TYPES[path.extname(file)]};
}
function validSaveText(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text,'utf8') > 524288) return false;
  try {
    const data = JSON.parse(text);
    return !!data && !Array.isArray(data) && [1,2,3,4,5].includes(data.version) && Number.isFinite(data.credits) && data.credits >= 0;
  } catch { return false; }
}
module.exports = {APP_URL,ORIGIN,CSP,isGameURL,resolveAsset,validSaveText};
