// Utility format angka rupiah untuk input harga di seluruh app.
// formatIDRInput: string mentah → string dengan pemisah ribuan ("200000" → "200.000").
// parseIDRInput: string terformat → number murni ("200.000" → 200000).

export function formatIDRInput(value: string): string {
  const numeric = value.replace(/\D/g, "")
  if (!numeric) return ""
  return parseInt(numeric, 10).toLocaleString("id-ID")
}

export function parseIDRInput(formatted: string): number {
  return parseInt(formatted.replace(/\D/g, ""), 10) || 0
}
