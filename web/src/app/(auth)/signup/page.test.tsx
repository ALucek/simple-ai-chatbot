import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SignupPage from './page';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';

const replace = vi.fn();
const signup = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/lib/auth-context');

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    status: 'anon',
    login: vi.fn(),
    signup,
    logout: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>);
});

describe('SignupPage', () => {
  it('submits credentials and redirects home on success', async () => {
    signup.mockResolvedValue(undefined);
    render(<SignupPage />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.co');
    await userEvent.type(
      screen.getByPlaceholderText('Password'),
      'password123',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    expect(signup).toHaveBeenCalledWith('a@b.co', 'password123');
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('shows the server error message on failure', async () => {
    signup.mockRejectedValue(new ApiError(409, 'email already registered'));
    render(<SignupPage />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.co');
    await userEvent.type(
      screen.getByPlaceholderText('Password'),
      'password123',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'email already registered',
    );
  });

  it('shows an inline error and does not submit when fields are empty', async () => {
    render(<SignupPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/required/i);
    expect(signup).not.toHaveBeenCalled();
  });

  it('rejects a malformed email inline without submitting', async () => {
    render(<SignupPage />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'not-an-email');
    await userEvent.type(
      screen.getByPlaceholderText('Password'),
      'password123',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/valid email/i);
    expect(signup).not.toHaveBeenCalled();
  });
});
