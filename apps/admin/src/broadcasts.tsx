import { BroadcastContentSchema } from '@food-scanner/contracts';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Broadcast, Page, Request } from './api.ts';
import { myanmarTime, readableError, RequestError } from './api.ts';

const empty = { title: '',body: '' };
const statusName = (item: Broadcast) => {
  if (!item.publishedAt) return item.state === 'queued' ? 'Queued' : item.state === 'cancelled' ? 'Cancelled' : 'Draft';
  return (item.counts.pending ?? 0) + (item.counts.sending ?? 0) > 0 ? 'Sending' : 'Published';
};
const timeInput = (iso: string) => new Intl.DateTimeFormat('sv-SE',{
  timeZone: 'Asia/Yangon',dateStyle: 'short',timeStyle: 'short',
}).format(new Date(iso)).replace(' ','T');

export function Broadcasts({ request }: { request: Request }) {
  const [page,setPage] = useState<Page<Broadcast>>({ items: [],next: null });
  const [heartbeat,setHeartbeat] = useState<string | null>(null);
  const [editor,setEditor] = useState<Broadcast>();
  const [preview,setPreview] = useState<Broadcast>();
  const [draftId,setDraftId] = useState(() => crypto.randomUUID());
  const [fields,setFields] = useState(empty);
  const [sendAt,setSendAt] = useState('');
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [feedback,setFeedback] = useState('');

  const refresh = async () => {
    const state = await request<Page<Broadcast> & { workerSeenAt: string | null }>('/broadcasts');
    setPage(state);
    setHeartbeat(state.workerSeenAt);
  };
  useEffect(() => {
    let live = true;
    void request<Page<Broadcast> & { workerSeenAt: string | null }>('/broadcasts').then(state => {
      if (live) { setPage(state); setHeartbeat(state.workerSeenAt); }
    }).catch(reason => { if (live) setError(readableError(reason)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  },[request]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setFeedback('');
    try { await action(); }
    catch (reason) { setError(readableError(reason)); }
    finally { setBusy(false); }
  };

  function save(event: FormEvent) {
    event.preventDefault();
    const content = BroadcastContentSchema.safeParse(fields).data;
    if (!content) { setError('Enter a title of up to 80 characters and a message of up to 240 characters.'); return; }
    void run(async () => {
      const saved = editor
        ? await request<Broadcast>('/broadcasts/' + editor.id,'PATCH',{ version: editor.version,content })
        : await request<Broadcast>('/broadcasts','POST',{ id: draftId,content });
      setEditor(saved);
      setPreview(saved);
      setSendAt(saved.scheduledFor ? timeInput(saved.scheduledFor) : '');
      setFeedback('Saved. Review the preview before sending.');
      await refresh();
    });
  }
  function send(mode: 'now' | 'scheduled') {
    if (!preview || preview.title !== fields.title.trim() || preview.body !== fields.body.trim()) return;
    if (mode === 'now' && !window.confirm('Send this announcement to all Scanner users now?')) return;
    if (mode === 'scheduled' && !sendAt) { setError('Choose a date and time in Myanmar.'); return; }
    void run(async () => {
      await request('/broadcasts/' + preview.id + '/schedule','POST',{
        mode,version: preview.version,...(mode === 'scheduled' && { localTime: sendAt }),
      });
      setFeedback(mode === 'now' ? 'Queued to send now.' : 'Broadcast scheduled.');
      setEditor(undefined);
      setDraftId(crypto.randomUUID());
      setPreview(undefined);
      setFields(empty);
      setSendAt('');
      await refresh();
    });
  }
  const workerOnline = heartbeat && Date.now() - Date.parse(heartbeat) < 90_000;
  const oldestDue = page.items.filter(item => item.state === 'queued' && !item.publishedAt
    && item.scheduledFor && Date.parse(item.scheduledFor) < Date.now()).map(item => Date.parse(item.scheduledFor!))
    .reduce((oldest,time) => Math.min(oldest,time),Infinity);
  const matchesPreview = preview?.title === fields.title.trim() && preview.body === fields.body.trim();

  return <>
    <header className="page-head">
      <div><h1>Notifications</h1><p>Send Burmese announcements to Scanner users.</p></div>
      <button className="secondary" disabled={busy} onClick={() => void run(refresh)}>Refresh status</button>
    </header>
    {error && <p role="alert" className="message error">{error}</p>}
    {feedback && <p role="status" className="message">{feedback}</p>}
    {!loading && !workerOnline && <p className="message warning">Notification worker is offline or hasn’t checked in. Queued broadcasts are saved.</p>}
    {Number.isFinite(oldestDue) && <p className="message warning">The oldest overdue broadcast on this page was scheduled for {myanmarTime(new Date(oldestDue).toISOString())} (Myanmar).</p>}
    <section className="compose">
      <form className="card editor" onSubmit={save}>
        <h2>{editor ? 'Edit broadcast' : 'New broadcast'}</h2>
        <label>Title<input required value={fields.title} lang="my" placeholder="အသိပေးချက်"
          onChange={event => setFields({ ...fields,title: event.target.value })} /></label>
        <label>Message<textarea required value={fields.body} rows={4} lang="my" placeholder="ပေးပို့လိုတဲ့ စာကို ရေးပါ"
          onChange={event => setFields({ ...fields,body: event.target.value })} /></label>
        <p className="field-note">{[...fields.body.trim()].length} / 240 characters</p>
        <div className="actions">
          <button disabled={busy}>Save and preview</button>
          {editor && <button type="button" className="secondary" onClick={() => {
            setEditor(undefined); setDraftId(crypto.randomUUID()); setPreview(undefined); setFields(empty); setSendAt('');
          }}>New draft</button>}
        </div>
      </form>
      <section className="card preview">
        <h2>Phone preview</h2>
        <div className="phone-alert">
          <span className="app-mark" aria-hidden="true">S</span>
          <div><small>Scanner</small><strong lang="my">{fields.title || 'အသိပေးချက်'}</strong>
            <p lang="my">{fields.body || 'သင့်စာတိုကို ဤနေရာမှာ မြင်ရပါမယ်။'}</p></div>
        </div>
        <p className="field-note">All active users can read this in Scanner. Devices with alerts enabled can receive a push.</p>
        <label>Send date and time (Myanmar, UTC+6:30)<input type="datetime-local" value={sendAt}
          onChange={event => setSendAt(event.target.value)} /></label>
        <p className="field-note">Scheduled alerts can arrive late if the server is asleep.</p>
        <div className="actions">
          <button disabled={busy || !matchesPreview} onClick={() => send('now')}>Send now</button>
          <button className="secondary" disabled={busy || !matchesPreview || !sendAt} onClick={() => send('scheduled')}>Schedule</button>
        </div>
      </section>
    </section>
    <section className="card broadcasts">
      <h2>Broadcasts</h2>
      {loading ? <p>Loading broadcasts…</p> : !page.items.length ? <p>No broadcasts yet.</p> : page.items.map(item => {
        const status = statusName(item);
        return <article className="broadcast" key={item.id}>
          <div className="broadcast-title"><h3 lang="my">{item.title}</h3><span className={'state ' + status.toLowerCase()}>{status}</span></div>
          <p lang="my">{item.body}</p>
          {item.scheduledFor && <p className="field-note">Scheduled {myanmarTime(item.scheduledFor)} (Myanmar)</p>}
          {item.publishedAt && <>
            <p className="field-note">Published {myanmarTime(item.publishedAt)} (Myanmar)</p>
            <dl className="counts">
              <div><dt>Push service accepted</dt><dd>{item.counts.accepted ?? 0}</dd></div>
              <div><dt>Pending</dt><dd>{(item.counts.pending ?? 0) + (item.counts.sending ?? 0)}</dd></div>
              <div><dt>Skipped</dt><dd>{item.counts.skipped ?? 0}</dd></div>
              <div><dt>Expired</dt><dd>{item.counts.expired ?? 0}</dd></div>
              <div><dt>Failed</dt><dd>{item.counts.failed ?? 0}</dd></div>
            </dl>
          </>}
          {!item.publishedAt && item.state !== 'cancelled' && <div className="actions compact">
            <button className="secondary" disabled={busy} onClick={() => {
              setEditor(item); setFields({ title: item.title,body: item.body });
              setPreview(item); setSendAt(item.scheduledFor ? timeInput(item.scheduledFor) : '');
              window.scrollTo({ top: 0,behavior: 'instant' });
            }}>Edit</button>
            {item.state === 'queued' && <button className="secondary" disabled={busy} onClick={() => {
              if (window.confirm('Cancel the scheduled broadcast?')) void run(async () => {
                try {
                  await request('/broadcasts/' + item.id + '/cancel','POST',{ version: item.version });
                } catch (reason) {
                  if (reason instanceof RequestError && reason.status === 409) await refresh();
                  throw reason;
                }
                if (preview?.id === item.id) { setEditor(undefined); setDraftId(crypto.randomUUID()); setPreview(undefined); setFields(empty); setSendAt(''); }
                setFeedback('Broadcast cancelled.');
                await refresh();
              });
            }}>Cancel send</button>}
          </div>}
        </article>;
      })}
      {page.next && <button className="secondary" disabled={busy} onClick={() => void run(async () => {
        const next = await request<Page<Broadcast>>('/broadcasts?after=' + page.next);
        setPage({ items: [...page.items,...next.items],next: next.next });
      })}>Load more</button>}
    </section>
  </>;
}
