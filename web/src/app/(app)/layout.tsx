'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Sidebar } from '@/components/sidebar';
import { Button } from '@/components/ui/button';
import { ConversationsProvider } from '@/lib/conversations-context';
import { UsageProvider } from '@/lib/usage-context';
import { MessagesProvider } from '@/lib/messages-context';
import { useSidebarCollapsed } from '@/lib/use-sidebar-collapsed';
import { useMobileDrawer } from '@/lib/use-mobile-drawer';
import { useViewportHeight } from '@/lib/use-viewport-height';
import { RemoveScroll } from 'react-remove-scroll';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const { collapsed, toggle } = useSidebarCollapsed();
  const { open, toggle: toggleMobile, close: closeMobile } = useMobileDrawer();
  useViewportHeight();

  useEffect(() => {
    if (status === 'anon') router.replace('/login');
  }, [status, router]);

  if (status !== 'authed') return null;
  return (
    <ConversationsProvider>
      <UsageProvider>
        <MessagesProvider>
          <RemoveScroll>
            <div
              data-testid="app-shell"
              className="bg-bg relative flex h-[var(--app-height,100dvh)]"
            >
              {/* Desktop toggle: collapses the push column (md and up). */}
              <Button
                variant="ghost"
                size="sm"
                onClick={toggle}
                aria-label="Toggle sidebar"
                aria-expanded={!collapsed}
                className="absolute top-3 left-3 z-20 hidden h-9 w-9 items-center justify-center p-0 text-lg leading-none md:flex"
              >
                ☰
              </Button>
              {/* Mobile toggle: opens the overlay drawer (below md). */}
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleMobile}
                aria-label="Toggle menu"
                aria-expanded={open}
                className="border-border bg-surface absolute top-3 left-3 z-40 flex h-9 w-9 items-center justify-center border p-0 text-lg leading-none md:hidden"
              >
                ☰
              </Button>
              {/* Backdrop: mobile only; fades in/out with the drawer. */}
              <div
                data-testid="backdrop"
                onClick={closeMobile}
                aria-hidden={!open}
                className={`fixed inset-x-0 top-0 z-30 h-[var(--app-height,100dvh)] bg-black/40 transition-opacity duration-200 md:hidden ${
                  open ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
              />
              {/* Sidebar: fixed overlay on mobile, push column at md+. */}
              <div
                className={`fixed top-0 left-0 z-30 h-[var(--app-height,100dvh)] w-64 transition-transform duration-200 md:static md:z-auto md:translate-x-0 md:overflow-hidden md:transition-[width] ${
                  open ? 'translate-x-0' : '-translate-x-full'
                } ${collapsed ? 'md:w-0' : 'md:w-64'}`}
              >
                <Sidebar />
              </div>
              <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
            </div>
          </RemoveScroll>
        </MessagesProvider>
      </UsageProvider>
    </ConversationsProvider>
  );
}
