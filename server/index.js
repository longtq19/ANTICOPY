import express from 'express';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './store.js';
import {
  clientIp,
  createSession,
  destroySession,
  formatPhoneLockMessage,
  isPhoneSwitchViolation,
  lockPhoneReveal,
  notePhoneReveal,
  PHONE_SWITCH_LOCK_MS,
  phoneRevealLockRemaining,
  publicSession,
  rateLimit,
  requireAdmin,
  requireAuth,
  requireProtectedClient,
} from './auth.js';
import { renderPhoneGlyph } from './phoneGlyph.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEV = process.argv.includes('--dev');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SENSITIVE_DIRS = ['data', 'server', 'scripts', '.git'];
const PHONE_TTL_MS = 8000;
const SECURITY_LOCK_MS = 60 * 1000;
const LOCKING_EVENTS = new Set(['devtools', 'tamper', 'canvas-read']);
const EVENT_KINDS = new Set([...LOCKING_EVENTS, 'screenshot-key', 'blocked-shortcut', 'print']);

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && (n.family === 'IPv4' || n.family === 4) && !n.internal)
    .map((n) => n.address);
}

function isInsideDir(dir, file) {
  const rel = path.relative(path.resolve(dir), path.resolve(file));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Reject direct downloads of data files, server source, scripts, and git history. */
function isBlockedAssetUrl(rawUrl) {
  const pathname = String(rawUrl ?? '/').split('?')[0].split('#')[0];
  if (pathname.includes('\0')) return true;
  let decoded = pathname;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return true;
    }
  }
  if (decoded.includes('\0')) return true;
  const slash = decoded.replace(/\\/g, '/');
  if (slash.toLowerCase().startsWith('/@fs/')) {
    const fsPath = slash.slice(5).replace(/^\/+/, '');
    return SENSITIVE_DIRS.some((dir) => isInsideDir(path.join(ROOT, dir), fsPath));
  }
  const segments = [];
  for (const seg of slash.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') segments.pop();
    else segments.push(seg);
  }
  return SENSITIVE_DIRS.includes((segments[0] ?? '').toLowerCase());
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), display-capture=()',
  });
  if (!DEV) {
    res.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
    );
  }
  next();
});

app.use((req, res, next) => {
  if (!isBlockedAssetUrl(req.originalUrl)) return next();
  return res.status(403).json({ error: 'Không được phép' });
});

const api = express.Router();
api.use((req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
  next();
});

api.post(
  '/login',
  rateLimit({ windowMs: 60_000, max: 10, key: (req) => `login:${clientIp(req)}` }),
  (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Thiếu tên đăng nhập hoặc mật khẩu' });
    }
    const ip = clientIp(req);
    const user = store.verifyUser(username.trim(), password);
    if (!user) {
      store.audit({ type: 'login-failed', username: username.slice(0, 50), ip });
      return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    }
    const { token, session } = createSession(user, ip);
    store.audit({ type: 'login', username: user.username, ip });
    res.json({ token, user: publicSession(session) });
  },
);

api.post('/logout', requireAuth, (req, res) => {
  destroySession(req.authToken);
  res.status(204).end();
});

api.get('/me', requireAuth, (req, res) => res.json(publicSession(req.auth)));

api.get('/server-info', requireAuth, (req, res) => {
  res.json({ port: PORT, urls: lanAddresses().map((ip) => `http://${ip}:${PORT}`) });
});

api.get('/customers', requireAuth, (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
  const group = typeof req.query.group === 'string' ? req.query.group : '';
  res.json({ groups: store.GROUPS, items: store.listCustomers({ q, group }).map(store.toPublic) });
});

api.post('/customers', requireAuth, requireAdmin, (req, res) => {
  const { data, errors } = store.validateCustomer(req.body);
  if (errors) return res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: errors });
  const customer = store.createCustomer(data);
  store.audit({ type: 'customer-create', username: req.auth.username, customerId: customer.id });
  res.status(201).json(store.toPublic(customer));
});

