import { useState, useEffect, useCallback } from 'react';
import { Note, listNotes, createNote, deleteNote, getUploadUrl, uploadImageToS3 } from './api';
import { getCurrentUser, signOut, AuthUser } from './auth';
import AuthModal from './AuthModal';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  const [notes, setNotes] = useState<Note[]>([]);
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Restore session on load
  useEffect(() => {
    getCurrentUser().then(u => {
      setUser(u);
      setAuthChecked(true);
    });
  }, []);

  const load = useCallback(async () => {
    try {
      setNotes(await listNotes());
    } catch {
      setError('Could not load notes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (authChecked) load(); }, [authChecked, load]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || !user) return;
    setSubmitting(true);
    setError('');
    try {
      let imageKey: string | undefined;

      if (imageFile) {
        const { uploadUrl, key } = await getUploadUrl(user.token, imageFile.type);
        await uploadImageToS3(uploadUrl, imageFile);
        imageKey = key;
      }

      const note = await createNote(user.token, content.trim(), url.trim() || undefined, imageKey);
      setNotes(prev => [note, ...prev]);
      setContent('');
      setUrl('');
      setImageFile(null);
      setImagePreview(null);
    } catch {
      setError('Failed to post note.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(noteId: string) {
    if (!user) return;
    try {
      await deleteNote(user.token, noteId);
      setNotes(prev => prev.filter(n => n.noteId !== noteId));
    } catch {
      setError('Failed to delete note.');
    }
  }

  function handleSignOut() {
    signOut();
    setUser(null);
  }

  if (!authChecked) return null;

  return (
    <div style={styles.page}>
      {showAuth && <AuthModal onAuth={u => { setUser(u); setShowAuth(false); }} />}

      <header style={styles.header}>
        <div>
          <h1 style={styles.logo}>🌊 Mossy Wave</h1>
          <p style={styles.subtitle}>A shared notes board — AWS serverless demo</p>
        </div>
        <div style={styles.authArea}>
          {user ? (
            <>
              <span style={styles.userEmail}>{user.email}</span>
              <button style={styles.authBtn} onClick={handleSignOut}>Sign out</button>
            </>
          ) : (
            <button style={styles.authBtn} onClick={() => setShowAuth(true)}>Sign in</button>
          )}
        </div>
      </header>

      <main style={styles.main}>
        {user ? (
          <form onSubmit={handleSubmit} style={styles.form}>
            <textarea
              style={styles.textarea}
              placeholder="What's on your mind? (max 500 chars)"
              value={content}
              maxLength={500}
              rows={3}
              onChange={e => setContent(e.target.value)}
            />
            <input
              style={styles.input}
              type="url"
              placeholder="Optional link (https://...)"
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
            <label style={styles.fileLabel}>
              📎 {imageFile ? imageFile.name : 'Attach image (optional)'}
              <input type="file" accept="image/jpeg,image/png,image/gif,image/webp"
                style={{ display: 'none' }} onChange={handleFileChange} />
            </label>
            {imagePreview && (
              <div style={styles.previewWrap}>
                <img src={imagePreview} alt="preview" style={styles.previewImg} />
                <button style={styles.removeImg} onClick={() => { setImageFile(null); setImagePreview(null); }}>✕</button>
              </div>
            )}
            <button style={styles.button} type="submit" disabled={submitting || !content.trim()}>
              {submitting ? 'Posting…' : 'Post note'}
            </button>
          </form>
        ) : (
          <div style={styles.signInPrompt}>
            <p>Sign in to post notes.</p>
            <button style={styles.button} onClick={() => setShowAuth(true)}>Sign in / Sign up</button>
          </div>
        )}

        {error && <p style={styles.error}>{error}</p>}

        {loading ? (
          <p style={styles.hint}>Loading…</p>
        ) : notes.length === 0 ? (
          <p style={styles.hint}>No notes yet — be the first!</p>
        ) : (
          <ul style={styles.list}>
            {notes.map(note => (
              <li key={note.noteId} style={styles.card}>
                <p style={styles.cardContent}>{note.content}</p>
                {note.imageKey && (
                  <img
                    src={`https://${import.meta.env.VITE_IMAGES_BUCKET}.s3.us-east-1.amazonaws.com/${note.imageKey}`}
                    alt="attachment"
                    style={styles.cardImage}
                  />
                )}
                {note.url && (
                  <a href={note.url} target="_blank" rel="noopener noreferrer" style={styles.cardLink}>
                    {note.url}
                  </a>
                )}
                <div style={styles.cardMeta}>
                  <span>{new Date(note.createdAt).toLocaleString()}</span>
                  {user && note.userId === user.sub && (
                    <button style={styles.deleteBtn} onClick={() => handleDelete(note.noteId)}>
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  header: {
    background: '#2d5a27', color: '#e8f5e3',
    padding: '20px 32px', borderBottom: '4px solid #4a8c42',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  logo: { fontSize: '1.8rem', fontWeight: 700 },
  subtitle: { marginTop: 4, fontSize: '0.9rem', opacity: 0.8 },
  authArea: { display: 'flex', alignItems: 'center', gap: 12 },
  userEmail: { fontSize: '0.85rem', opacity: 0.85 },
  authBtn: {
    padding: '7px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.15)',
    color: '#fff', border: '1px solid rgba(255,255,255,0.4)',
    cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
  },
  main: { maxWidth: 680, margin: '32px auto', padding: '0 16px', width: '100%' },
  form: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 },
  signInPrompt: {
    textAlign: 'center', padding: '24px', marginBottom: 28,
    background: '#f5fbf4', borderRadius: 10, border: '1px solid #d4e8cc',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
  },
  textarea: {
    padding: 12, borderRadius: 8, border: '1.5px solid #b0c8a8',
    fontSize: '1rem', resize: 'vertical', background: '#fff',
  },
  input: {
    padding: '10px 12px', borderRadius: 8, border: '1.5px solid #b0c8a8',
    fontSize: '0.95rem', background: '#fff',
  },
  button: {
    alignSelf: 'flex-end', padding: '10px 24px', borderRadius: 8,
    background: '#2d5a27', color: '#fff', border: 'none',
    fontSize: '1rem', cursor: 'pointer', fontWeight: 600,
  },
  error: { color: '#c0392b', marginBottom: 12 },
  hint: { color: '#666', textAlign: 'center', marginTop: 32 },
  list: { listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 },
  card: {
    background: '#fff', borderRadius: 10, padding: 18,
    border: '1px solid #d4e8cc', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  cardContent: { fontSize: '1rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  cardLink: {
    display: 'block', marginTop: 8, color: '#2d5a27',
    fontSize: '0.85rem', wordBreak: 'break-all',
  },
  cardMeta: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 12, fontSize: '0.8rem', color: '#888',
  },
  fileLabel: {
    display: 'inline-block', padding: '8px 14px', borderRadius: 8,
    border: '1.5px dashed #b0c8a8', color: '#2d5a27', cursor: 'pointer',
    fontSize: '0.9rem', background: '#f5fbf4',
  },
  previewWrap: { position: 'relative' as const, display: 'inline-block' },
  previewImg: { maxHeight: 160, maxWidth: '100%', borderRadius: 8, display: 'block' },
  removeImg: {
    position: 'absolute' as const, top: 4, right: 4,
    background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none',
    borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 12,
  },
  cardImage: {
    display: 'block', maxWidth: '100%', maxHeight: 320,
    borderRadius: 8, marginTop: 10, objectFit: 'contain' as const,
  },
  deleteBtn: {
    background: 'none', border: '1px solid #e88', color: '#c0392b',
    borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: '0.8rem',
  },
};
