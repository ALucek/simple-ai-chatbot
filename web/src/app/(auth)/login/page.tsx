'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';
import { Wordmark } from '@/components/wordmark';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

type CodeClient = { requestCode: () => void };

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient: (cfg: {
            client_id: string;
            scope: string;
            ux_mode: 'popup';
            callback: (resp: { code: string }) => void;
          }) => CodeClient;
        };
      };
    };
  }
}

function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { status, loginWithGoogle } = useAuth();
  const router = useRouter();
  const client = useRef<CodeClient | null>(null);
  const initialized = useRef(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (status === 'authed') router.replace('/');
  }, [status, router]);

  useEffect(() => {
    // GSI must initialize once; guard against StrictMode and provider re-renders.
    if (initialized.current) return;
    initialized.current = true;
    function init() {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      if (!window.google || !clientId) return;
      client.current = window.google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: 'openid email profile',
        ux_mode: 'popup',
        callback: async ({ code }) => {
          setError('');
          setLoading(true);
          try {
            await loginWithGoogle(code);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Sign-in failed');
            setLoading(false);
          }
        },
      });
      setReady(true);
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
          <button
            type="button"
            data-testid="google-signin"
            onClick={() => client.current?.requestCode()}
            disabled={!ready || loading}
            className="border-border bg-surface text-fg hover:bg-surface-muted flex h-10 w-[280px] items-center justify-center gap-2.5 rounded-[var(--radius)] border text-sm transition-colors disabled:opacity-50"
          >
            <GoogleG className="h-4 w-4" />
            Sign in with Google
          </button>
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
