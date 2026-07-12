'use client';
import { useState, useEffect } from 'react';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  status: string;
  role?: 'promotor' | 'crew' | 'scanner';
  plan: 'starter' | 'pro';
  proEventId?: string | null;
  proExpiresAt?: string | null;
  proStartedAt?: string | null;
  isAdmin?: boolean;
}

const getToken = () =>
  typeof window !== 'undefined' ? (localStorage.getItem('token') ?? '') : '';

export function useUser() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (data.success && data.data) {
          setUser(data.data);
          localStorage.setItem('user_plan', data.data.plan);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isPro = user?.plan === 'pro';

  const daysUntilExpiry = user?.proExpiresAt
    ? Math.ceil((new Date(user.proExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const isProExpiringSoon = isPro && daysUntilExpiry !== null && daysUntilExpiry <= 7;

  const isAdmin = !!user?.isAdmin;

  return { user, loading, isPro, daysUntilExpiry, isProExpiringSoon, isAdmin };
}
