'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';

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
    try {
      await signup(email, password);
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Sign up</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded border border-gray-300 px-3 py-2"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="rounded border border-gray-300 px-3 py-2"
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button type="submit" className="rounded bg-black px-4 py-2 text-white">
          Sign up
        </button>
      </form>
      <p className="text-sm text-gray-600">
        Have an account?{' '}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
