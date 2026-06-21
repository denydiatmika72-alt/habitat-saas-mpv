'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    company_name: '',
    email: '',
    password: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const res = await fetch('${process.env.NEXT_PUBLIC_API_URL}/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      const data = await res.json();
      
      if (res.ok || res.status === 201) {
        alert('🎉 Pendaftaran Berhasil! Silakan Login.');
        router.push('/login');
      } else {
        alert('❌ Gagal Daftar: ' + (data.message || 'Email mungkin sudah dipakai.'));
      }
    } catch (error) {
      alert('⚠️ Gagal menghubungi server backend.');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
      <Card className="w-full max-w-sm shadow-lg border-slate-200">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-slate-900">Daftar Akun Baru</CardTitle>
          <CardDescription>Buat workspace untuk EO / Promotor Anda.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label>Nama Lengkap</Label>
              <Input 
                name="name" 
                placeholder="Misal: Budi Santoso" 
                onChange={handleChange} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label>Nama Promotor / EO</Label>
              <Input 
                name="company_name" 
                placeholder="Misal: Live Nation Indonesia" 
                onChange={handleChange} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label>Email Kerja</Label>
              <Input 
                name="email" 
                type="email" 
                placeholder="promotor@event.com" 
                onChange={handleChange} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input 
                name="password" 
                type="password" 
                placeholder="Minimal 6 karakter"
                onChange={handleChange} 
                required 
              />
            </div>
            <Button type="submit" disabled={isLoading} className="w-full bg-emerald-800 text-white hover:bg-emerald-900 mt-2">
              {isLoading ? "Memproses..." : "Daftar Sekarang"}
            </Button>
            
            <p className="text-sm text-center text-slate-500 mt-4 pt-2">
              Sudah punya akun?{" "}
              <Link href="/login" className="font-semibold text-emerald-700 hover:underline">
                Login di sini
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}