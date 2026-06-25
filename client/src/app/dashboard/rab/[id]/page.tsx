'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { Trash2, Loader2, ArrowLeft, PlusCircle, FolderPlus, Printer, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const API = "/api";

const formatRp = (val: number | string) => 'Rp ' + Number(val).toLocaleString('id-ID');
const formatRibuan = (val: string) => {
  const num = String(val).replace(/\D/g, '');
  return num.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

// Interface dikemas kini mengikut database asli
interface BudgetItem { 
  id: string; 
  name: string; 
  estimatedCost: string | number;
  qty?: number | string;          // <-- Data Rasmi
  hargaSatuan?: number | string;  // <-- Data Rasmi
}
interface BudgetCategory { id: string; name: string; allocatedBudget: string | number; items: BudgetItem[]; }
interface Budget { id: string; eventId: string; totalEstimatedCost: string | number; contingencyFundAmount: string | number; contingencyFundPercentage: string | number; categories: BudgetCategory[]; }
interface ItemForm { name: string; qty: string; hargaSatuan: string; }

export default function RABPage() {
  const { id: eventId } = useParams<{ id: string }>();

  const [budget, setBudget] = useState<Budget | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [itemForms, setItemForms] = useState<Record<string, ItemForm>>({});
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [saving, setSaving] = useState(false);

  const getToken = () => localStorage.getItem('token') || '';
  const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` });

  const initAndFetch = async () => {
    setLoading(true); setError('');
    try {
      await axios.post(`${API}/budgets/initialize`, { eventId }, { headers: authHeaders() }).catch((e) => { if (e.response?.status !== 409) throw e; });
      const res = await axios.get(`${API}/budgets/${eventId}`, { headers: authHeaders() });
      setBudget(res.data.data);
      try {
        const evRes = await axios.get(`${API}/events/${eventId}`, { headers: authHeaders() });
        setEventTitle(evRes.data.data?.title ?? `Event #${eventId}`);
      } catch { setEventTitle(`Event #${eventId}`); }
    } catch (e: any) { setError('Gagal memuat data RAB.'); } finally { setLoading(false); }
  };

  const refreshBudget = async () => {
    try {
      const res = await axios.get(`${API}/budgets/${eventId}`, { headers: authHeaders() });
      setBudget(res.data.data);
    } catch {}
  };

  useEffect(() => { initAndFetch(); }, [eventId]);

  const handleAddItem = async (categoryId: string) => {
    const form = itemForms[categoryId];
    if (!form?.name?.trim() || !form?.qty || !form?.hargaSatuan) return;

    const rawQty = Number(form.qty.replace(/\D/g, ''));
    const rawHarga = Number(form.hargaSatuan.replace(/\D/g, ''));
    const totalBiaya = rawQty * rawHarga;
    
    setSaving(true);
    try {
      // Hantar data penuh tanpa trik
      await axios.post(`${API}/budgets/categories/${categoryId}/items`, { 
        name: form.name.trim(), 
        estimatedCost: totalBiaya,
        qty: rawQty,
        hargaSatuan: rawHarga
      }, { headers: authHeaders() });
      
      setItemForms((prev) => ({ ...prev, [categoryId]: { name: '', qty: '1', hargaSatuan: '' } }));
      await refreshBudget();
    } catch (e: any) { alert('Gagal menambah item'); } finally { setSaving(false); }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Hapus item ini?')) return;
    try { await axios.delete(`${API}/budgets/items/${itemId}`, { headers: authHeaders() }); await refreshBudget(); } catch { alert('Gagal menghapus item.'); }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim() || !budget) return;
    setSaving(true);
    try { await axios.post(`${API}/budgets/categories`, { budgetId: budget.id, name: newCategoryName.trim() }, { headers: authHeaders() }); setNewCategoryName(''); await refreshBudget(); } catch { alert('Gagal membuat kategori.'); } finally { setSaving(false); }
  };

  const handleSaveCategory = async (categoryId: string) => {
    if (!editCategoryName.trim()) return;
    try { await axios.put(`${API}/budgets/categories/${categoryId}`, { name: editCategoryName.trim() }, { headers: authHeaders() }); setEditingCategoryId(null); setEditCategoryName(''); await refreshBudget(); } catch { alert('Gagal menyimpan nama kategori.'); }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm('Yakin hapus kategori ini?')) return;
    try { await axios.delete(`${API}/budgets/categories/${categoryId}`, { headers: authHeaders() }); await refreshBudget(); } catch { alert('Gagal menghapus kategori.'); }
  };

  const setItemFormField = (categoryId: string, field: keyof ItemForm, value: string) =>
    setItemForms((prev) => { const current: ItemForm = prev[categoryId] ?? { name: '', qty: '1', hargaSatuan: '' }; return { ...prev, [categoryId]: { ...current, [field]: value } }; });

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="animate-spin w-10 h-10 text-emerald-700" /></div>;
  if (error) return <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4"><p className="text-red-500">{error}</p><Button variant="outline" onClick={initAndFetch}>Coba Lagi</Button></div>;
  if (!budget) return null;

  const printDate = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const totalRAB = Number(budget.totalEstimatedCost);
  const danaCadangan = Number(budget.contingencyFundAmount);
  const grandTotal = totalRAB + danaCadangan;

  let maxCat = { name: '-', total: 0 };
  budget.categories.forEach(cat => {
    const catTotal = cat.items.reduce((acc, i) => acc + Number(i.estimatedCost), 0);
    if (catTotal > maxCat.total) maxCat = { name: cat.name, total: catTotal };
  });

  return (
    <div className="bg-slate-50 text-slate-900 min-h-screen">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm 15mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white !important; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          table { page-break-inside: auto; width: 100%; border-collapse: collapse; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          th, td { padding: 5px 8px; border: 1px solid #1e293b; font-size: 11px; line-height: 1.25; }
          th { background-color: #f1f5f9 !important; font-weight: bold; }
        }
      `}</style>
      
      <div className="max-w-5xl mx-auto p-4 sm:p-8">

        {/* --- AREA CETAK (PDF) --- */}
        <div className="hidden print:block font-sans">
          <table className="w-full mb-5 border-0">
            <tbody>
              <tr>
                <td className="border-0 align-top p-0 w-1/2">
                  <div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 bg-emerald-800 rounded flex items-center justify-center text-white font-bold text-xl">A</div><span className="font-bold text-lg text-slate-800 tracking-wider">AURORA</span></div>
                  <table className="text-xs text-slate-700 mt-4 border-0">
                    <tbody>
                      <tr><td className="border-0 py-0.5 font-semibold w-24 px-0">Nama Event</td><td className="border-0 py-0.5 px-0">: {eventTitle}</td></tr>
                      <tr><td className="border-0 py-0.5 font-semibold px-0">Tanggal Cetak</td><td className="border-0 py-0.5 px-0">: {printDate}</td></tr>
                    </tbody>
                  </table>
                </td>
                <td className="border-0 align-top p-0 w-1/2 text-right">
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">LAPORAN ANGGARAN BIAYA (RAB)</h1>
                  <p className="text-xs font-semibold text-emerald-700 mt-1">Status: OFFICIAL REPORT</p>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="mb-5 p-3 border border-slate-800 bg-slate-50 flex justify-between items-center rounded-sm">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Total Anggaran Biaya (Grand Total)</p>
              <p className="text-2xl font-bold text-slate-900">{formatRp(grandTotal)}</p>
            </div>
            <div className="text-right max-w-xs">
              <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Highlight Strategi</p>
              <p className="text-xs text-slate-700 leading-tight">Alokasi terbesar pada <b>{maxCat.name}</b> ({formatRp(maxCat.total)}).</p>
            </div>
          </div>

          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="w-[25%]">Kategori</th>
                <th className="w-[35%]">Detail Nama Item</th>
                <th className="w-[10%] text-center">Qty</th>
                <th className="w-[15%] text-right">Harga Satuan</th>
                <th className="w-[15%] text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {budget.categories.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-4 italic text-slate-500">Belum ada data anggaran</td></tr>
              ) : (
                budget.categories.map(cat => {
                  const catTotal = cat.items.reduce((acc, i) => acc + Number(i.estimatedCost), 0);
                  return (
                    <React.Fragment key={cat.id}>
                      {cat.items.map((item, idx) => (
                        <tr key={item.id}>
                          {idx === 0 && <td rowSpan={cat.items.length} className="font-semibold align-top bg-white">{cat.name}</td>}
                          <td>{item.name}</td>
                          <td className="text-center">{item.qty ? formatRibuan(String(item.qty)) : "-"}</td>
                          <td className="text-right">{item.hargaSatuan ? formatRp(Number(item.hargaSatuan)) : "-"}</td>
                          <td className="text-right font-medium">{formatRp(item.estimatedCost)}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50 font-bold">
                        <td colSpan={4} className="text-right uppercase text-[10px] tracking-widest text-slate-600">Subtotal {cat.name}</td>
                        <td className="text-right text-emerald-800">{formatRp(catTotal)}</td>
                      </tr>
                    </React.Fragment>
                  )
                })
              )}
              
              <tr className="bg-slate-100 font-bold">
                <td colSpan={4} className="text-right uppercase text-[10px] tracking-widest text-slate-800">TOTAL KEBUTUHAN RAB</td>
                <td className="text-right text-slate-800">{formatRp(totalRAB)}</td>
              </tr>
              <tr className="bg-amber-50 font-bold border-amber-200">
                <td colSpan={4} className="text-right uppercase text-[10px] tracking-widest text-amber-700">Dana Cadangan ({Number(budget.contingencyFundPercentage)}%)</td>
                <td className="text-right text-amber-700">{formatRp(danaCadangan)}</td>
              </tr>
              <tr className="bg-emerald-800 font-bold text-white border-emerald-800">
                <td colSpan={4} className="text-right uppercase text-[11px] tracking-widest text-emerald-100">GRAND TOTAL ANGGARAN</td>
                <td className="text-right text-white">{formatRp(grandTotal)}</td>
              </tr>
            </tbody>
          </table>

          <div className="flex justify-between items-end mt-12 pt-6">
            <div className="flex flex-col items-center gap-1 text-[11px] text-slate-700"><p>Dibuat Oleh,</p><div className="h-16" /><span className="border-b border-slate-800 font-bold inline-block w-40 text-center pb-1">Tim Finance</span></div>
            <div className="flex flex-col items-center gap-1 text-[11px] text-slate-700"><p>Diperiksa Oleh,</p><div className="h-16" /><span className="border-b border-slate-800 font-bold inline-block w-40 text-center pb-1">Project Manager</span></div>
            <div className="flex flex-col items-center gap-1 text-[11px] text-slate-700"><p>Disetujui Oleh,</p><div className="h-16" /><span className="border-b border-slate-800 font-bold inline-block w-40 text-center pb-1">Promotor / Sponsor</span></div>
          </div>
        </div>

        {/* --- AREA LAYAR WEB --- */}
        <div className="print:hidden space-y-6">
          <div className="flex items-center justify-between">
            <Link href="/dashboard"><Button variant="ghost" className="text-slate-500 hover:text-slate-700 -ml-2 gap-1.5"><ArrowLeft className="w-4 h-4" />Kembali</Button></Link>
            <Button variant="outline" className="gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-100" onClick={() => window.print()}><Printer className="w-4 h-4" />Cetak Proposal PDF</Button>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-700">Rencana Anggaran Biaya</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Detail RAB Event</h1>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="bg-emerald-800 border-0 shadow-md text-white">
              <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-emerald-200 tracking-wide">Total Estimasi Biaya</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold text-white leading-tight">{formatRp(budget.totalEstimatedCost)}</p></CardContent>
            </Card>
            <Card className="bg-white border border-emerald-200 shadow-sm">
              <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-emerald-700 tracking-wide">Dana Cadangan {Number(budget.contingencyFundPercentage)}%</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold text-emerald-600 leading-tight">{formatRp(budget.contingencyFundAmount)}</p></CardContent>
            </Card>
          </div>

          {budget.categories.map((cat) => {
            const form = itemForms[cat.id];
            const rawQty = form?.qty?.replace(/\D/g, '') || '0';
            const rawHarga = form?.hargaSatuan?.replace(/\D/g, '') || '0';
            const previewTotal = (Number(rawQty) > 0 && Number(rawHarga) > 0) ? Number(rawQty) * Number(rawHarga) : 0;

            return (
              <Card key={cat.id} className="bg-white border border-slate-200 shadow-sm p-6 mb-6">
                <CardHeader className="border-b border-slate-100 pb-4">
                  <CardTitle className="text-base font-semibold text-slate-800 flex items-center justify-between gap-2">
                    {editingCategoryId === cat.id ? (
                      <div className="flex items-center gap-2 w-full">
                        <Input value={editCategoryName} onChange={(e) => setEditCategoryName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveCategory(cat.id)} className="h-8" autoFocus />
                        <Button size="sm" className="h-8 bg-emerald-800 text-white" onClick={() => handleSaveCategory(cat.id)}>Simpan</Button>
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => { setEditingCategoryId(null); setEditCategoryName(''); }}>Batal</Button>
                      </div>
                    ) : (
                      <><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />{cat.name}</div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditingCategoryId(cat.id); setEditCategoryName(cat.name); }} className="p-1.5 text-slate-400 hover:text-emerald-600"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => handleDeleteCategory(cat.id)} className="p-1.5 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div></>
                    )}
                  </CardTitle>
                </CardHeader>

                <CardContent className="pt-4 space-y-1">
                  <div className="grid grid-cols-12 gap-4 mb-2 text-sm font-medium text-slate-500 border-b pb-2">
                    <div className="col-span-5">Deskripsi Item</div>
                    <div className="col-span-2 text-center">Qty</div>
                    <div className="col-span-2 text-right">Harga Satuan</div>
                    <div className="col-span-2 text-right">Subtotal</div>
                    <div className="col-span-1 text-right">Aksi</div>
                  </div>

                  {cat.items.map((item, idx) => (
                    <div key={item.id} className={`grid grid-cols-12 gap-4 items-center py-2.5 text-sm ${idx < cat.items.length - 1 ? 'border-b border-slate-50' : ''}`}>
                      <div className="col-span-5 text-slate-700 font-medium truncate">{item.name}</div>
                      <div className="col-span-2 text-center text-slate-500">{item.qty ? formatRibuan(String(item.qty)) : "-"}</div>
                      <div className="col-span-2 text-right text-slate-500">{item.hargaSatuan ? formatRp(Number(item.hargaSatuan)) : "-"}</div>
                      <div className="col-span-2 text-right font-semibold text-slate-800">{formatRp(item.estimatedCost)}</div>
                      <div className="col-span-1 flex justify-end">
                        <button onClick={() => handleDeleteItem(item.id)} className="text-slate-300 hover:text-red-500 p-1.5"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}

                  {/* Form Input */}
                  <div className="grid grid-cols-12 gap-2 items-center pt-3 mt-1 border-t border-dashed border-slate-200">
                    <div className="col-span-4"><Input placeholder="Nama Item" value={form?.name || ''} onChange={(e) => setItemFormField(cat.id, 'name', e.target.value)} className="h-8" /></div>
                    <div className="col-span-2"><Input placeholder="Qty" value={form?.qty ? formatRibuan(form.qty) : ''} onChange={(e) => setItemFormField(cat.id, 'qty', e.target.value.replace(/\D/g, ''))} className="h-8 text-center" /></div>
                    <div className="col-span-3"><Input placeholder="Harga Satuan" value={form?.hargaSatuan ? formatRibuan(form.hargaSatuan) : ''} onChange={(e) => setItemFormField(cat.id, 'hargaSatuan', e.target.value.replace(/\D/g, ''))} className="h-8 text-right" /></div>
                    <div className="col-span-3 flex justify-end">
                      <Button size="sm" onClick={() => handleAddItem(cat.id)} disabled={saving || !form?.name?.trim() || Number(rawQty) <= 0 || Number(rawHarga) <= 0} className="h-8 px-3 bg-emerald-800 text-white">Tambah</Button>
                    </div>
                  </div>
                  {previewTotal > 0 && <p className="text-xs text-emerald-700 font-medium text-right pt-1">Subtotal: {formatRp(previewTotal)}</p>}
                </CardContent>
              </Card>
            )
          })}

          <Card className="bg-white border border-dashed border-slate-300 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-600 flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-emerald-700" /> Buat Kategori Baru
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Input
                  placeholder="Nama kategori (misal: Sound, Dekorasi, Katering…)"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  className="text-sm border-slate-200"
                />
                <Button
                  onClick={handleAddCategory}
                  disabled={saving || !newCategoryName.trim()}
                  className="shrink-0 bg-emerald-800 hover:bg-emerald-900 text-white font-semibold px-5"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><PlusCircle className="w-4 h-4 mr-1.5" /> Buat Kategori</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}