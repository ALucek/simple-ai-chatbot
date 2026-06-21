'use client';

import { useAuth } from '@/lib/auth-context';

export default function Home() {
  const { user, logout } = useAuth();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">simple-ai-chatbot</h1>
      <p className="text-sm text-gray-600">Signed in as {user?.email}</p>
      <button
        onClick={() => logout()}
        className="rounded border border-black px-4 py-2 text-sm hover:bg-black hover:text-white"
      >
        Log out
      </button>
    </main>
  );
}
