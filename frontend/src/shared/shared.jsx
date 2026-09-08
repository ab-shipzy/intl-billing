import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import logoMark from '../assets/logo-mark.png';

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

export function Spinner({ size = 28, pulse = false }) {
  return (
    <span className="shipzy-spin-wrap" style={{ width: size, height: size }} role="status" aria-label="Loading">
      <span className="shipzy-spin">
        <img src={logoMark} alt="" width={size} height={size} className={pulse ? 'shipzy-pulse' : ''}
          style={{ display: 'block', objectFit: 'contain', width: size, height: size }} />
      </span>
    </span>
  );
}

export function BootLoader() {
  return (
    <div className="splash">
      <Spinner size={84} pulse />
      <div className="ltext">Loading <span>ShipzyCart</span>…</div>
    </div>
  );
}

export function Splash({ name }) {
  const [fade, setFade] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFade(true), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={'splash' + (fade ? ' fade' : '')}>
      <Spinner size={84} pulse />
      <div className="wel">Welcome, <b>{name}</b> 👋</div>
    </div>
  );
}

export function BrandBlock({ subtitle }) {
  return (
    <div className="brandblock">
      <img src={logoMark} alt="ShipzyCart" />
      <div>
        <h1>Shipzy<span>Cart</span></h1>
        <div className="sub">{subtitle}</div>
      </div>
    </div>
  );
}

export function LoginClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  return (
    <div className="login-clock" aria-hidden="true">
      <div className="time">{hh}:{mm}<span className="sec">:{ss}</span></div>
      <div className="date">{dateStr}</div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="searchwrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
      <input value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}

export function LoginHead({ subtitle }) {
  return (
    <div className="loginhead">
      <div className="dots" />
      <div className="row">
        <img src={logoMark} alt="" />
        <div>
          <div className="t">ShipzyCart</div>
          <div className="s">{subtitle}</div>
        </div>
      </div>
    </div>
  );
}

export const KYC_CATEGORIES = ['IEC Certificate', 'GST Certificate', 'PAN Card', 'Aadhaar Card', 'LUT', 'AD Code Letter', 'Cancelled Cheque', 'Authorization Letter', 'Import Export Documents', 'Other'];

export function TabBar({ tabs, active, onChange }) {
  return (
    <div className="tabbar">
      {tabs.map(t => (
        <button key={t.k} className={active === t.k ? 'on' : ''} onClick={() => onChange(t.k)}>
          {t.label}{t.badge ? <span className="badge">{t.badge}</span> : null}
        </button>
      ))}
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
  const line = (...parts) => parts.filter(Boolean).join(', ');
  return (
    <>
      <div className="sumstrip">
        <div><span>Chargeable Wt</span><b>{fmt(s.chargeable_weight)} kg</b></div>
        <div><span>Amount</span><b style={{ color: 'var(--blue)' }}>₹{fmt(s.amount)}</b></div>
        <div><span>Status</span><StatusTag status={s.status} /></div>
      </div>
      <h3>Shipment</h3>
      <KV rows={[
        showCustomer ? ['Customer', `${s.customer_code} — ${s.customer_name}`] : ['Customer', undefined],
        ['AWB', <span key="a" className="mono"><b>{s.awb || '—'}</b></span>],
        ['Carrier / Service', `${s.provider || '—'}${s.service ? ' · ' + s.service : ''}`],
        ['Date', s.ship_date || '—']
      ]} />
      <h3>Route</h3>
      <KV rows={[
        ['From', line(s.from_address, s.from_country, s.from_pincode) || '—'],
        ['To', <span key="to"><b>{s.to_company || '—'}</b>{s.to_contact ? ` (Attn: ${s.to_contact})` : ''}<br />{line(s.to_address, s.to_country)}{s.to_phone ? <><br />{s.to_phone}</> : null}</span>]
      ]} />
      <h3>Invoice &amp; Terms</h3>
      <KV rows={[
        ['Invoice', `${s.invoice_no || '—'} · ${s.invoice_date || '—'}`],
        ['Value', `${s.currency} ${fmt(s.invoice_value)}`],
        ['Terms', `${s.incoterm || '—'} · ${s.export_type || '—'}`],
        ['Items', s.items_desc || '—']
      ]} />
      <h3>Boxes &amp; Weights</h3>
      <KV rows={[
        ['Boxes', (s.boxes || []).length
          ? <span key="bx">{s.boxes.map((b, i) => <span key={i}>{b.count} × {b.length || 0}×{b.width || 0}×{b.height || 0} cm @ {b.weight} kg (÷{b.divisor})<br /></span>)}</span>
          : '—'],
        ['Actual', fmt(s.actual_weight) + ' kg'],
        ['Volumetric', fmt(s.volumetric_weight) + ' kg'],
        ['Chargeable', <b key="c" className="mono">{fmt(s.chargeable_weight)} kg</b>],
        ['Rate', <span key="r" className="mono">₹{fmt(s.rate)}/kg</span>]
      ]} />
      {s.notes ? <><h3>Notes</h3><p style={{ fontSize: 13 }}>{s.notes}</p></> : null}
    </>
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
