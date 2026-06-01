export interface Note {
  noteId: string;
  content: string;
  url?: string;
  clientId: string;
  createdAt: string;
}

const CLIENT_ID_KEY = 'mw-client-id';

export function getClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

const headers = () => ({
  'Content-Type': 'application/json',
  'X-Client-Id': getClientId(),
});

export async function listNotes(): Promise<Note[]> {
  const res = await fetch('/api/notes', { headers: headers() });
  if (!res.ok) throw new Error('Failed to load notes');
  return res.json();
}

export async function createNote(content: string, url?: string): Promise<Note> {
  const res = await fetch('/api/notes', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ content, url }),
  });
  if (!res.ok) throw new Error('Failed to create note');
  return res.json();
}

export async function deleteNote(noteId: string): Promise<void> {
  const res = await fetch(`/api/notes/${noteId}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok) throw new Error('Failed to delete note');
}
