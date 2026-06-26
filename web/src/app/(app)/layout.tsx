'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Sidebar } from '@/components/sidebar';
import { ConversationsProvider } from '@/lib/conversations-context';
import { MessagesProvider } from '@/lib/messages-context';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anon') router.replace('/login');
  }, [status, router]);

  if (status !== 'authed') return null;
  return (
    <ConversationsProvider>
      <MessagesProvider>
        <div className="bg-bg flex h-screen">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </MessagesProvider>
    </ConversationsProvider>
  );
}
