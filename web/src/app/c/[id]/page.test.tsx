import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConversationPage from './page';
import * as messagesHook from '@/lib/use-messages';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: '5' }) }));
vi.mock('@/lib/use-messages');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ConversationPage', () => {
  it('renders the message history', () => {
    vi.mocked(messagesHook.useMessages).mockReturnValue({
      messages: [
        { id: 1, role: 'user', content: 'Hi', created_at: 't' },
        { id: 2, role: 'assistant', content: 'Hello!', created_at: 't' },
      ],
      loading: false,
      error: null,
      notFound: false,
      send: vi.fn(),
      sending: false,
    });
    render(<ConversationPage />);
    expect(screen.getByText('Hi')).toBeInTheDocument();
    expect(screen.getByText('Hello!')).toBeInTheDocument();
  });

  it('shows the empty state', () => {
    vi.mocked(messagesHook.useMessages).mockReturnValue({
      messages: [],
      loading: false,
      error: null,
      notFound: false,
      send: vi.fn(),
      sending: false,
    });
    render(<ConversationPage />);
    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });

  it('shows not-found', () => {
    vi.mocked(messagesHook.useMessages).mockReturnValue({
      messages: [],
      loading: false,
      error: null,
      notFound: true,
      send: vi.fn(),
      sending: false,
    });
    render(<ConversationPage />);
    expect(screen.getByText('Conversation not found')).toBeInTheDocument();
  });
});
