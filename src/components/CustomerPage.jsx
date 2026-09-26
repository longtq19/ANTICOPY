import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { REASON_LABELS, useGuard } from '../protection/guard.js';
import CustomerForm from './CustomerForm.jsx';
import PhoneCanvas from './PhoneCanvas.jsx';

const GROUP_CLASS = { VIP: 'vip', 'Thân thiết': 'loyal', Mới: 'new' };

function GuardBanner() {
  const { reasons } = useGuard();
  const shown = reasons.filter((r) => r !== 'pointer-out');
  if (!shown.length) return null;
  return (
    <div className="guard-banner" role="status">
      🔒 Số điện thoại đang được ẩn: {shown.map((r) => REASON_LABELS[r] ?? r).join(' · ')}
    </div>
  );
}

export default function CustomerPage({ user, onLogout }) {
  const isAdmin = user.role === 'admin';
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [data, setData] = useState({ items: [], groups: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [lanUrls, setLanUrls] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.listCustomers({ q: query, group }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [query, group]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    api.serverInfo().then((info) => setLanUrls(info.urls)).catch(() => {});
  }, []);

  const remove = async (c) => {
    if (!window.confirm(`Xóa khách hàng "${c.name}"?`)) return;
    try {
      await api.deleteCustomer(c.id);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-logo">KH</span>
          <div>
            <h1>Khách hàng</h1>
            <p className="muted">{data.items.length} khách hàng</p>
          </div>
        </div>
        <div className="user-box">
          <div className="user-meta">
            <b>{user.displayName}</b>
            <span className="muted">{isAdmin ? 'Quản trị viên' : 'Chỉ xem'}</span>
          </div>
          <button className="btn" onClick={onLogout}>
            Đăng xuất
          </button>
        </div>
      </header>

      <GuardBanner />

      <section className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Tìm theo tên, email, địa chỉ, công ty…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Lọc theo nhóm">
          <option value="">Tất cả nhóm</option>
          {data.groups.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            + Thêm khách hàng
          </button>
        )}
      </section>

      {error && <div className="alert">{error}</div>}

      <div className="card table-card">
        <table className="customer-table">
          <thead>
            <tr>
              <th>Khách hàng</th>
              <th>Số điện thoại</th>
              <th>Email</th>
              <th>Địa chỉ</th>
              <th>Nhóm</th>
              {isAdmin && <th aria-label="Thao tác" />}
            </tr>
          </thead>
          <tbody>
            {data.items.map((c) => (
              <tr key={c.id}>
                <td data-label="Khách hàng">
                  <div>
                    <div className="name">{c.name}</div>
                    {c.company && <div className="muted small">{c.company}</div>}
                    {c.notes && <div className="muted small notes">{c.notes}</div>}
                  </div>
                </td>
                <td data-label="Điện thoại">
                  <PhoneCanvas customerId={c.id} />
                </td>
                <td data-label="Email">{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}</td>
                <td data-label="Địa chỉ">{c.address || '—'}</td>
                <td data-label="Nhóm">
                  <span className={`badge badge-${GROUP_CLASS[c.group] ?? 'new'}`}>{c.group}</span>
                </td>
                {isAdmin && (
                  <td className="actions">
                    <button className="btn btn-sm" onClick={() => setEditing(c)}>
                      Sửa
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(c)}>
                      Xóa
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !data.items.length && <p className="empty">Không có khách hàng phù hợp.</p>}
        {loading && !data.items.length && <p className="empty">Đang tải…</p>}
      </div>

      <footer className="footer muted small">
        Nhấn giữ nút "Giữ để xem" để hiển thị số điện thoại trong vài giây. Mọi lượt xem đều được ghi nhật ký.
        {lanUrls.length > 0 && (
          <div>
            Truy cập từ thiết bị khác trong LAN: {lanUrls.map((u) => <code key={u}>{u}</code>)}
          </div>
        )}
      </footer>

      {editing && (
        <CustomerForm
          customer={editing}
          groups={data.groups}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
