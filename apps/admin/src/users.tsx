import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { myanmarTime, readableError } from './api.ts';
import type { Grant, Page, Request, User } from './api.ts';

const blank = { name: '', rollNumber: '' };
const labels = { active: 'Active', pending: 'Awaiting setup', suspended: 'Suspended' };

export function Users({ request }: { request: Request }) {
  const [text,setText] = useState('');
  const [search,setSearch] = useState('');
  const [page,setPage] = useState<Page<User>>({ items: [],next: null });
  const [revision,setRevision] = useState(0);
  const [editor,setEditor] = useState<User | 'new'>();
  const [fields,setFields] = useState(blank);
  const [grant,setGrant] = useState<Grant>();
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [problem,setProblem] = useState('');
  const [feedback,setFeedback] = useState('');
  const usersUrl = '/users?search=' + encodeURIComponent(search);

  useEffect(() => {
    let current = true;
    setLoading(true);
    void request<Page<User>>(usersUrl).then(value => {
      if (current) setPage(value);
    }).catch(error => {
      if (current) setProblem(readableError(error));
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  },[request,usersUrl,revision]);

  const run = async (operation: () => Promise<void>) => {
    setProblem('');
    setFeedback('');
    setBusy(true);
    try { await operation(); }
    catch (error) { setProblem(readableError(error)); }
    finally { setBusy(false); }
  };
  const open = (user: User | 'new') => {
    setGrant(undefined);
    setProblem('');
    setEditor(user);
    setFields(user === 'new' ? blank : { name: user.name,rollNumber: user.rollNumber });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!editor) return;
    void run(async () => {
      if (editor === 'new') {
        const created = await request<{ user: User; setupLink: Grant }>('/users','POST',fields);
        setGrant(created.setupLink);
        setFeedback('Account created.');
      } else {
        await request('/users/' + editor.id,'PATCH',{ ...fields,version: editor.version });
        setFeedback('Changes saved.');
      }
      setEditor(undefined);
      setRevision(value => value + 1);
    });
  };

  return <>
    <header className="page-head">
      <div><h1>Users</h1><p>Manage who can sign in to Scanner.</p></div>
      <button onClick={() => open('new')} disabled={busy}>Add user</button>
    </header>
    {problem && <p className="message error" role="alert">{problem}</p>}
    {feedback && <p className="message" role="status">{feedback}</p>}
    {grant && <section className="card link-card">
      <div><h2>One-time sign-in setup</h2><p>Share this link privately. It expires at {myanmarTime(grant.expiresAt)} (Myanmar).</p></div>
      <label>Setup or reset link<input readOnly value={grant.url} onFocus={event => event.target.select()} /></label>
      <div className="actions">
        <button type="button" onClick={() => void navigator.clipboard.writeText(grant.url).then(
          () => setFeedback('Link copied.'),() => setFeedback('Select the link to copy it manually.'))}>Copy link</button>
        <button type="button" className="secondary" onClick={() => setGrant(undefined)}>Hide link</button>
      </div>
    </section>}
    {editor && <form className="card editor" onSubmit={submit}>
      <h2>{editor === 'new' ? 'Add Scanner user' : 'Edit user'}</h2>
      <label>Full name<input required maxLength={100} autoFocus value={fields.name}
        onChange={event => setFields({ ...fields,name: event.target.value })} /></label>
      <label>Roll number<input required maxLength={50} value={fields.rollNumber}
        onChange={event => setFields({ ...fields,rollNumber: event.target.value })} /></label>
      <div className="actions">
        <button disabled={busy}>{editor === 'new' ? 'Create setup link' : 'Save changes'}</button>
        <button className="secondary" type="button" onClick={() => setEditor(undefined)} disabled={busy}>Cancel</button>
      </div>
    </form>}
    <section className="card table-card">
      <form className="search" onSubmit={event => {
        event.preventDefault();
        setProblem('');
        if (text.trim() === search) setRevision(value => value + 1);
        else setSearch(text.trim());
      }}>
        <label htmlFor="account-search">Search users</label>
        <div className="actions"><input id="account-search" value={text} onChange={event => setText(event.target.value)}
          placeholder="Name or roll number" maxLength={100} /><button className="secondary" disabled={busy}>Search</button></div>
      </form>
      {loading ? <p className="empty">Loading users…</p> : page.items.length === 0 ? <p className="empty">No users found.</p> :
        <div className="table-scroll"><table>
          <thead><tr><th>Name</th><th>Roll number</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{page.items.map(user => <tr key={user.id}>
            <th scope="row">{user.name}<small className="user-id" title="Account ID">{user.id}</small></th><td className="code">{user.rollNumber}</td>
            <td><span className={'state ' + user.status}>{labels[user.status]}</span></td>
            <td><div className="actions compact">
              <button className="secondary" onClick={() => open(user)} disabled={busy}>Edit</button>
              {user.status !== 'suspended' && <button className="secondary" disabled={busy} onClick={() => void run(async () => {
                setGrant(await request('/users/' + user.id + '/reset','POST'));
                setFeedback('One-time link ready.');
              })}>{user.status === 'pending' ? 'New setup link' : 'Reset password'}</button>}
              <button className="secondary" disabled={busy} onClick={() => {
                const status = user.status === 'suspended' ? 'active' : 'suspended';
                if (status === 'suspended' && !window.confirm('Suspend ' + user.name + ' and sign them out?')) return;
                void run(async () => {
                  await request('/users/' + user.id + '/status','POST',{ status,version: user.version });
                  if (editor !== 'new' && editor?.id === user.id) setEditor(undefined);
                  setRevision(value => value + 1);
                });
              }}>{user.status === 'suspended' ? 'Reactivate' : 'Suspend'}</button>
            </div></td>
          </tr>)}</tbody>
        </table></div>}
      {page.next && <button className="secondary more" disabled={busy} onClick={() => void run(async () => {
        const next = await request<Page<User>>(usersUrl + '&after=' + page.next);
        setPage({ items: [...page.items,...next.items],next: next.next });
      })}>Load more</button>}
    </section>
  </>;
}
