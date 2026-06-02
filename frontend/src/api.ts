export interface Note {
  noteId: string;
  content: string;
  url?: string;
  imageKey?: string;
  userId: string;
  createdAt: string;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  objectUrl: string;
  key: string;
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

export async function getUploadUrl(token: string, contentType: string): Promise<UploadUrlResponse> {
  const res = await fetch('/api/notes/upload-url', {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ contentType }),
  });
  if (!res.ok) throw new Error('Failed to get upload URL');
  return res.json();
}

export async function uploadImageToS3(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!res.ok) throw new Error('Failed to upload image');
}

export async function createNote(token: string, content: string, url?: string, imageKey?: string): Promise<Note> {
  const res = await fetch('/api/notes', {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ content, url, imageKey }),
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
