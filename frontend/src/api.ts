export interface Note {
  noteId: string;
  content: string;
  url?: string;
  userId: string;
  createdAt: string;
}

const headers = (token?: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

export async function listNotes(): Promise<Note[]> {
  const res = await fetch('/api/notes', { headers: headers() });
  if (!res.ok) throw new Error('Failed to load notes');
  return res.json();
}

export async function createNote(token: string, content: string, url?: string): Promise<Note> {
  const res = await fetch('/api/notes', {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ content, url }),
  });
  if (!res.ok) throw new Error('Failed to create note');
  return res.json();
}

export async function deleteNote(token: string, noteId: string): Promise<void> {
  const res = await fetch(`/api/notes/${noteId}`, {
    method: 'DELETE',
    headers: headers(token),
  });
  if (!res.ok) throw new Error('Failed to delete note');
}
