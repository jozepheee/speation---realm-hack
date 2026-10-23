// Source-key catalogs keep patient words, notes and recordings outside translation.
const catalogs = { hi: require('../locales/hi.json'), ml: require('../locales/ml.json') };
const LANGUAGES = ['en', 'hi', 'ml'];
function normalize(value) { return value.replace(/\s+/g, ' ').trim(); }
function interpolate(text, values) { return text.replace(/\{(\w+)\}/g, (token, key) => Object.hasOwn(values, key) ? String(values[key]) : token); }
const templates = Object.keys(catalogs.hi).filter(key => /\{\w+\}/.test(key)).map(key => {
  const names = [];
  const source = key.split(/(\{\w+\})/).map(part => {
    if (/^\{\w+\}$/.test(part)) { names.push(part.slice(1,-1)); return '(.*?)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return { key, names, pattern: new RegExp('^' + source + '$') };
});
function translate(locale, text, values = {}) {
  if (typeof text !== 'string' || !text.trim()) return text;
  const key = normalize(text);
  if (locale === 'en' || !catalogs[locale]) return interpolate(text, values);
  const direct = Object.hasOwn(catalogs[locale], key) ? catalogs[locale][key] : null;
  if (direct) return interpolate(direct, values);
  // Known templates also localize delayed API/status errors without translating data.
  for (const template of templates) {
    const match = key.match(template.pattern);
    if (match) return interpolate(catalogs[locale][template.key], Object.fromEntries(template.names.map((name,index) => [name,match[index+1]])));
  }
  return text;
}
module.exports = { LANGUAGES, normalize, translate };
