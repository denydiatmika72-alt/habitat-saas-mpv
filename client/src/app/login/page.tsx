'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.ok && data.token) {
        localStorage.setItem('token', data.token);
        if (data.data?.plan) localStorage.setItem('user_plan', data.data.plan);
        if (data.data?.role) localStorage.setItem('user_role', data.data.role);

        if (data.data?.role === 'crew') {
          router.push('/field');
        } else {
          router.push('/dashboard');
        }
      } else {
        setErrorMsg(data.message || 'Email atau password salah.');
      }
    } catch {
      setErrorMsg('Gagal menghubungi server. Coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
      <Card className="w-full max-w-sm shadow-lg border-slate-200">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-slate-900">Masuk Workspace</CardTitle>
          <CardDescription>Masukkan email dan password Anda.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="test@nexevent.com"
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                placeholder="••••••••"
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {errorMsg && (
              <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                {errorMsg}
              </p>
            )}

            <Button type="submit" disabled={isLoading} className="w-full bg-emerald-800 text-white hover:bg-emerald-900">
              {isLoading ? "Memeriksa..." : "Masuk"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Belum mendaftarkan EO Anda?{" "}
            <Link href="/register" className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline">
              Daftar Akun Baru
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
