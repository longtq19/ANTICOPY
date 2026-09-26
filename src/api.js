const TOKEN_KEY = 'lan-crm-token';

let token = sessionStorage.getItem(TOKEN_KEY);
let onUnauthorized = () => {};

export const hasToken = () => !!token;

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

function setToken(value) {
  token = value;
  if (value) sessionStorage.setItem(TOKEN_KEY, value);
  else sessionStorage.removeItem(TOKEN_KEY);
}

async function request(method, url, body) {
  const headers = { 'X-Anticopy-Client': '1' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (res.status === 401 && token) {
    setToken(null);
    onUnauthorized();
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `Lỗi ${res.status}`);
    err.status = res.status;
    err.details = data?.details;
    throw err;
  }
  return data;
}

export const api = {
  async login(username, password) {
    const data = await request('POST', '/login', { username, password });
    setToken(data.token);
    return data.user;
  },
  async logout() {
    await request('POST', '/logout').catch(() => {});
    setToken(null);
  },
  me: () => request('GET', '/me'),
  serverInfo: () => request('GET', '/server-info'),
  listCustomers: ({ q = '', group = '' } = {}) =>
    request('GET', `/customers?${new URLSearchParams({ q, group })}`),
  createCustomer: (data) => request('POST', '/customers', data),
  updateCustomer: (id, data) => request('PUT', `/customers/${encodeURIComponent(id)}`, data),
  deleteCustomer: (id) => request('DELETE', `/customers/${encodeURIComponent(id)}`),
  phoneGlyph: (id) => request('POST', `/customers/${encodeURIComponent(id)}/phone-glyph`),
  reportEvent: (kind, detail) => request('POST', '/security-events', { kind, detail }),
};
