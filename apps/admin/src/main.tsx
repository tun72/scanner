import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { adminRequest, myanmarTime, readableError, RequestError } from './api.ts';
import type { Activity, Request, Session } from './api.ts';
import { Broadcasts } from './broadcasts.tsx';
import { Users } from './users.tsx';
import './style.css';

const sections = ['Users','Notifications','Activity'] as const;
type Section = typeof sections[number];
const sectionFromUrl = (): Section => sections.find(section => '#' + section.toLowerCase() === location.hash) ?? 'Users';

const activityLabels: Record<string,string> = {
  'account.created': 'Created user', 'account.edited': 'Edited user',
  'account.suspended': 'Suspended user', 'account.reactivated': 'Reactivated user',
  'account.reset_link_issued': 'Issued password reset link', 'broadcast.created': 'Created draft',
  'broadcast.edited': 'Edited broadcast', 'broadcast.queued': 'Queued broadcast',
  'broadcast.cancelled': 'Cancelled broadcast',
};

function Audit({ request }: { request: Request }) {
  const [items,setItems] = useState<Activity[]>();
  const [error,setError] = useState('');
  useEffect(() => {
    let current = true;
    void request<Activity[]>('/audit').then(result => {
      if (current) setItems(result);
    }).catch(reason => { if (current) setError(readableError(reason)); });
    return () => { current = false; };
  },[request]);

  return <>
    <header className="page-head"><div><h1>Activity</h1><p>Recent changes made by Scanner administrators.</p></div></header>
    {error && <p role="alert" className="message error">{error}</p>}
    <section className="card table-card">
      {items?.length ? <div className="table-scroll"><table>
        <thead><tr><th>Action</th><th>Administrator</th><th>Item ID</th><th>Time (Myanmar)</th></tr></thead>
        <tbody>{items.map(item => <tr key={item.id}>
          <th scope="row">{activityLabels[item.action] ?? item.action}</th>
          <td className="code">{item.actor}</td><td className="code">{item.targetId}</td><td>{myanmarTime(item.occurredAt)}</td>
        </tr>)}</tbody>
      </table></div> : <p className="empty">{items ? 'No activity yet.' : !error && 'Loading activity…'}</p>}
    </section>
  </>;
}

function PasswordSignIn({ onSignIn }: { onSignIn: (session: Session) => void }) {
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await fetch('/admin/auth/password',{
        method: 'POST',credentials: 'same-origin',
        headers: { 'content-type': 'application/json',accept: 'application/json' },
        body: JSON.stringify({ email,password }),
      });
      if (result.status === 429) { setError('Too many attempts. Wait a minute and try again.'); return; }
      if (result.status === 401) { setError('Check your email and password.'); return; }
      if (!result.ok) { setError('Scanner could not sign you in. Try again.'); return; }
      onSignIn(await adminRequest()<Session>('/session'));
    } catch (reason) {
      setError(readableError(reason));
    } finally {
      setPassword('');
      setBusy(false);
    }
  }

  return <form className="sign-in-form" onSubmit={submit}>
    <label>Email<input type="email" autoComplete="username" required maxLength={254}
      value={email} onChange={event => setEmail(event.target.value)} /></label>
    <label>Password<input type="password" autoComplete="current-password" required maxLength={128}
      value={password} onChange={event => setPassword(event.target.value)} /></label>
    {error && <p className="message error" role="alert">{error}</p>}
    <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
  </form>;
}

function Admin() {
  const [session,setSession] = useState<Session | null>();
  const [mode,setMode] = useState<'password' | 'oidc' | null>();
  const [error,setError] = useState(new URLSearchParams(location.search).has('signin') ? 'Sign-in could not be verified. Try again.' : '');
  const [section,setSection] = useState(sectionFromUrl);
  const expire = useCallback(() => {
    setSession(null);
    setError('Your session expired. Sign in to continue.');
  },[]);
  const request = useMemo(() => adminRequest(session?.csrf,expire),[session?.csrf,expire]);

  useEffect(() => {
    let active = true;
    const onSection = () => setSection(sectionFromUrl());
    window.addEventListener('hashchange',onSection);
    void adminRequest()<Session>('/session').then(value => {
      if (active) setSession(value);
    }).catch(reason => {
      if (!active) return;
      setSession(null);
      if (!(reason instanceof RequestError && reason.status === 401)) setError(readableError(reason));
    });
    void fetch('/admin/auth/mode',{ cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Could not load sign-in settings.');
      const { mode } = await response.json();
      if (active) setMode(mode === 'password' || mode === 'oidc' ? mode : null);
    }).catch(() => { if (active) setMode(null); });
    return () => { active = false; window.removeEventListener('hashchange',onSection); };
  },[]);
  const signedIn = (value: Session) => { setError(''); setSession(value); };

  if (!session) return <div className="login">
    <main className="card sign-in">
      <div className="app-mark" aria-hidden="true">S</div>
      <h1>Scanner Admin</h1>
      {session === undefined || mode === undefined ? <p role="status">Checking sign-in…</p> :
        <><p>Sign in with your administrator account.</p>
          {error && <p className="message error" role="alert">{error}</p>}
          {mode === 'password' ? <PasswordSignIn onSignIn={signedIn} /> :
            mode === 'oidc' ? <a className="button-link" href="/admin/auth/start">Sign in</a> :
              <p className="message error" role="alert">Sign-in is unavailable. Reload the page to retry.</p>}</>}
    </main>
  </div>;

  return <div className="shell">
    <aside>
      <a className="brand" href="#users"><span className="app-mark" aria-hidden="true">S</span><span>Scanner <strong>Admin</strong></span></a>
      <nav aria-label="Admin">{sections.map(name => <a key={name} href={'#' + name.toLowerCase()}
        aria-current={section === name ? 'page' : undefined}>{name}</a>)}</nav>
      <button className="logout" onClick={() => void request('/logout','POST').then(() => {
        setError(''); setSession(null);
      }).catch(reason => setError(readableError(reason)))}>Sign out</button>
    </aside>
    <main className="content">
      {error && <p className="message error" role="alert">{error}</p>}
      {section === 'Users' ? <Users request={request} /> : section === 'Notifications' ? <Broadcasts request={request} /> : <Audit request={request} />}
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<Admin />);
