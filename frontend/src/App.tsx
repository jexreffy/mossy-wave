import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Note, Tag,
  listNotes, createNote, deleteNote,
  getUploadUrl, uploadImageToS3,
  getTrendingTags, getNoteTags, addTag, removeTag,
} from './api';
import { getCurrentUser, signOut, AuthUser } from './auth';
import AuthModal from './AuthModal';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  const [notes, setNotes] = useState<Note[]>([]);
  const [noteTags, setNoteTags] = useState<Record<string, string[]>>({});
  const [trendingTags, setTrendingTags] = useState<Tag[]>([]);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Per-note tag input state
  const [addingTagTo, setAddingTagTo] = useState<string | null>(null);
  const [inlineTag, setInlineTag] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { getCurrentUser().then(u => { setUser(u); setAuthChecked(true); }); }, []);

  const load = useCallback(async () => {
    try {
      const [fetchedNotes, tags] = await Promise.all([listNotes(), getTrendingTags()]);
      setNotes(fetchedNotes);
      setTrendingTags(tags);
      // Load tags for each note
      const tagMap: Record<string, string[]> = {};
      await Promise.all(fetchedNotes.map(async n => {
        tagMap[n.noteId] = await getNoteTags(n.noteId);
      }));
      setNoteTags(tagMap);
    } catch { setError('Could not load notes.'); }
    finally { setLoading(false); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (authChecked) load(); }, [authChecked, load]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else { setImagePreview(null); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || !user) return;
    setSubmitting(true); setError('');
    try {
      let imageKey: string | undefined;
      if (imageFile) {
        const { uploadUrl, key } = await getUploadUrl(user.token, imageFile.type);
        await uploadImageToS3(uploadUrl, imageFile);
        imageKey = key;
      }
      const note = await createNote(user.token, content.trim(), url.trim() || undefined, imageKey);
      // Add tags if any were entered
      const tags = tagInput.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
      await Promise.all(tags.map(t => addTag(user.token, note.noteId, t)));
      setNotes(prev => [note, ...prev]);
      setNoteTags(prev => ({ ...prev, [note.noteId]: tags }));
      setContent(''); setUrl(''); setTagInput(''); setImageFile(null); setImagePreview(null);
      // Refresh trending tags
      getTrendingTags().then(setTrendingTags);
    } catch { setError('Failed to post note.'); }
    finally { setSubmitting(false); }
  }

  async function handleDeleteNote(noteId: string) {
    if (!user) return;
    try {
      await deleteNote(user.token, noteId);
      setNotes(prev => prev.filter(n => n.noteId !== noteId));
    } catch { setError('Failed to delete note.'); }
  }

  async function handleAddInlineTag(noteId: string) {
    if (!user || !inlineTag.trim()) return;
    const tag = inlineTag.trim().toLowerCase();
    try {
      await addTag(user.token, noteId, tag);
      setNoteTags(prev => ({ ...prev, [noteId]: [...(prev[noteId] ?? []), tag] }));
      setInlineTag(''); setAddingTagTo(null);
      getTrendingTags().then(setTrendingTags);
    } catch { setError('Failed to add tag.'); }
  }

  async function handleRemoveTag(noteId: string, tag: string) {
    if (!user) return;
    try {
      await removeTag(user.token, noteId, tag);
      setNoteTags(prev => ({ ...prev, [noteId]: (prev[noteId] ?? []).filter(t => t !== tag) }));
      getTrendingTags().then(setTrendingTags);
    } catch { setError('Failed to remove tag.'); }
  }

  useEffect(() => {
    if (addingTagTo) tagInputRef.current?.focus();
  }, [addingTagTo]);

  const visibleNotes = activeTagFilter
    ? notes.filter(n => (noteTags[n.noteId] ?? []).includes(activeTagFilter))
    : notes;

  if (!authChecked) return null;

  return (
    <div style={s.page}>
      {showAuth && <AuthModal onAuth={u => { setUser(u); setShowAuth(false); }} />}

      <header style={s.header}>
        <div>
          <h1 style={s.logo}>🌊 Mossy Wave</h1>
          <p style={s.subtitle}>Serverless notes board — AWS portfolio demo</p>
        </div>
        <div style={s.authArea}>
          {user ? (
            <><span style={s.userEmail}>{user.email}</span>
              <button style={s.authBtn} onClick={() => { signOut(); setUser(null); }}>Sign out</button></>
          ) : (
            <button style={s.authBtn} onClick={() => setShowAuth(true)}>Sign in</button>
          )}
        </div>
      </header>

      <div style={s.layout}>
        {/* ── Main column ── */}
        <main style={s.main}>
          {user ? (
            <form onSubmit={handleSubmit} style={s.form}>
              <textarea style={s.textarea} placeholder="What's on your mind? (max 500 chars)"
                value={content} maxLength={500} rows={3} onChange={e => setContent(e.target.value)} />
              <input style={s.input} type="url" placeholder="Optional link (https://...)"
                value={url} onChange={e => setUrl(e.target.value)} />
              <input style={s.input} type="text" placeholder="Tags: comma-separated (e.g. aws, demo)"
                value={tagInput} onChange={e => setTagInput(e.target.value)} />
              <label style={s.fileLabel}>
                📎 {imageFile ? imageFile.name : 'Attach image (optional)'}
                <input type="file" accept="image/jpeg,image/png,image/gif,image/webp"
                  style={{ display: 'none' }} onChange={handleFileChange} />
              </label>
              {imagePreview && (
                <div style={s.previewWrap}>
                  <img src={imagePreview} alt="preview" style={s.previewImg} />
                  <button style={s.removeImg} onClick={() => { setImageFile(null); setImagePreview(null); }}>✕</button>
                </div>
              )}
              <button style={s.button} type="submit" disabled={submitting || !content.trim()}>
                {submitting ? 'Posting…' : 'Post note'}
              </button>
            </form>
          ) : (
            <div style={s.signInPrompt}>
              <p>Sign in to post notes.</p>
              <button style={s.button} onClick={() => setShowAuth(true)}>Sign in / Sign up</button>
            </div>
          )}

          {error && <p style={s.error}>{error}</p>}

          {activeTagFilter && (
            <div style={s.filterBanner}>
              Showing notes tagged <strong>#{activeTagFilter}</strong>
              <button style={s.clearFilter} onClick={() => setActiveTagFilter(null)}>✕ clear</button>
            </div>
          )}

          {loading ? <p style={s.hint}>Loading…</p>
            : visibleNotes.length === 0 ? <p style={s.hint}>{activeTagFilter ? 'No notes with this tag.' : 'No notes yet — be the first!'}</p>
            : (
              <ul style={s.list}>
                {visibleNotes.map(note => {
                  const tags = noteTags[note.noteId] ?? [];
                  const isOwner = !!user && note.userId === user.sub;
                  return (
                    <li key={note.noteId} style={s.card}>
                      <p style={s.cardContent}>{note.content}</p>
                      {note.imageKey && (
                        <img
                          src={`https://${import.meta.env.VITE_IMAGES_BUCKET}.s3.us-east-1.amazonaws.com/${note.imageKey}`}
                          alt="attachment" style={s.cardImage} />
                      )}
                      {note.url && (
                        <a href={note.url} target="_blank" rel="noopener noreferrer" style={s.cardLink}>
                          {note.url}
                        </a>
                      )}
                      {/* Tag pills */}
                      <div style={s.tagRow}>
                        {tags.map(t => (
                          <span key={t} style={s.tagPill}>
                            <button style={s.tagPillBtn} onClick={() => setActiveTagFilter(t)}>#{t}</button>
                            {isOwner && (
                              <button style={s.tagRemove} onClick={() => handleRemoveTag(note.noteId, t)}>✕</button>
                            )}
                          </span>
                        ))}
                        {isOwner && addingTagTo === note.noteId ? (
                          <span style={s.inlineTagForm}>
                            <input ref={tagInputRef} style={s.inlineTagInput}
                              placeholder="tag" value={inlineTag}
                              onChange={e => setInlineTag(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddInlineTag(note.noteId); } if (e.key === 'Escape') { setAddingTagTo(null); setInlineTag(''); } }} />
                            <button style={s.inlineTagAdd} onClick={() => handleAddInlineTag(note.noteId)}>+</button>
                          </span>
                        ) : isOwner && (
                          <button style={s.addTagBtn} onClick={() => { setAddingTagTo(note.noteId); setInlineTag(''); }}>
                            + tag
                          </button>
                        )}
                      </div>
                      <div style={s.cardMeta}>
                        <span>{new Date(note.createdAt).toLocaleString()}</span>
                        {isOwner && (
                          <button style={s.deleteBtn} onClick={() => handleDeleteNote(note.noteId)}>Delete</button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
        </main>

        {/* ── Trending tags sidebar (RDS-powered) ── */}
        <aside style={s.sidebar}>
          <h2 style={s.sidebarTitle}>Trending tags</h2>
          <p style={s.sidebarSub}>Powered by RDS Postgres<br /><code style={s.code}>GROUP BY + COUNT</code></p>
          {trendingTags.length === 0 ? (
            <p style={s.hint}>No tags yet.</p>
          ) : (
            <ul style={s.tagList}>
              {trendingTags.map(t => (
                <li key={t.name}>
                  <button
                    style={{ ...s.trendingTag, ...(activeTagFilter === t.name ? s.trendingTagActive : {}) }}
                    onClick={() => setActiveTagFilter(activeTagFilter === t.name ? null : t.name)}
                  >
                    <span>#{t.name}</span>
                    <span style={s.tagCount}>{t.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f0f4f0' },
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
    color: '#fff', border: '1px solid rgba(255,255,255,0.4)', cursor: 'pointer',
    fontSize: '0.9rem', fontWeight: 600,
  },
  layout: { display: 'flex', gap: 24, maxWidth: 1000, margin: '32px auto', padding: '0 16px', width: '100%', alignItems: 'flex-start' },
  main: { flex: 1, minWidth: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 },
  signInPrompt: {
    textAlign: 'center', padding: 24, marginBottom: 28,
    background: '#f5fbf4', borderRadius: 10, border: '1px solid #d4e8cc',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
  },
  textarea: { padding: 12, borderRadius: 8, border: '1.5px solid #b0c8a8', fontSize: '1rem', resize: 'vertical', background: '#fff' },
  input: { padding: '10px 12px', borderRadius: 8, border: '1.5px solid #b0c8a8', fontSize: '0.95rem', background: '#fff' },
  fileLabel: { display: 'inline-block', padding: '8px 14px', borderRadius: 8, border: '1.5px dashed #b0c8a8', color: '#2d5a27', cursor: 'pointer', fontSize: '0.9rem', background: '#f5fbf4' },
  previewWrap: { position: 'relative', display: 'inline-block' },
  previewImg: { maxHeight: 160, maxWidth: '100%', borderRadius: 8, display: 'block' },
  removeImg: { position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 12 },
  button: { alignSelf: 'flex-end', padding: '10px 24px', borderRadius: 8, background: '#2d5a27', color: '#fff', border: 'none', fontSize: '1rem', cursor: 'pointer', fontWeight: 600 },
  filterBanner: { background: '#e8f5e3', border: '1px solid #4a8c42', borderRadius: 8, padding: '8px 14px', marginBottom: 16, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 12 },
  clearFilter: { background: 'none', border: 'none', cursor: 'pointer', color: '#2d5a27', fontSize: '0.85rem', fontWeight: 600 },
  error: { color: '#c0392b', marginBottom: 12 },
  hint: { color: '#666', textAlign: 'center', marginTop: 16, fontSize: '0.9rem' },
  list: { listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 },
  card: { background: '#fff', borderRadius: 10, padding: 18, border: '1px solid #d4e8cc', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  cardContent: { fontSize: '1rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  cardImage: { display: 'block', maxWidth: '100%', maxHeight: 320, borderRadius: 8, marginTop: 10, objectFit: 'contain' },
  cardLink: { display: 'block', marginTop: 8, color: '#2d5a27', fontSize: '0.85rem', wordBreak: 'break-all' },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' },
  tagPill: { display: 'inline-flex', alignItems: 'center', background: '#e8f5e3', borderRadius: 20, overflow: 'hidden' },
  tagPillBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#2d5a27', padding: '3px 8px', fontSize: '0.8rem', fontWeight: 600 },
  tagRemove: { background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: '3px 6px 3px 0', fontSize: '0.75rem' },
  addTagBtn: { background: 'none', border: '1px dashed #b0c8a8', borderRadius: 20, color: '#888', cursor: 'pointer', padding: '3px 10px', fontSize: '0.8rem' },
  inlineTagForm: { display: 'inline-flex', alignItems: 'center', gap: 4 },
  inlineTagInput: { border: '1px solid #b0c8a8', borderRadius: 6, padding: '3px 8px', fontSize: '0.85rem', width: 90, outline: 'none' },
  inlineTagAdd: { background: '#2d5a27', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: '0.85rem' },
  cardMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: '0.8rem', color: '#888' },
  deleteBtn: { background: 'none', border: '1px solid #e88', color: '#c0392b', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: '0.8rem' },
  // Sidebar
  sidebar: { width: 220, flexShrink: 0, background: '#fff', borderRadius: 10, padding: 18, border: '1px solid #d4e8cc', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', position: 'sticky', top: 24 },
  sidebarTitle: { fontSize: '1rem', fontWeight: 700, color: '#2d5a27', marginBottom: 4 },
  sidebarSub: { fontSize: '0.75rem', color: '#888', marginBottom: 14, lineHeight: 1.5 },
  code: { background: '#f0f4f0', padding: '1px 4px', borderRadius: 4, fontSize: '0.75rem', fontFamily: 'monospace' },
  tagList: { listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 },
  trendingTag: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: '1px solid #e8f0e8', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: '0.85rem', color: '#2d5a27', textAlign: 'left' },
  trendingTagActive: { background: '#e8f5e3', borderColor: '#4a8c42', fontWeight: 700 },
  tagCount: { background: '#e8f5e3', borderRadius: 20, padding: '1px 7px', fontSize: '0.75rem', color: '#4a8c42', fontWeight: 600 },
};
