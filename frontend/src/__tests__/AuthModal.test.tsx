import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthModal from '../AuthModal';

// Mock auth functions
vi.mock('../auth', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  confirmSignUp: vi.fn(),
}));

import { signIn, signUp } from '../auth';

describe('AuthModal', () => {
  it('renders sign-in form by default', () => {
    render(<AuthModal onAuth={vi.fn()} />);
    // Use role queries to disambiguate heading vs button
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Password/)).toBeInTheDocument();
  });

  it('switches to sign-up form when "Sign up" link is clicked', async () => {
    render(<AuthModal onAuth={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(screen.getByRole('heading', { name: 'Create account' })).toBeInTheDocument();
  });

  it('calls signIn with email and password on submit', async () => {
    const mockUser = { sub: 'u1', email: 'test@test.com', token: 'tok' };
    vi.mocked(signIn).mockResolvedValueOnce(mockUser);
    const onAuth = vi.fn();

    render(<AuthModal onAuth={onAuth} />);
    await userEvent.type(screen.getByPlaceholderText('Email'), 'test@test.com');
    await userEvent.type(screen.getByPlaceholderText(/Password/), 'Password1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith('test@test.com', 'Password1');
      expect(onAuth).toHaveBeenCalledWith(mockUser);
    });
  });

  it('calls signUp and shows verify form on sign-up submit', async () => {
    vi.mocked(signUp).mockResolvedValueOnce(undefined);
    render(<AuthModal onAuth={vi.fn()} />);

    await userEvent.click(screen.getByText('Sign up'));
    await userEvent.type(screen.getByPlaceholderText('Email'), 'new@test.com');
    await userEvent.type(screen.getByPlaceholderText(/Password/), 'Password1');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(signUp).toHaveBeenCalledWith('new@test.com', 'Password1');
      expect(screen.getByRole('heading', { name: /Verify/i })).toBeInTheDocument();
    });
  });

  it('displays error message when sign-in fails', async () => {
    vi.mocked(signIn).mockRejectedValueOnce({ message: 'Incorrect username or password' });
    render(<AuthModal onAuth={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText('Email'), 'bad@test.com');
    await userEvent.type(screen.getByPlaceholderText(/Password/), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText('Incorrect username or password')).toBeInTheDocument();
    });
  });
});
