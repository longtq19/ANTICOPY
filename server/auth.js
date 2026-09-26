import crypto from 'node:crypto';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

export function clientIp(req) {
  return (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}

export function publicSession(s) {
  return { username: s.username, displayName: s.displayName, role: s.role, ip: s.ip };
}

export function createSession(user, ip) {
  const token = crypto.randomBytes(32).toString('base64url');
  const session = { ...user, ip, createdAt: Date.now(), lockUntil: 0 };
  sessions.set(token, session);
  return { token, session };
}

export function destroySession(token) {
  sessions.delete(token);
}

function readToken(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

export function requireAuth(req, res, next) {
  const token = readToken(req);
  const session = token ? sessions.get(token) : null;
  // A token is bound to the device (IP) that logged in.
  if (!session || Date.now() - session.createdAt > SESSION_TTL_MS || session.ip !== clientIp(req)) {
    if (session) sessions.delete(token);
    return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
  }
  req.auth = session;
  req.authToken = token;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.auth?.role !== 'admin') return res.status(403).json({ error: 'Chỉ quản trị viên được thực hiện' });
  next();
}

/** Rejects requests not issued by our own frontend (curl, cross-site pages, ...). */
export function requireProtectedClient(req, res, next) {
  const site = req.get('sec-fetch-site');
  if (req.get('x-anticopy-client') !== '1' || (site && site !== 'same-origin')) {
    return res.status(403).json({ error: 'Yêu cầu không hợp lệ' });
  }
  next();
}

export function lockPhoneReveal(session, ms) {
  session.lockUntil = Math.max(session.lockUntil, Date.now() + ms);
}

export function phoneRevealLockRemaining(session) {
  return Math.max(0, session.lockUntil - Date.now());
}

const buckets = new Map();

export function rateLimit({ windowMs, max, key }) {
  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    const hits = (buckets.get(k) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      res.set('Retry-After', String(Math.ceil((windowMs - (now - hits[0])) / 1000)));
      return res.status(429).json({ error: 'Quá nhiều yêu cầu, vui lòng thử lại sau' });
    }
    hits.push(now);
    buckets.set(k, hits);
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [token, s] of sessions) if (now - s.createdAt > SESSION_TTL_MS) sessions.delete(token);
  for (const [k, hits] of buckets) if (!hits.some((t) => now - t < 10 * 60 * 1000)) buckets.delete(k);
}, 60 * 1000).unref();
