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
  const router = useRouter(); 

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); 
    setIsLoading(true);

    try {
      const res = await fetch('${process.env.NEXT_PUBLIC_API_URL}/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.ok && data.token) {
        localStorage.setItem('token', data.token);
        router.push('/dashboard');
      } else {
        alert('❌ ' + (data.message || 'Gagal Login'));
      }
    } catch (error) {
      alert('⚠️ Gagal menghubungi server!');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
      <Card className="w-full max-w-sm shadow-lg border-slate-200">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-slate-900">Masuk Workspace</CardTitle>
          <CardDescription>Masukkan kredensial promotor Anda.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input 
                type="email" 
                placeholder="test@habitat.com" 
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
            <Button type="submit" disabled={isLoading} className="w-full bg-emerald-800 text-white hover:bg-emerald-900">
              {isLoading ? "Memeriksa..." : "Masuk"}
            </Button>
          </form>

          {/* LINK MENUJU PENDAFTARAN */}
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