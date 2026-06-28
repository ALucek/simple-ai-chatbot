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
    render(<Composer onSend={onSend} onStop={vi.fn()} sending={false} />);
    const box = screen.getByRole('textbox');
    await userEvent.type(box, 'hello{Enter}');
    expect(onSend).toHaveBeenCalledWith('hello');
    expect(box).toHaveValue('');
  });

  it('Shift+Enter inserts a newline and does not submit', async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} onStop={vi.fn()} sending={false} />);
    const box = screen.getByRole('textbox');
    await userEvent.type(box, 'a{Shift>}{Enter}{/Shift}b');
    expect(onSend).not.toHaveBeenCalled();
    expect(box).toHaveValue('a\nb');
  });

  it('does not submit empty or whitespace-only input', async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} onStop={vi.fn()} sending={false} />);
    const box = screen.getByRole('textbox');
    await userEvent.type(box, '   {Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('renders a 16px input on mobile and reserves the safe-area inset', () => {
    render(<Composer onSend={vi.fn()} onStop={vi.fn()} sending={false} />);
    const box = screen.getByRole('textbox');
    expect(box.className).toContain('text-base');
    expect(box.className).toContain('sm:text-sm');
    const bar = box.closest('.border-t') as HTMLElement;
    expect(bar.className).toContain('safe-area-inset-bottom');
  });

  it('shows Stop while sending and calls onStop', async () => {
    const onStop = vi.fn();
    render(<Composer onSend={vi.fn()} onStop={onStop} sending={true} />);
    expect(screen.getByRole('textbox')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /stop/i }));
    expect(onStop).toHaveBeenCalled();
  });
});
