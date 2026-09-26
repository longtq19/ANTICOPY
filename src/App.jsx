import { useEffect, useState } from 'react';
import { api, hasToken, setUnauthorizedHandler } from './api.js';
import { installGuard } from './protection/guard.js';
import CustomerPage from './components/CustomerPage.jsx';
import Login from './components/Login.jsx';
import Watermark from './components/Watermark.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(hasToken);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    if (!hasToken()) return;
    api
      .me()
      .then(setUser)
      .catch(() => {})
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    return installGuard((kind, detail) => api.reportEvent(kind, detail).catch(() => {}));
  }, [user]);

  if (booting) return <div className="login-wrap muted">Đang tải…</div>;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <>
      <CustomerPage
        user={user}
        onLogout={async () => {
          await api.logout();
          setUser(null);
        }}
      />
      <Watermark user={user} />
    </>
  );
}
