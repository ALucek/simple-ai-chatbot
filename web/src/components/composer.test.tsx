import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Composer } from './composer';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Composer', () => {
  it('Enter submits the trimmed text and clears the box', async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} />);
    const box = screen.getByRole('textbox');
    await userEvent.type(box, 'hello{Enter}');
    expect(onSend).toHaveBeenCalledWith('hello');
    expect(box).toHaveValue('');
  });

  it('Shift+Enter inserts a newline and does not submit', async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} />);
    const box = screen.getByRole('textbox');
    await userEvent.type(box, 'a{Shift>}{Enter}{/Shift}b');
    expect(onSend).not.toHaveBeenCalled();
    expect(box).toHaveValue('a\nb');
  });

  it('does not submit empty or whitespace-only input', async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} disabled={false} />);
    const box = screen.getByRole('textbox');
    await userEvent.type(box, '   {Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables the controls when disabled', () => {
    render(<Composer onSend={vi.fn()} disabled={true} />);
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });
});
