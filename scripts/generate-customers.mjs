import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data', 'customers.json');
const TARGET = 1000;

const existing = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const keep = existing.slice(0, 12);

const ho = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Mai', 'Trịnh', 'Đinh', 'Tô'];
const dem = ['Văn', 'Thị', 'Hoàng', 'Minh', 'Thanh', 'Ngọc', 'Quốc', 'Kim', 'Xuân', 'Đức', 'Thu', 'Anh', 'Hữu', 'Tuấn', 'Bảo'];
const ten = ['An', 'Bình', 'Cường', 'Dũng', 'Giang', 'Hà', 'Hùng', 'Khoa', 'Lan', 'Linh', 'Minh', 'Nam', 'Oanh', 'Phúc', 'Quang', 'Sơn', 'Trang', 'Uyên', 'Vân', 'Yến', 'Tú', 'Hải', 'Long', 'Nhung', 'Phương'];
const groups = ['VIP', 'Thân thiết', 'Mới'];
const streets = ['Lê Lợi', 'Nguyễn Huệ', 'Trần Hưng Đạo', 'Hai Bà Trưng', 'Lý Thường Kiệt', 'Nguyễn Trãi', 'Pasteur', 'Điện Biên Phủ', 'Cách Mạng Tháng 8', 'Hoàng Hoa Thám'];
const cities = [
  'Quận 1, TP.HCM',
  'Quận 3, TP.HCM',
  'Quận 7, TP.HCM',
  'Cầu Giấy, Hà Nội',
  'Hoàn Kiếm, Hà Nội',
  'Hải Châu, Đà Nẵng',
  'Ninh Kiều, Cần Thơ',
  'Ngô Quyền, Hải Phòng',
  'TP. Huế',
  'Nha Trang, Khánh Hòa',
  'TP. Vinh, Nghệ An',
  'TP. Quy Nhơn, Bình Định',
];
const companies = [
  'TNHH Minh Phát',
  'Fashion House',
  'Logistics Việt',
  'Xây Dựng Hòa Bình',
  'Nông Sản Sạch',
  'Auto Care',
  'Beauty Spa',
  'Du lịch An Khang',
  'Thủy Sản Biển Đông',
  'Công nghệ số',
  '',
  '',
];
const notes = [
  'Ưu tiên liên hệ buổi sáng',
  'Khách giới thiệu',
  'Đặt hàng định kỳ',
  'Liên hệ qua email trước',
  'Quan tâm gói cơ bản',
  '',
  '',
  '',
];
const prefixes = ['090', '091', '093', '094', '096', '097', '098', '032', '033', '034', '035', '036', '037', '038', '039', '070', '076', '077', '078', '079', '081', '082', '083', '084', '085', '086', '088', '089'];

const phones = new Set(keep.map((c) => c.phone));
const customers = [...keep];

function slug(name, n) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim()
    .replace(/\s+/g, '.')
    + n;
}

for (let i = keep.length + 1; customers.length < TARGET; i += 1) {
  const name = `${ho[i % ho.length]} ${dem[i % dem.length]} ${ten[i % ten.length]}`;
  let phone;
  let salt = 0;
  do {
    const prefix = prefixes[(i + salt) % prefixes.length];
    const rest = String(1000000 + i * 17 + salt).slice(-7);
    phone = `${prefix}${rest}`;
    salt += 1;
  } while (phones.has(phone));
  phones.add(phone);

  const year = 1968 + (i % 35);
  const month = String((i % 12) + 1).padStart(2, '0');
  const day = String((i % 28) + 1).padStart(2, '0');
  const createdDay = String((i % 28) + 1).padStart(2, '0');
  const createdMonth = String((i % 12) + 1).padStart(2, '0');
  const company = companies[i % companies.length];

  customers.push({
    id: `c${String(i).padStart(3, '0')}`,
    name,
    phone,
    email: `${slug(name, i)}@example.com`,
    address: `${(i % 120) + 1} ${streets[i % streets.length]}, ${cities[i % cities.length]}`,
    company,
    group: groups[i % groups.length],
    birthday: `${year}-${month}-${day}`,
    notes: notes[i % notes.length],
    createdAt: `2026-${createdMonth}-${createdDay}T0${i % 9}:00:00.000Z`,
  });
}

fs.writeFileSync(FILE, `${JSON.stringify(customers, null, 2)}\n`, 'utf8');
console.log(`Wrote ${customers.length} customers to ${FILE}`);
