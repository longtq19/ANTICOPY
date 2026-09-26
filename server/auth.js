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
  const session = { ...user, ip, createdAt: Date.now(), lockUntil: 0, lockReason: null, phoneReveals: [] };
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

export const PHONE_SWITCH_WINDOW_MS = 5 * 60 * 1000;
export const PHONE_SWITCH_LOCK_MS = 5 * 60 * 1000;

export function lockPhoneReveal(session, ms, reason = 'security') {
  const until = Date.now() + ms;
  if (until >= (session.lockUntil || 0)) {
    session.lockUntil = until;
    session.lockReason = reason;
  }
}

export function phoneRevealLockRemaining(session) {
  return Math.max(0, (session.lockUntil || 0) - Date.now());
}

export function formatPhoneLockMessage(remainingMs, reason) {
  const sec = Math.max(1, Math.ceil(remainingMs / 1000));
  const time =
    sec >= 60
      ? `${Math.floor(sec / 60)} phút${sec % 60 ? ` ${sec % 60} giây` : ''}`
      : `${sec} giây`;
  const why =
    reason === 'switch'
      ? 'do xem 2 số điện thoại khác nhau trong 5 phút'
      : 'do vi phạm bảo mật';
  return `Tạm khóa xem số ${time} ${why}.`;
}

function recentPhoneReveals(session) {
  const now = Date.now();
  if (!session.phoneReveals?.length && session.lastPhoneReveal) {
    session.phoneReveals = [session.lastPhoneReveal];
  }
  session.phoneReveals = (session.phoneReveals ?? []).filter((r) => now - r.at < PHONE_SWITCH_WINDOW_MS);
  return session.phoneReveals;
}

export function isPhoneSwitchViolation(session, customerId) {
  return recentPhoneReveals(session).some((r) => r.customerId !== customerId);
}

export function notePhoneReveal(session, customerId) {
  recentPhoneReveals(session).push({ customerId, at: Date.now() });
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
