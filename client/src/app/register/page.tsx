'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CheckCircle, MessageCircle, Mail } from 'lucide-react';

export default function RegisterPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
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
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok || res.status === 201) {
        setIsSuccess(true);
      } else {
        setErrorMsg(data.message || 'Email mungkin sudah dipakai.');
      }
    } catch {
      setErrorMsg('Gagal menghubungi server. Coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
        <Card className="w-full max-w-sm shadow-lg border-slate-200 text-center">
          <CardContent className="pt-8 pb-8 space-y-5">
            <div className="flex justify-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle className="size-8 text-emerald-700" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Pendaftaran Berhasil!</h2>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                Akun kamu sedang direview oleh admin. Kamu akan mendapat konfirmasi setelah akun diaktifkan.
              </p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-left space-y-3">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Hubungi Admin</p>
              <a
                href="https://wa.me/6281234567890?text=Halo%20admin%2C%20saya%20baru%20daftar%20nexEvent%20dengan%20email%20"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
              >
                <MessageCircle className="size-4 shrink-0" />
                Chat via WhatsApp
              </a>
              <a
                href="mailto:denydiatmika72@gmail.com?subject=Aktivasi%20Akun%20nexEvent"
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <Mail className="size-4 shrink-0" />
                denydiatmika72@gmail.com
              </a>
            </div>
            <Link
              href="/login"
              className="block text-sm font-medium text-emerald-700 hover:underline"
            >
              Kembali ke Login
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

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

            {errorMsg && (
              <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                {errorMsg}
              </p>
            )}

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
