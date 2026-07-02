'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

// ─── Promotor/Crew Login ───────────────────────────────────────────────────────

function PromoterLoginForm() {
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
        localStorage.setItem('user_is_admin', data.data?.isAdmin ? 'true' : 'false');
        router.push(data.data?.role === 'crew' ? '/field' : '/dashboard');
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
    <form onSubmit={handleLogin} className="space-y-4">
      <div className="space-y-2">
        <Label>Email</Label>
        <Input type="email" placeholder="test@nexevent.com" onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>Password</Label>
        <Input type="password" placeholder="••••••••" onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {errorMsg && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{errorMsg}</p>
      )}
      <Button type="submit" disabled={isLoading} className="w-full bg-emerald-800 text-white hover:bg-emerald-900">
        {isLoading ? 'Memeriksa...' : 'Masuk'}
      </Button>
    </form>
  );
}

// ─── Sponsor Login (2 tabs) ────────────────────────────────────────────────────

function SponsorLoginForm() {
  const [tab, setTab] = useState<'code' | 'account'>('code');
  // Tab 1 — kode undangan
  const [code, setCode] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState('');
  // Tab 2 — akun sponsor
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [accLoading, setAccLoading] = useState(false);
  const [accError, setAccError] = useState('');
  const router = useRouter();

  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    setCodeLoading(true);
    setCodeError('');
    try {
      const res = await fetch('/api/sponsor/codes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        router.push('/sponsor-portal');
      } else {
        setCodeError(data.message || 'Kode tidak valid atau sudah digunakan.');
      }
    } catch {
      setCodeError('Gagal menghubungi server. Coba lagi.');
    } finally {
      setCodeLoading(false);
    }
  }

  async function handleAccount(e: React.FormEvent) {
    e.preventDefault();
    setAccLoading(true);
    setAccError('');
    try {
      const res = await fetch('/api/sponsor/accounts/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // Simpan session ke sessionStorage supaya sponsor-dashboard langsung aktif
        sessionStorage.setItem('sponsor_session', JSON.stringify(data.data));
        router.push('/sponsor-dashboard');
      } else {
        setAccError(data.message || 'Username/email atau password salah.');
      }
    } catch {
      setAccError('Gagal menghubungi server. Coba lagi.');
    } finally {
      setAccLoading(false);
    }
  }

  return (
    <div>
      {/* Tabs */}
      <div className="mb-5 flex rounded-lg border border-slate-200 bg-slate-50 p-1">
        <button
          type="button"
          onClick={() => setTab('code')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
            tab === 'code' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Kode Undangan
        </button>
        <button
          type="button"
          onClick={() => setTab('account')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
            tab === 'account' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Sudah Punya Akun
        </button>
      </div>

      {tab === 'code' ? (
        <form onSubmit={handleCode} className="space-y-4">
          <div className="space-y-2">
            <Label>Kode Undangan dari Promotor</Label>
            <Input
              placeholder="SPN-XXXX-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="font-mono uppercase tracking-widest"
              required
            />
            <p className="text-xs text-slate-400">
              Masukkan kode yang diberikan oleh event organizer Anda.
            </p>
          </div>
          {codeError && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{codeError}</p>
          )}
          <Button type="submit" disabled={codeLoading} className="w-full bg-emerald-800 text-white hover:bg-emerald-900">
            {codeLoading ? 'Memvalidasi...' : 'Akses Portal Sponsor'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleAccount} className="space-y-4">
          <div className="space-y-2">
            <Label>Username atau Email</Label>
            <Input
              placeholder="username atau email@perusahaan.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {accError && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{accError}</p>
          )}
          <Button type="submit" disabled={accLoading} className="w-full bg-emerald-800 text-white hover:bg-emerald-900">
            {accLoading ? 'Memeriksa...' : 'Masuk ke Sponsor Dashboard'}
          </Button>
          <p className="text-center text-xs text-slate-400">
            Kredensial dikirim ke email Anda saat deal disetujui.
          </p>
        </form>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [isSponsorMode, setIsSponsorMode] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsSponsorMode(params.get('role') === 'sponsor');
  }, []);

  if (isSponsorMode) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
        <Card className="w-full max-w-sm shadow-lg border-slate-200">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full border border-emerald-800/30 bg-emerald-50">
              <span className="text-base font-semibold text-emerald-800">S</span>
            </div>
            <CardTitle className="text-xl font-bold text-slate-900">Portal Sponsor</CardTitle>
            <CardDescription>Akses sponsor deal Anda.</CardDescription>
          </CardHeader>
          <CardContent>
            <SponsorLoginForm />
            <p className="mt-5 text-center text-xs text-slate-400">
              Bukan sponsor?{' '}
              <Link href="/login" className="font-medium text-emerald-700 hover:underline">
                Login sebagai Promotor
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
      <Card className="w-full max-w-sm shadow-lg border-slate-200">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-slate-900">Masuk Workspace</CardTitle>
          <CardDescription>Masukkan email dan password Anda.</CardDescription>
        </CardHeader>
        <CardContent>
          <PromoterLoginForm />
          <p className="mt-6 text-center text-sm text-slate-500">
            Belum mendaftarkan EO Anda?{' '}
            <Link href="/register" className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline">
              Daftar Akun Baru
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
