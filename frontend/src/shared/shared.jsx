import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

// ---------- api ----------
export class AuthError extends Error {}

export async function api(url, opts = {}) {
  const r = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (r.status === 401) throw new AuthError('unauthorized');
  let j = null;
  try { j = await r.json(); } catch (e) { throw new Error('Bad server response'); }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}

export const fmt = n => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function computeWeights(boxes) {
  let actual = 0, vol = 0, count = 0;
  (boxes || []).forEach(b => {
    const n = Number(b.count) || 1;
    count += n;
    actual += n * (Number(b.weight) || 0);
    vol += n * ((Number(b.length) || 0) * (Number(b.width) || 0) * (Number(b.height) || 0)) / (Number(b.divisor) || 5000);
  });
  return { actual: +actual.toFixed(2), vol: +vol.toFixed(2), chargeable: +Math.max(actual, vol).toFixed(2), count };
}

export const fileToB64 = f => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result.split(',')[1]);
  r.onerror = () => rej(new Error('read failed'));
  r.readAsDataURL(f);
});

// ---------- toast ----------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const toast = useCallback((text, isErr = false) => {
    setMsg({ text, isErr });
    setTimeout(() => setMsg(null), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {msg && <div className={'toast' + (msg.isErr ? ' err' : '')}>{msg.text}</div>}
    </ToastCtx.Provider>
  );
}

// ---------- ui primitives ----------
export function Field({ label, className, children }) {
  return <div className={className}><label>{label}</label>{children}</div>;
}

export function Modal({ title, narrow, onClose, children }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className={'modal' + (narrow ? ' narrow' : '')}>
        <h2>{title}</h2>
        {children}
      </div>
    </>
  );
}

export function Drawer({ onClose, children }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="drawer">{children}</div>
    </>
  );
}

export function Splash({ name }) {
  const [fade, setFade] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFade(true), 1600);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={'splash' + (fade ? ' fade' : '')}>
      <div className="logo">Shipzy<span>Cart</span></div>
      <div className="wel">Welcome, <b>{name}</b> 👋</div>
      <div className="bar"><i /></div>
    </div>
  );
}

export function StatusTag({ status }) {
  const cls = status === 'Paid' ? ' mint' : status === 'Booked' ? ' gray' : '';
  return <span className={'tag' + cls}>{status}</span>;
}

export function KV({ rows }) {
  return (
    <dl className="kv">
      {rows.filter(([, v]) => v !== undefined).map(([k, v]) => (
        <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>
      ))}
    </dl>
  );
}

export function ShipmentDetail({ s, showCustomer }) {
  return (
    <KV rows={[
      showCustomer ? ['Customer', `${s.customer_code} — ${s.customer_name}`] : ['Customer', undefined],
      ['Carrier / Service', `${s.provider || '—'}${s.service ? ' · ' + s.service : ''}`],
      ['Date / Status', `${s.ship_date || '—'} · ${s.status}`],
      ['From', `${s.from_address || ''}, ${s.from_country || ''} ${s.from_pincode || ''}`],
      ['To', <span key="to">{s.to_company}{s.to_contact ? ` (Attn: ${s.to_contact})` : ''}<br />{s.to_address}, {s.to_country}<br />{s.to_phone}</span>],
      ['Invoice', `${s.invoice_no || '—'} · ${s.invoice_date || '—'} · ${s.currency} ${fmt(s.invoice_value)}`],
      ['Terms', `${s.incoterm || '—'} · ${s.export_type || '—'}`],
      ['Items', s.items_desc || '—'],
      ['Boxes', (s.boxes || []).length
        ? <span key="bx">{s.boxes.map((b, i) => <span key={i}>{b.count} × {b.length}×{b.width}×{b.height} cm @ {b.weight} kg (÷{b.divisor})<br /></span>)}</span>
        : '—'],
      ['Weights', <span key="w" className="mono">Actual {fmt(s.actual_weight)} · Vol {fmt(s.volumetric_weight)} · <b>Chg {fmt(s.chargeable_weight)} kg</b></span>],
      ['Billing', <span key="b" className="mono">₹{fmt(s.rate)}/kg → <b style={{ color: 'var(--blue)' }}>₹{fmt(s.amount)}</b></span>],
      s.notes ? ['Notes', s.notes] : ['Notes', undefined]
    ]} />
  );
}

export function DocList({ docs, onDelete }) {
  if (!docs || !docs.length) return <div style={{ color: '#94a3b8', fontSize: 13 }}>No documents yet</div>;
  return docs.map(d => (
    <div className="doc" key={d.id}>
      <a href={`/api/documents/${d.id}/download`}>📄 {d.original_name}</a>
      <span style={{ color: '#94a3b8', fontSize: 11 }}>{(d.size / 1024).toFixed(0)} KB</span>
      {onDelete && <button className="btn sm danger" onClick={() => onDelete(d.id)}>✕</button>}
    </div>
  ));
}
