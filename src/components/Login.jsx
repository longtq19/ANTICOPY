import { useState } from 'react';
import { api } from '../api.js';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin(await api.login(username, password));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand">
          <span className="brand-logo">KH</span>
          <div>
            <h1>Quản lý khách hàng</h1>
            <p className="muted">Hệ thống nội bộ trong mạng LAN</p>
          </div>
        </div>
        <label className="field">
          <span>Tên đăng nhập</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label className="field">
          <span>Mật khẩu</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <div className="alert">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
        <p className="hint">
          Tài khoản demo: <b>admin / admin123</b> (quản trị) · <b>nhanvien / nhanvien123</b> (chỉ xem)
        </p>
      </form>
    </div>
  );
}
