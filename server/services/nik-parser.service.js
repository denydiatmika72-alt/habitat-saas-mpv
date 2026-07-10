// Parser NIK (Nomor Induk Kependudukan / KTP Indonesia, 16 digit) → tanggal lahir, gender, umur.
// Dipakai oleh audience-report.controller.js (Data Audiens — Roadmap #5) untuk menurunkan demografi
// pembeli tiket secara otomatis dari NIK yang WAJIB diisi saat checkout (tanpa ubah form beli tiket).
//
// Struktur NIK: PPKKDD DDMMYY SSSS
//   digit 1-6  : kode wilayah (provinsi/kota/kecamatan) — tidak dipakai di sini
//   digit 7-12 : tanggal lahir DDMMYY
//                - DD: untuk PEREMPUAN, tanggal + 40 (jadi 41-71). Laki-laki 01-31.
//                - MM: bulan 01-12
//                - YY: 2 digit tahun (abad di-infer dari tahun berjalan)
//   digit 13-16: nomor urut
//
// PENTING (per instruksi): fungsi ini TIDAK PERNAH throw. Input malformed → return { valid:false, reason }.
// Report generation harus SKIP entri unparseable, bukan crash. Age dihitung relatif `referenceDate`
// (default now) — param opsional supaya unit test deterministik.

function parseNik(nik, referenceDate = new Date()) {
  if (typeof nik !== 'string') return { valid: false, reason: 'NIK bukan string' };
  const trimmed = nik.trim();
  if (!/^\d{16}$/.test(trimmed)) return { valid: false, reason: 'NIK harus tepat 16 digit angka' };

  const dd = parseInt(trimmed.slice(6, 8), 10);
  const mm = parseInt(trimmed.slice(8, 10), 10);
  const yy = parseInt(trimmed.slice(10, 12), 10);

  // Gender + tanggal asli. Perempuan: DD > 40 (41-71). Laki-laki: DD 1-31.
  let gender, day;
  if (dd > 40) { gender = 'female'; day = dd - 40; }
  else { gender = 'male'; day = dd; }

  if (day < 1 || day > 31) return { valid: false, reason: 'Tanggal lahir tidak valid (DD)' };
  if (mm < 1 || mm > 12) return { valid: false, reason: 'Bulan lahir tidak valid (MM)' };

  // Infer abad: mulai asumsi 2000+yy; kalau melebihi tahun berjalan → mundur ke 1900+yy.
  const refYear = referenceDate.getUTCFullYear();
  let year = 2000 + yy;
  if (year > refYear) year -= 100;

  // Validasi tanggal benar-benar ada di kalender (tolak mis. 31 Feb, 30 Feb).
  const birth = new Date(Date.UTC(year, mm - 1, day));
  if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== mm - 1 || birth.getUTCDate() !== day) {
    return { valid: false, reason: 'Tanggal lahir tidak ada di kalender' };
  }

  // Hitung umur relatif referenceDate (UTC).
  let age = refYear - year;
  const monthDiff = referenceDate.getUTCMonth() - (mm - 1);
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getUTCDate() < day)) age -= 1;
  if (age < 0 || age > 120) return { valid: false, reason: 'Umur di luar rentang wajar' };

  return { valid: true, gender, day, month: mm, year, birthDate: birth, age };
}

// Bucket umur untuk dashboard (rentang standar demografi audiens event).
const AGE_BUCKETS = ['<18', '18-24', '25-34', '35-44', '45+'];
function ageBucket(age) {
  if (age < 18) return '<18';
  if (age <= 24) return '18-24';
  if (age <= 34) return '25-34';
  if (age <= 44) return '35-44';
  return '45+';
}

module.exports = { parseNik, ageBucket, AGE_BUCKETS };
