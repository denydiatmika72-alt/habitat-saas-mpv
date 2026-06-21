export type DocStatus = "Lunas" | "Terkirim" | "Draft" | "Jatuh Tempo"

export interface EventDocument {
  id: string
  number: string
  type: "Invoice" | "RAB"
  event: string
  client: string
  venue: string
  issuedAt: string
  dueAt: string
  amount: number
  status: DocStatus
}

export const documents: EventDocument[] = [
  {
    id: "1",
    number: "INV-2024-001",
    type: "Invoice",
    event: "Java Jazz Festival 2024",
    client: "PT. Musik Nusantara",
    venue: "JIExpo Kemayoran, Jakarta",
    issuedAt: "2024-01-15",
    dueAt: "2024-02-15",
    amount: 150000000,
    status: "Lunas",
  },
  {
    id: "2",
    number: "RAB-2024-012",
    type: "RAB",
    event: "Synchronize Fest 2024",
    client: "CV. Promosindo",
    venue: "Gambir Expo, Jakarta",
    issuedAt: "2024-01-20",
    dueAt: "2024-02-20",
    amount: 320000000,
    status: "Terkirim",
  },
  {
    id: "3",
    number: "INV-2024-003",
    type: "Invoice",
    event: "Hammersonic 2024",
    client: "PT. Konser Abadi",
    venue: "Pantai Carnaval Ancol",
    issuedAt: "2024-01-08",
    dueAt: "2024-01-31",
    amount: 85000000,
    status: "Jatuh Tempo",
  },
  {
    id: "4",
    number: "RAB-2024-008",
    type: "RAB",
    event: "We The Fest 2024",
    client: "PT. Ismaya Live",
    venue: "Gambir Expo, Jakarta",
    issuedAt: "2024-01-25",
    dueAt: "2024-03-01",
    amount: 450000000,
    status: "Draft",
  },
  {
    id: "5",
    number: "INV-2024-005",
    type: "Invoice",
    event: "Soundrenaline 2024",
    client: "PT. Rajawali Indonesia",
    venue: "Garuda Wisnu Kencana, Bali",
    issuedAt: "2024-02-01",
    dueAt: "2024-03-01",
    amount: 210000000,
    status: "Lunas",
  },
  {
    id: "6",
    number: "RAB-2024-015",
    type: "RAB",
    event: "Djakarta Warehouse Project",
    client: "PT. Dyandra Event Solution",
    venue: "Jiexpo Kemayoran, Jakarta",
    issuedAt: "2024-02-10",
    dueAt: "2024-03-10",
    amount: 550000000,
    status: "Terkirim",
  },
]

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr))
}
