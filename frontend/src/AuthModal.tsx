import { useState } from 'react';
import { signIn, signUp, confirmSignUp, AuthUser } from './auth';

type Mode = 'signin' | 'signup' | 'confirm';

interface Props {
  onAuth: (user: AuthUser) => void;
}

export default function AuthModal({ onAuth }: Props) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signin') {
        const user = await signIn(email, password);
        onAuth(user);
      } else if (mode === 'signup') {
        await signUp(email, password);
        setMode('confirm');
      } else {
        await confirmSignUp(email, code);
        const user = await signIn(email, password);
        onAuth(user);
      }
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <h2 style={s.title}>
          {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Verify email'}
        </h2>

        {mode === 'confirm' && (
          <p style={s.hint}>Check your email for a verification code.</p>
        )}

        <form onSubmit={handleSubmit} style={s.form}>
          {mode !== 'confirm' && (
            <>
              <input style={s.input} type="email" placeholder="Email" value={email}
                onChange={e => setEmail(e.target.value)} required />
              <input style={s.input} type="password" placeholder="Password (min 8 chars, 1 number)"
                value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
            </>
          )}
          {mode === 'confirm' && (
            <input style={s.input} type="text" placeholder="Verification code"
              value={code} onChange={e => setCode(e.target.value)} required />
          )}
          {error && <p style={s.error}>{error}</p>}
          <button style={s.btn} type="submit" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Verify'}
          </button>
        </form>

        {mode === 'signin' && (
          <p style={s.switch}>
            No account?{' '}
            <button style={s.link} onClick={() => { setMode('signup'); setError(''); }}>Sign up</button>
          </p>
        )}
        {mode === 'signup' && (
          <p style={s.switch}>
            Already have one?{' '}
            <button style={s.link} onClick={() => { setMode('signin'); setError(''); }}>Sign in</button>
          </p>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modal: {
    background: '#fff', borderRadius: 12, padding: 32, width: '100%', maxWidth: 400,
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  },
  title: { marginBottom: 20, fontSize: '1.3rem', color: '#2d5a27' },
  hint: { marginBottom: 16, fontSize: '0.9rem', color: '#555' },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: {
    padding: '10px 12px', borderRadius: 8, border: '1.5px solid #b0c8a8',
    fontSize: '1rem', background: '#fff',
  },
  error: { color: '#c0392b', fontSize: '0.875rem' },
  btn: {
    padding: '11px', borderRadius: 8, background: '#2d5a27', color: '#fff',
    border: 'none', fontSize: '1rem', cursor: 'pointer', fontWeight: 600,
  },
  switch: { marginTop: 16, fontSize: '0.875rem', color: '#555', textAlign: 'center' },
  link: {
    background: 'none', border: 'none', color: '#2d5a27', cursor: 'pointer',
    fontWeight: 600, textDecoration: 'underline', fontSize: 'inherit',
  },
};
