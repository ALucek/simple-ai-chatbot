'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';
import { Wordmark } from '@/components/wordmark';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string;
            callback: (r: { credential: string }) => void;
          }) => void;
          renderButton: (
            el: HTMLElement,
            opts: Record<string, unknown>,
          ) => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  const { status, loginWithGoogle } = useAuth();
  const router = useRouter();
  const mount = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === 'authed') router.replace('/');
  }, [status, router]);

  useEffect(() => {
    // GSI must initialize once; guard against StrictMode and provider re-renders.
    if (initialized.current) return;
    initialized.current = true;
    function init() {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      if (!window.google || !mount.current || !clientId) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          setError('');
          setLoading(true);
          try {
            await loginWithGoogle(credential);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Sign-in failed');
            setLoading(false);
          }
        },
      });
      mount.current.innerHTML = '';
      window.google.accounts.id.renderButton(mount.current, {
        theme: 'outline',
        size: 'large',
      });
    }
    if (window.google) {
      init();
      return;
    }
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.onload = init;
    document.body.appendChild(s);
  }, [loginWithGoogle]);

  return (
    <main className="bg-bg flex min-h-dvh items-center justify-center p-6">
      <div className="flex flex-col items-center gap-6">
        <Wordmark />
        <div className="border-border bg-surface flex w-full max-w-sm flex-col items-center gap-4 rounded-[var(--radius)] border p-8">
          {loading && (
            <p className="text-subtle text-xs tracking-[0.16em] uppercase">
              Signing in…
            </p>
          )}
          <div data-testid="google-signin" ref={mount} />
          {error && (
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          )}
          <div className="bg-border h-px w-full" />
          <p className="text-subtle text-center text-xs leading-relaxed">
            By continuing you agree to the{' '}
            <Link
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Terms
            </Link>{' '}
            &amp;{' '}
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
        <p className="text-subtle text-xs">
          Made by{' '}
          <a
            href="https://lucek.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Adam Lucek
          </a>
        </p>
      </div>
    </main>
  );
}
