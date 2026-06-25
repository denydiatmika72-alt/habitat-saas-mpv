'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react"; // Tambahan icon biar manis

export default function CreateEventPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    title: '',
    location: '',
    event_date: '',
    venue_capacity: '',
    target_profit: '',
    target_sponsorship: ''
  });

  const formatNumber = (val: string) => {
    const numericValue = val.replace(/\D/g, '');
    return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value.replace(/\D/g, '') });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    
    // Logika pengiriman data yang sangat ketat
    const payload = {
      title: formData.title,
      location: formData.location,
      event_date: formData.event_date,
      venue_capacity: parseInt(formData.venue_capacity) || 0,
      target_profit: parseFloat(formData.target_profit) || 0,
      target_sponsorship: parseFloat(formData.target_sponsorship) || 0
    };

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });
      
      const data = await res.json();

      if (res.status === 201 || res.ok) {
        alert('✅ Event berhasil dibuat!');
        router.push('/dashboard');
      } else {
        console.error("Backend Error:", data);
        alert('❌ Error: ' + (data.message || 'Gagal tersambung ke server'));
      }
    } catch (error) {
      console.error("Network Error:", error);
      alert('⚠️ Gagal terhubung ke server backend. Pastikan server port 5000 nyala.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-2xl mx-auto">
        {/* TOMBOL BACK UPDATE: router.back() dan print:hidden */}
        <button 
          onClick={() => router.back()} 
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-6 print:hidden transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali
        </button>

        <Card>
          <CardHeader>
            <CardTitle>Buat Event Baru</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Nama Event</Label>
                <Input name="title" onChange={handleChange} required />
              </div>
              <div>
                <Label>Lokasi</Label>
                <Input name="location" onChange={handleChange} required />
              </div>
              <div>
                <Label>Tanggal</Label>
                <Input name="event_date" type="date" onChange={handleChange} required />
              </div>
              <div>
                <Label>Kapasitas</Label>
                <Input 
                  name="venue_capacity" 
                  value={formatNumber(formData.venue_capacity)}
                  onChange={handleNumberChange} 
                  required 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Target Profit (Rp)</Label>
                  <Input 
                    name="target_profit" 
                    value={formatNumber(formData.target_profit)}
                    onChange={handleNumberChange} 
                    required 
                  />
                </div>
                <div>
                  <Label>Target Sponsor (Rp)</Label>
                  <Input 
                    name="target_sponsorship" 
                    value={formatNumber(formData.target_sponsorship)}
                    onChange={handleNumberChange} 
                    required 
                  />
                </div>
              </div>
              <Button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-800 text-white">
                Simpan Event
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}