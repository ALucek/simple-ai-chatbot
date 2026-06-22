'use client';

import { useRouter } from 'next/navigation';
import { useConversationsContext } from '@/lib/conversations-context';
import { useAuth } from '@/lib/auth-context';
import { ConversationItem } from './conversation-item';

export function Sidebar() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { conversations, loading, error, create, rename, remove } =
    useConversationsContext();

  async function onNew() {
    const convo = await create();
    router.push(`/c/${convo.id}`);
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r border-gray-200">
      <div className="border-b border-gray-200 p-2">
        <button
          onClick={onNew}
          className="w-full rounded bg-black px-3 py-2 text-sm text-white"
        >
          New conversation
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-1">
        {loading && <p className="p-2 text-sm text-gray-500">Loading…</p>}
        {error && <p className="p-2 text-sm text-red-600">{error}</p>}
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
      </nav>

      <div className="border-t border-gray-200 p-2 text-sm">
        <p className="truncate text-gray-600">{user?.email}</p>
        <button onClick={() => logout()} className="mt-1 underline">
          Log out
        </button>
      </div>
    </aside>
  );
}
