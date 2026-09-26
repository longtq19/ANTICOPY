import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.log');

export const GROUPS = ['VIP', 'Thân thiết', 'Mới'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
}

function writeJson(file, data) {
  const target = path.join(DATA_DIR, file);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, target);
}

// ---------- Users ----------

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 32).toString('hex')}`;
}

let users = readJson('users.json');
if (users.some((u) => u.password)) {
  // Plain-text passwords in users.json are hashed on first start and never kept.
  users = users.map(({ password, ...rest }) =>
    password ? { ...rest, passwordHash: hashPassword(password) } : rest,
  );
  writeJson('users.json', users);
}

export function verifyUser(username, password) {
  const user = users.find((u) => u.username === username);
  const [salt, hash] = (user?.passwordHash ?? 'x:').split(':');
  const candidate = crypto.scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  if (!user || expected.length !== candidate.length || !crypto.timingSafeEqual(candidate, expected)) {
    return null;
  }
  return { username: user.username, displayName: user.displayName, role: user.role };
}

// ---------- Customers ----------

let customers = readJson('customers.json');

const normalizeText = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .trim();

export function normalizePhone(raw) {
  const s = String(raw ?? '').trim();
  if (!/^\+?[\d\s.\-()]{8,20}$/.test(s)) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return (s.startsWith('+') ? '+' : '') + digits;
}

/** Customer without the phone number — the only shape that ever leaves the server. */
export function toPublic({ phone, ...rest }) {
  return rest;
}

export function listCustomers({ q = '', group = '' } = {}) {
  const needle = normalizeText(q);
  return customers.filter(
    (c) =>
      (!group || c.group === group) &&
      (!needle ||
        normalizeText([c.name, c.email, c.address, c.company, c.notes].join(' ')).includes(needle)),
  );
}

export function getCustomer(id) {
  return customers.find((c) => c.id === id) ?? null;
}

export function validateCustomer(input, { partial = false, id = null } = {}) {
  const errors = {};
  const data = {};
  const src = input && typeof input === 'object' ? input : {};

  const text = (key, max, required = false) => {
    if (src[key] === undefined && partial) return;
    const value = typeof src[key] === 'string' ? src[key].trim() : '';
    if (required && !value) errors[key] = 'Bắt buộc';
    else if (value.length > max) errors[key] = `Tối đa ${max} ký tự`;
    else data[key] = value;
  };
  text('name', 100, true);
  text('email', 120);
  text('address', 200);
  text('company', 100);
  text('notes', 500);
  text('birthday', 10);

  if (data.email && !EMAIL_RE.test(data.email)) errors.email = 'Email không hợp lệ';
  if (data.birthday && !DATE_RE.test(data.birthday)) errors.birthday = 'Ngày không hợp lệ';

  if (src.group !== undefined || !partial) {
    const group = src.group ?? 'Mới';
    if (GROUPS.includes(group)) data.group = group;
    else errors.group = 'Nhóm không hợp lệ';
  }

  const rawPhone = typeof src.phone === 'string' ? src.phone.trim() : '';
  if (rawPhone) {
    const phone = normalizePhone(rawPhone);
    if (!phone) errors.phone = 'Số điện thoại không hợp lệ';
    else if (customers.some((c) => c.phone === phone && c.id !== id)) errors.phone = 'Số điện thoại đã tồn tại';
    else data.phone = phone;
  } else if (!partial) {
    errors.phone = 'Bắt buộc';
  }

  return { data, errors: Object.keys(errors).length ? errors : null };
}

export function createCustomer(data) {
  const now = new Date().toISOString();
  const customer = { id: `c${crypto.randomUUID().slice(0, 8)}`, ...data, createdAt: now, updatedAt: now };
  customers = [customer, ...customers];
  writeJson('customers.json', customers);
  return customer;
}

export function updateCustomer(id, data) {
  const existing = getCustomer(id);
  if (!existing) return null;
  const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
  customers = customers.map((c) => (c.id === id ? updated : c));
  writeJson('customers.json', customers);
  return updated;
}

export function deleteCustomer(id) {
  const before = customers.length;
  customers = customers.filter((c) => c.id !== id);
  if (customers.length === before) return false;
  writeJson('customers.json', customers);
  return true;
}

// ---------- Audit ----------

export function audit(entry) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  fs.appendFile(AUDIT_FILE, `${line}\n`, () => {});
  if (entry.type !== 'phone-reveal') console.log(`[audit] ${line}`);
}
