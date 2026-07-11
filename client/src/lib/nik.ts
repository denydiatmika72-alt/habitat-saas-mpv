// Validasi NIK (KTP Indonesia, 16 digit) di sisi client — untuk fail-fast sebelum hit API.
// MIRROR dari server/services/nik-parser.service.js (bagian validasi tanggal lahir digit 7-12).
// Backend TETAP menjadi sumber kebenaran (pakai parseNik yang sama untuk demografi Data Audiens);
// helper ini hanya UX supaya pembeli dapat feedback instan. Jaga tetap sinkron dengan server.

// Struktur digit 7-12: DDMMYY. Perempuan: DD + 40 (41-71). Laki-laki: DD 01-31.
// Return: { valid, reason? }. Tidak throw.
export function validateNik(nik: string): { valid: boolean; reason?: string } {
  const trimmed = (nik || "").trim()
  if (!/^\d{16}$/.test(trimmed)) return { valid: false, reason: "NIK harus 16 digit angka." }

  const dd = parseInt(trimmed.slice(6, 8), 10)
  const mm = parseInt(trimmed.slice(8, 10), 10)
  const yy = parseInt(trimmed.slice(10, 12), 10)

  const day = dd > 40 ? dd - 40 : dd
  if (day < 1 || day > 31) return { valid: false, reason: "NIK tidak valid: Tanggal lahir tidak valid (DD)" }
  if (mm < 1 || mm > 12) return { valid: false, reason: "NIK tidak valid: Bulan lahir tidak valid (MM)" }

  // Infer abad: asumsi 2000+yy, mundur ke 1900+yy kalau melebihi tahun berjalan.
  const refYear = new Date().getUTCFullYear()
  let year = 2000 + yy
  if (year > refYear) year -= 100

  // Tanggal harus benar-benar ada di kalender (tolak 31 Feb, 30 Feb, dll).
  const birth = new Date(Date.UTC(year, mm - 1, day))
  if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== mm - 1 || birth.getUTCDate() !== day) {
    return { valid: false, reason: "NIK tidak valid: Tanggal lahir tidak ada di kalender" }
  }

  return { valid: true }
}
