'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Wordmark } from '@/components/wordmark';

export default function SignupPage() {
  const { status, signup } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'authed') router.replace('/');
  }, [status, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError(!email.trim() ? 'Email is required' : 'Password is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email');
      return;
    }
    try {
      await signup(email, password);
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  }

  return (
    <main className="bg-bg flex min-h-screen items-center justify-center p-6">
      <div className="flex flex-col items-center gap-6">
        <Wordmark />
        <div className="border-border bg-surface w-full max-w-sm rounded-[var(--radius)] border p-8">
          <h1 className="text-fg-strong mb-6 text-xl">Sign up</h1>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <p role="alert" className="text-danger text-sm">
                {error}
              </p>
            )}
            <Button type="submit">Sign up</Button>
          </form>
          <p className="text-muted mt-4 text-sm">
            Have an account?{' '}
            <Link href="/login" className="text-fg-strong underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
