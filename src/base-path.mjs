export function normalizeBasePath(value) {
  if (typeof value !== 'string') return '';
  let path = value.trim();
  if (!path) return '';

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return '';
    }
  }

  if (!path.startsWith('/')) return '';
  path = path.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return path;
}
