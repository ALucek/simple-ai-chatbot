import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationItem } from './conversation-item';
import { ToastProvider } from '@/lib/toast-context';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: '1' }),
}));

const convo = { id: 2, title: 'Hello', created_at: 't', updated_at: 't' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ConversationItem', () => {
  it('renames on Enter', async () => {
    const rename = vi.fn().mockResolvedValue(undefined);
    render(
      <ConversationItem
        conversation={convo}
        rename={rename}
        remove={vi.fn()}
      />,
      { wrapper },
    );
    await userEvent.click(screen.getByLabelText('Rename'));
    const input = screen.getByLabelText('Conversation title');
    await userEvent.clear(input);
    await userEvent.type(input, 'Renamed{Enter}');
    expect(rename).toHaveBeenCalledWith(2, 'Renamed');
  });

  it('cancels rename on Escape', async () => {
    const rename = vi.fn();
    render(
      <ConversationItem
        conversation={convo}
        rename={rename}
        remove={vi.fn()}
      />,
      { wrapper },
    );
    await userEvent.click(screen.getByLabelText('Rename'));
    await userEvent.type(
      screen.getByLabelText('Conversation title'),
      'X{Escape}',
    );
    expect(rename).not.toHaveBeenCalled();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('deletes after inline confirm', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    render(
      <ConversationItem
        conversation={convo}
        rename={vi.fn()}
        remove={remove}
      />,
      { wrapper },
    );
    await userEvent.click(screen.getByLabelText('Delete'));
    await userEvent.click(screen.getByText('yes'));
    expect(remove).toHaveBeenCalledWith(2);
  });

  it('navigates home when deleting the open conversation', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const open = { id: 1, title: 'Open', created_at: 't', updated_at: 't' };
    render(
      <ConversationItem conversation={open} rename={vi.fn()} remove={remove} />,
      { wrapper },
    );
    await userEvent.click(screen.getByLabelText('Delete'));
    await userEvent.click(screen.getByText('yes'));
    expect(remove).toHaveBeenCalledWith(1);
    expect(push).toHaveBeenCalledWith('/');
  });
});

it('toasts when delete fails', async () => {
  const { Toaster } = await import('./toaster');
  const remove = vi.fn().mockRejectedValue(new Error('nope'));
  render(
    <>
      <ConversationItem conversation={convo} rename={vi.fn()} remove={remove} />
      <Toaster />
    </>,
    { wrapper },
  );
  await userEvent.click(screen.getByLabelText('Delete'));
  await userEvent.click(screen.getByText('yes'));
  expect(
    await screen.findByText('Could not delete conversation'),
  ).toBeInTheDocument();
});
