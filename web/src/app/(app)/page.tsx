'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Composer } from '@/components/composer';
import { useSendNew } from '@/lib/messages-context';
import { useToast } from '@/lib/toast-context';

export default function Home() {
  const router = useRouter();
  const sendNew = useSendNew();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  async function onSend(text: string) {
    setSending(true);
    try {
      const id = await sendNew(text);
      router.replace(`/c/${id}`);
    } catch {
      toast('Could not create conversation');
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted text-sm">Type a message below</p>
      </div>
      <Composer onSend={onSend} onStop={() => {}} sending={sending} />
    </div>
  );
}
