import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';

// Mock all API and auth modules
vi.mock('../api', () => ({
  listNotes: vi.fn(),
  createNote: vi.fn(),
  deleteNote: vi.fn(),
  getUploadUrl: vi.fn(),
  uploadImageToS3: vi.fn(),
  getTrendingTags: vi.fn(),
  getNoteTags: vi.fn(),
  addTag: vi.fn(),
  removeTag: vi.fn(),
}));

vi.mock('../auth', () => ({
  getCurrentUser: vi.fn(),
  signOut: vi.fn(),
}));

// Vite env vars used in App.tsx
vi.stubEnv('VITE_IMAGES_BUCKET', 'test-bucket');

import { listNotes, getTrendingTags, getNoteTags } from '../api';
import { getCurrentUser } from '../auth';

const mockNote = {
  noteId: 'note-1',
  content: 'Hello from test',
  userId: 'user-1',
  createdAt: '2024-01-01T00:00:00Z',
};

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTrendingTags).mockResolvedValue([]);
    vi.mocked(getNoteTags).mockResolvedValue([]);
  });

  it('shows loading state then renders notes for logged-out user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    vi.mocked(listNotes).mockResolvedValue([mockNote]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Hello from test')).toBeInTheDocument();
    });
  });

  it('shows sign-in prompt (not compose form) when logged out', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    vi.mocked(listNotes).mockResolvedValue([]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Sign in to post notes.')).toBeInTheDocument();
    });
  });

  it('shows compose form when logged in', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      sub: 'user-1', email: 'user@test.com', token: 'tok',
    });
    vi.mocked(listNotes).mockResolvedValue([]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/What's on your mind/)).toBeInTheDocument();
    });
  });

  it('shows user email in header when logged in', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      sub: 'user-1', email: 'user@test.com', token: 'tok',
    });
    vi.mocked(listNotes).mockResolvedValue([]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('user@test.com')).toBeInTheDocument();
    });
  });

  it('shows "No notes yet" when list is empty', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    vi.mocked(listNotes).mockResolvedValue([]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/No notes yet/)).toBeInTheDocument();
    });
  });

  it('shows trending tags sidebar', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    vi.mocked(listNotes).mockResolvedValue([]);
    vi.mocked(getTrendingTags).mockResolvedValue([
      { name: 'aws', count: 5 },
      { name: 'demo', count: 2 },
    ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Trending tags')).toBeInTheDocument();
      expect(screen.getByText('#aws')).toBeInTheDocument();
      expect(screen.getByText('#demo')).toBeInTheDocument();
    });
  });
});
