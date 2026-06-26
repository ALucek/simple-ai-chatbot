import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageList } from './message-list';
import type { ChatMessage } from '@/lib/messages-context';

describe('MessageList markdown', () => {
  it('renders assistant markdown (bold, link, list)', () => {
    const msgs: ChatMessage[] = [
      {
        id: 1,
        role: 'assistant',
        content: '**bold** and [x](https://e.com)\n\n- a\n- b',
        created_at: '',
      },
    ];
    render(<MessageList messages={msgs} />);
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    const link = screen.getByRole('link', { name: 'x' });
    expect(link).toHaveAttribute('href', 'https://e.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
  });

  it('renders a user message as plain text, not markdown', () => {
    const msgs: ChatMessage[] = [
      { id: 1, role: 'user', content: '**not bold**', created_at: '' },
    ];
    render(<MessageList messages={msgs} />);
    expect(screen.getByText('**not bold**')).toBeInTheDocument();
    expect(screen.queryByRole('strong')).toBeNull();
  });

  it('neutralizes a javascript: link and raw HTML', () => {
    const msgs: ChatMessage[] = [
      {
        id: 1,
        role: 'assistant',
        content:
          '[click](javascript:alert(1))\n\n<img src=x onerror="alert(1)">',
        created_at: '',
      },
    ];
    render(<MessageList messages={msgs} />);
    const link = screen.queryByRole('link', { name: 'click' });
    if (link)
      expect(link.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
    // raw HTML is not parsed
    expect(document.querySelector('img')).toBeNull();
  });
});
