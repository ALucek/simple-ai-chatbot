'use client';

import { useRouter } from 'next/navigation';
import { useConversationsContext } from '@/lib/conversations-context';
import { useAuth } from '@/lib/auth-context';
import { ConversationItem } from './conversation-item';
import { Button } from '@/components/ui/button';
import { Skeleton } from './ui/skeleton';
import { UsageMeter } from './usage-meter';
import { useToast } from '@/lib/toast-context';

export function Sidebar() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const {
    conversations,
    loading,
    loadingMore,
    error,
    loadMore,
    create,
    rename,
    remove,
  } = useConversationsContext();

  const { toast } = useToast();

  async function onNew() {
    try {
      const convo = await create();
      router.push(`/c/${convo.id}`);
    } catch {
      toast('Could not create conversation');
    }
  }

  // Fetch the next page when scrolled near the bottom of the list.
  function onScroll(e: React.UIEvent<HTMLElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) loadMore();
  }

  return (
    <aside className="border-border bg-surface flex h-full w-64 flex-col border-r">
      <div className="border-border border-b p-3 pl-[52px]">
        <Button onClick={onNew} className="w-full">
          New conversation
        </Button>
      </div>

      <nav
        onScroll={onScroll}
        className="flex-1 space-y-0.5 overflow-y-auto p-1.5"
      >
        {loading && (
          <div className="space-y-1 p-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        )}
        {error && <p className="text-danger p-2 text-sm">{error}</p>}
        {!loading &&
          !error &&
          conversations.map((c) => (
            <ConversationItem
              key={c.id}
              conversation={c}
              rename={rename}
              remove={remove}
            />
          ))}
        {loadingMore && (
          <p className="text-subtle p-2 text-center text-xs">loading…</p>
        )}
      </nav>

      <div className="border-border flex h-[var(--bottombar-h)] items-center gap-2 border-t px-3 text-sm">
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p className="text-muted truncate">{user?.email}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout()}
            className="mt-1 self-start px-0"
          >
            Log out
          </Button>
        </div>
        <UsageMeter />
      </div>
    </aside>
  );
}
