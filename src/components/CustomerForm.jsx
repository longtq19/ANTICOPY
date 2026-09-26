import { useState } from 'react';
import { api } from '../api.js';

const EMPTY = { name: '', phone: '', email: '', address: '', company: '', group: 'Mới', birthday: '', notes: '' };

export default function CustomerForm({ customer, groups, onClose, onSaved }) {
  const isEdit = !!customer?.id;
  const [form, setForm] = useState(() => ({ ...EMPTY, ...customer, phone: '' }));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setErrors({});
    const payload = {
      name: form.name,
      email: form.email,
      address: form.address,
      company: form.company,
      group: form.group,
      birthday: form.birthday,
      notes: form.notes,
      ...(form.phone.trim() ? { phone: form.phone } : {}),
    };
    try {
      const saved = isEdit ? await api.updateCustomer(customer.id, payload) : await api.createCustomer(payload);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setErrors(err.details ?? {});
    } finally {
      setBusy(false);
    }
  };

  const field = (key, label, props = {}) => (
    <label className={`field${errors[key] ? ' has-error' : ''}`}>
      <span>{label}</span>
      <input value={form[key]} onChange={set(key)} {...props} />
      {errors[key] && <small className="error-text">{errors[key]}</small>}
    </label>
  );

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="card modal" onSubmit={submit}>
        <header className="modal-head">
          <h2>{isEdit ? 'Sửa khách hàng' : 'Thêm khách hàng'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </header>
        <div className="form-grid">
          {field('name', 'Họ tên *', { required: true, maxLength: 100 })}
          {field('phone', isEdit ? 'Số điện thoại mới (để trống nếu giữ nguyên)' : 'Số điện thoại *', {
            type: 'tel',
            inputMode: 'tel',
            autoComplete: 'off',
            required: !isEdit,
            placeholder: isEdit ? '•••• ••• •••' : '0901 234 567',
          })}
          {field('email', 'Email', { type: 'email', maxLength: 120 })}
          {field('company', 'Công ty', { maxLength: 100 })}
          {field('birthday', 'Ngày sinh', { type: 'date' })}
          <label className={`field${errors.group ? ' has-error' : ''}`}>
            <span>Nhóm</span>
            <select value={form.group} onChange={set('group')}>
              {groups.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <div className="span-2">{field('address', 'Địa chỉ', { maxLength: 200 })}</div>
          <label className={`field span-2${errors.notes ? ' has-error' : ''}`}>
            <span>Ghi chú</span>
            <textarea rows={3} value={form.notes} onChange={set('notes')} maxLength={500} />
          </label>
        </div>
        {error && <div className="alert">{error}</div>}
        <footer className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Lưu'}
          </button>
        </footer>
      </form>
    </div>
  );
}
