'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import type { Conversation } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/lib/toast-context';

interface Props {
  conversation: Conversation;
  rename: (id: number, title: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

export function ConversationItem({ conversation, rename, remove }: Props) {
  const router = useRouter();
  const params = useParams();
  const isOpen = String(params.id) === String(conversation.id);

  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(conversation.title);

  const { toast } = useToast();

  function cancelEdit() {
    setDraft(conversation.title);
    setEditing(false);
  }

  async function saveRename() {
    const title = draft.trim();
    if (title && title !== conversation.title) {
      try {
        await rename(conversation.id, title);
      } catch {
        toast('Could not rename conversation');
        cancelEdit();
        return;
      }
    }
    setEditing(false);
  }

  async function confirmDelete() {
    try {
      await remove(conversation.id);
    } catch {
      toast('Could not delete conversation');
      setConfirming(false);
      return;
    }
    if (isOpen) router.push('/');
  }

  if (editing) {
    return (
      <Input
        autoFocus
        aria-label="Conversation title"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={cancelEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') saveRename();
          if (e.key === 'Escape') cancelEdit();
        }}
        className="px-2 py-1"
      />
    );
  }

  return (
    <div
      className={`group hover:bg-surface-muted flex items-center gap-1 rounded-[--radius] px-2 py-1 ${
        isOpen ? 'bg-surface-muted' : ''
      }`}
    >
      <Link
        href={`/c/${conversation.id}`}
        className={`flex-1 truncate text-sm ${isOpen ? 'text-fg font-semibold' : 'text-muted'}`}
      >
        {conversation.title || 'New conversation'}
      </Link>
      {confirming ? (
        <span className="text-muted flex items-center gap-1 text-xs">
          Delete?
          <Button variant="ghost" size="sm" onClick={confirmDelete}>
            yes
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(false)}
          >
            no
          </Button>
        </span>
      ) : (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            aria-label="Rename"
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(true)}
            aria-label="Delete"
          >
            Delete
          </Button>
        </>
      )}
    </div>
  );
}
