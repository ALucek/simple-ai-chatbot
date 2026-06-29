import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from './page';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const sendNew = vi.fn();
vi.mock('@/lib/messages-context', () => ({ useSendNew: () => sendNew }));

const toast = vi.fn();
vi.mock('@/lib/toast-context', () => ({ useToast: () => ({ toast }) }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Home (draft new chat)', () => {
  it('shows the prompt and the composer', () => {
    render(<Home />);
    expect(screen.getByText('Type a message below')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('first message creates a conversation and routes to it', async () => {
    sendNew.mockResolvedValue(42);
    render(<Home />);
    await userEvent.type(screen.getByRole('textbox'), 'hello{Enter}');
    expect(sendNew).toHaveBeenCalledWith('hello');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/c/42'));
  });

  it('toasts and stays put when creation fails', async () => {
    sendNew.mockRejectedValue(new Error('nope'));
    render(<Home />);
    await userEvent.type(screen.getByRole('textbox'), 'hi{Enter}');
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('Could not create conversation'),
    );
    expect(replace).not.toHaveBeenCalled();
  });
});
