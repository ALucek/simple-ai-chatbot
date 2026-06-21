import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './page';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';

const replace = vi.fn();
const login = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/lib/auth-context');

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    status: 'anon',
    login,
    signup: vi.fn(),
    logout: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>);
});

describe('LoginPage', () => {
  it('submits credentials and redirects home on success', async () => {
    login.mockResolvedValue(undefined);
    render(<LoginPage />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.co');
    await userEvent.type(
      screen.getByPlaceholderText('Password'),
      'password123',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(login).toHaveBeenCalledWith('a@b.co', 'password123');
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('shows the server error message on failure', async () => {
    login.mockRejectedValue(new ApiError(401, 'invalid email or password'));
    render(<LoginPage />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.co');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'invalid email or password',
    );
  });
});
