import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConversationPage from './page';
import * as messagesHook from '@/lib/messages-context';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: '5' }) }));
vi.mock('@/lib/messages-context');

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
      stop: vi.fn(),
      sending: false,
      loadingOlder: false,
      hasMore: false,
      loadOlder: vi.fn(),
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
      stop: vi.fn(),
      sending: false,
      loadingOlder: false,
      hasMore: false,
      loadOlder: vi.fn(),
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
      stop: vi.fn(),
      sending: false,
      loadingOlder: false,
      hasMore: false,
      loadOlder: vi.fn(),
    });
    render(<ConversationPage />);
    expect(screen.getByText('Conversation not found')).toBeInTheDocument();
  });

  it('renders the composer alongside history', () => {
    vi.mocked(messagesHook.useMessages).mockReturnValue({
      messages: [{ id: 1, role: 'user', content: 'Hi', created_at: 't' }],
      loading: false,
      error: null,
      notFound: false,
      send: vi.fn(),
      stop: vi.fn(),
      sending: false,
      loadingOlder: false,
      hasMore: false,
      loadOlder: vi.fn(),
    });
    render(<ConversationPage />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('shows a caret on a streaming assistant message', () => {
    vi.mocked(messagesHook.useMessages).mockReturnValue({
      messages: [
        {
          id: -2,
          role: 'assistant',
          content: 'Hel',
          created_at: '',
          streaming: true,
        },
      ],
      loading: false,
      error: null,
      notFound: false,
      send: vi.fn(),
      stop: vi.fn(),
      sending: false,
      loadingOlder: false,
      hasMore: false,
      loadOlder: vi.fn(),
    });
    render(<ConversationPage />);
    // Markdown renders the content in its own element; the caret is a sibling node.
    expect(screen.getByText('Hel').parentElement).toHaveTextContent('Hel▍');
  });
});
