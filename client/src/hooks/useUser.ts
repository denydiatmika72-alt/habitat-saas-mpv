'use client';
import { useState, useEffect } from 'react';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  status: string;
  plan: 'starter' | 'pro';
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

  return { user, loading, isPro };
}