api.put('/customers/:id', requireAuth, requireAdmin, (req, res) => {
  if (!store.getCustomer(req.params.id)) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });
  const { data, errors } = store.validateCustomer(req.body, { partial: true, id: req.params.id });
  if (errors) return res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: errors });
  const customer = store.updateCustomer(req.params.id, data);
  store.audit({ type: 'customer-update', username: req.auth.username, customerId: customer.id, phoneChanged: !!data.phone });
  res.json(store.toPublic(customer));
});

api.delete('/customers/:id', requireAuth, requireAdmin, (req, res) => {
  if (!store.deleteCustomer(req.params.id)) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });
  store.audit({ type: 'customer-delete', username: req.auth.username, customerId: req.params.id });
  res.status(204).end();
});

api.post(
  '/customers/:id/phone-glyph',
  requireAuth,
  requireProtectedClient,
  rateLimit({ windowMs: 60_000, max: 20, key: (req) => `phone:${req.auth.username}` }),
  (req, res) => {
    const locked = phoneRevealLockRemaining(req.auth);
    if (locked) {
      return res.status(423).json({ error: formatPhoneLockMessage(locked, req.auth.lockReason) });
    }
    const customer = store.getCustomer(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });
    if (isPhoneSwitchViolation(req.auth, customer.id)) {
      lockPhoneReveal(req.auth, PHONE_SWITCH_LOCK_MS, 'switch');
      store.audit({
        type: 'phone-switch-lock',
        username: req.auth.username,
        ip: req.auth.ip,
        customerId: customer.id,
        recentCustomerIds: [...new Set((req.auth.phoneReveals ?? []).map((r) => r.customerId))],
      });
      return res.status(423).json({ error: formatPhoneLockMessage(PHONE_SWITCH_LOCK_MS, 'switch') });
    }
    notePhoneReveal(req.auth, customer.id);
    store.audit({ type: 'phone-reveal', username: req.auth.username, ip: req.auth.ip, customerId: customer.id });
    res.json({ ...renderPhoneGlyph(customer.phone), ttl: PHONE_TTL_MS });
  },
);

api.post(
  '/security-events',
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 30, key: (req) => `event:${req.auth.username}` }),
  (req, res) => {
    const kind = String(req.body?.kind ?? '');
    if (!EVENT_KINDS.has(kind)) return res.status(400).json({ error: 'Sự kiện không hợp lệ' });
    const detail = String(req.body?.detail ?? '').slice(0, 200);
    store.audit({ type: `security:${kind}`, username: req.auth.username, ip: req.auth.ip, detail });
    if (LOCKING_EVENTS.has(kind)) lockPhoneReveal(req.auth, SECURITY_LOCK_MS);
    res.status(204).end();
  },
);

api.use((req, res) => res.status(404).json({ error: 'Không tìm thấy' }));
app.use('/api', api);

const httpServer = http.createServer(app);

if (DEV) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: ROOT,
    appType: 'spa',
    server: { middlewareMode: true, ws: { server: httpServer } },
  });
  app.use(vite.middlewares);
} else {
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.error('Chưa có bản build frontend. Chạy "npm run build" hoặc "npm start".');
    process.exit(1);
  }
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/.*/, (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON không hợp lệ' });
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ' });
});

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Cổng ${PORT} đang được dùng. Tắt tiến trình khác hoặc chạy với PORT khác, ví dụ: PORT=3001`);
    process.exit(1);
  }
  throw err;
});

httpServer.listen(PORT, HOST, () => {
  console.log(`\n  Quản lý khách hàng (${DEV ? 'development' : 'production'}) đang chạy trên ${HOST}:${PORT}\n`);
  console.log(`  Máy này:        http://localhost:${PORT}`);
  const ips = lanAddresses();
  if (!ips.length) console.log('  (Không tìm thấy địa chỉ IPv4 LAN — kiểm tra kết nối mạng)');
  for (const ip of ips) console.log(`  Thiết bị LAN:   http://${ip}:${PORT}`);
  console.log('');
});
