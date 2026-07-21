// Definisi TUNGGAL untuk sistem Permintaan Perubahan Event (2026-07-21).
// Dipakai bersama oleh event-change-request.controller.js (promotor + admin) dan
// email.service.js (notifikasi admin). JANGAN duplikasi peta field/label di tempat lain —
// menambah field terkunci baru cukup di SATU tempat: LOCKED_FIELDS di bawah.
//
// Konteks: 5 field ini + hapus event tidak lagi boleh dieksekusi langsung promotor.
// Alasan hapus event: deleteEvent + relasi cascade membuka jalur penghindaran hutang fee cash.

// requestType → { field: nama kolom di model Event, label: teks Indonesia, kind: tipe nilai }
const LOCKED_FIELDS = {
  rename: { field: 'title', label: 'Nama Event', kind: 'string' },
  venue_location: { field: 'location', label: 'Lokasi Venue', kind: 'string' },
  venue_capacity: { field: 'venue_capacity', label: 'Kapasitas Venue', kind: 'int' },
  target_profit: { field: 'target_profit', label: 'Target Profit', kind: 'decimal' },
  target_sponsor: { field: 'target_sponsorship', label: 'Target Sponsor', kind: 'decimal' },
};

const DELETE_TYPE = 'delete';

const VALID_REQUEST_TYPES = [DELETE_TYPE, ...Object.keys(LOCKED_FIELDS)];

const REQUEST_TYPE_LABELS = {
  [DELETE_TYPE]: 'Hapus Event (permanen)',
  ...Object.fromEntries(Object.entries(LOCKED_FIELDS).map(([k, v]) => [k, v.label])),
};

// Kolom Event yang TIDAK boleh lagi ditulis lewat jalur edit langsung promotor.
const LOCKED_EVENT_COLUMNS = Object.values(LOCKED_FIELDS).map((v) => v.field);

const LOCKED_FIELD_MESSAGE =
  'Nama event, lokasi venue, kapasitas venue, target profit, dan target sponsor tidak bisa diubah langsung. ' +
  'Ajukan permintaan perubahan lewat halaman Perencanaan agar disetujui admin terlebih dahulu.';

const DELETE_LOCKED_MESSAGE =
  'Hapus event hanya bisa dilakukan lewat persetujuan admin. Ajukan permintaan hapus event di halaman Perencanaan.';

// Ambil nilai kolom Event sebagai STRING untuk snapshot oldValue.
// Decimal Prisma → pakai toString() agar tidak kehilangan presisi lewat Number().
function readEventValue(event, requestType) {
  const spec = LOCKED_FIELDS[requestType];
  if (!spec) return null;
  const raw = event[spec.field];
  if (raw === null || raw === undefined) return null;
  return typeof raw === 'object' && typeof raw.toString === 'function' ? raw.toString() : String(raw);
}

// Validasi + normalisasi newValue dari client sesuai tipe kolomnya.
// Return { ok: true, value } (value = string yang disimpan di newValue) atau { ok: false, message }.
function validateNewValue(requestType, rawValue) {
  const spec = LOCKED_FIELDS[requestType];
  if (!spec) return { ok: false, message: 'Jenis permintaan tidak dikenal.' };

  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return { ok: false, message: `${spec.label} baru wajib diisi.` };
  }
  const value = String(rawValue).trim();

  if (spec.kind === 'string') {
    if (value.length > 255) return { ok: false, message: `${spec.label} maksimal 255 karakter.` };
    return { ok: true, value };
  }

  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, message: `${spec.label} harus berupa angka yang valid (tidak negatif).` };
  }
  if (spec.kind === 'int') {
    if (!Number.isInteger(n) || n < 1) {
      return { ok: false, message: `${spec.label} harus bilangan bulat minimal 1.` };
    }
  }
  return { ok: true, value: String(n) };
}

// Ubah newValue (string tersimpan) jadi payload prisma.event.update saat admin menyetujui.
function buildUpdateData(requestType, newValue) {
  const spec = LOCKED_FIELDS[requestType];
  if (!spec) return null;
  if (spec.kind === 'int') return { [spec.field]: parseInt(newValue, 10) };
  if (spec.kind === 'decimal') return { [spec.field]: Number(newValue) };
  return { [spec.field]: newValue };
}

module.exports = {
  LOCKED_FIELDS,
  DELETE_TYPE,
  VALID_REQUEST_TYPES,
  REQUEST_TYPE_LABELS,
  LOCKED_EVENT_COLUMNS,
  LOCKED_FIELD_MESSAGE,
  DELETE_LOCKED_MESSAGE,
  readEventValue,
  validateNewValue,
  buildUpdateData,
};
