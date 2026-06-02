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

// ── Tags (RDS Postgres) ────────────────────────────────────────────────────

export interface Tag { name: string; count: number; }

export async function getTrendingTags(): Promise<Tag[]> {
  const res = await fetch('/api/tags', { headers: headers() });
  if (!res.ok) return [];
  return res.json();
}

export async function getNoteTags(noteId: string): Promise<string[]> {
  const res = await fetch(`/api/notes/${noteId}/tags`, { headers: headers() });
  if (!res.ok) return [];
  return res.json();
}

export async function addTag(token: string, noteId: string, tag: string): Promise<void> {
  const res = await fetch(`/api/notes/${noteId}/tags`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ tag }),
  });
  if (!res.ok) throw new Error('Failed to add tag');
}

export async function removeTag(token: string, noteId: string, tag: string): Promise<void> {
  const res = await fetch(`/api/notes/${noteId}/tags/${encodeURIComponent(tag)}`, {
    method: 'DELETE',
    headers: headers(token),
  });
  if (!res.ok) throw new Error('Failed to remove tag');
}
