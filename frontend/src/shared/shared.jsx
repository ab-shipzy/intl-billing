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


// ===== Weather mood (ported from ShipzyCart FTL) =====
export const WEATHER_THEMES = {
  hot: { gradient: 'linear-gradient(135deg, #fff5e6 0%, #ffe5c4 50%, #ffd194 100%)', label: 'Hot', emoji: '🔥', particles: 'heat' },
  warm: { gradient: 'linear-gradient(135deg, #fef9e7 0%, #fff5d6 50%, #ffe9a8 100%)', label: 'Warm Sun', emoji: '☀️', particles: 'sun' },
  mild: { gradient: 'linear-gradient(135deg, #ecfdf5 0%, #e0f2fe 50%, #e6f1ff 100%)', label: 'Mild', emoji: '🌤️', particles: 'breeze' },
  cold: { gradient: 'linear-gradient(135deg, #e0f2fe 0%, #cce4ff 50%, #b5d2f5 100%)', label: 'Cold', emoji: '❄️', particles: 'frost' },
  rainy: { gradient: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 50%, #94a3b8 100%)', label: 'Rainy', emoji: '🌧️', particles: 'rain' },
  stormy: { gradient: 'linear-gradient(135deg, #cbd5e1 0%, #94a3b8 50%, #64748b 100%)', label: 'Stormy', emoji: '⛈️', particles: 'rain' },
  snowy: { gradient: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)', label: 'Snow', emoji: '❄️', particles: 'snow' },
  fog: { gradient: 'linear-gradient(135deg, #e5e7eb 0%, #d1d5db 50%, #9ca3af 100%)', label: 'Foggy', emoji: '🌫️', particles: 'fog' },
  'clear-night': { gradient: 'linear-gradient(135deg, #1e293b 0%, #334155 50%, #475569 100%)', label: 'Clear Night', emoji: '🌙', particles: 'stars' }
};

export function classifyWeather(temp, code, isDay) {
  if (code >= 95) return 'stormy';
  if (code >= 71 && code <= 86) return 'snowy';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rainy';
  if (code === 45 || code === 48) return 'fog';
  if (temp >= 35) return 'hot';
  if (temp >= 28) return isDay === 0 ? 'clear-night' : 'warm';
  if (temp >= 18) return isDay === 0 ? 'clear-night' : 'mild';
  return 'cold';
}

const WKEY = 'szc_weather';
function readW() { try { return JSON.parse(localStorage.getItem(WKEY) || 'null') || {}; } catch (e) { return {}; } }
function writeW(p) { try { localStorage.setItem(WKEY, JSON.stringify(p)); } catch (e) {} }

export function useWeatherMood() {
  const [st, setSt] = useState(readW);
  const persist = next => { setSt(next); writeW(next); };

  const fetchWeather = async (lat, lng) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,is_day&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('weather fetch failed');
    const c = (await res.json()).current || {};
    return { temp: Number(c.temperature_2m ?? 0), code: Number(c.weather_code ?? 0), isDay: Number(c.is_day ?? 1), fetchedAt: Date.now() };
  };

  useEffect(() => {
    if (!st.enabled || !st.coords) return;
    if (st.weather && Date.now() - st.weather.fetchedAt < 30 * 60e3) return;
    fetchWeather(st.coords.lat, st.coords.lng).then(weather => persist({ ...readW(), weather })).catch(() => {});
  }, []);

  const toggle = () => {
    if (st.enabled) { persist({ ...st, enabled: false }); return; }
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async pos => {
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      try {
        const weather = await fetchWeather(coords.lat, coords.lng);
        persist({ enabled: true, coords, weather });
      } catch (e) { persist({ enabled: true, coords }); }
    }, () => {});
  };

  const mood = st.enabled && st.weather ? classifyWeather(st.weather.temp, st.weather.code, st.weather.isDay) : null;
  return { mood, theme: mood ? WEATHER_THEMES[mood] : null, temp: st.weather ? st.weather.temp : null, enabled: !!st.enabled, toggle };
}

export function WeatherMoodBackground({ mood }) {
  const reduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!mood || !WEATHER_THEMES[mood]) return null;
  const theme = WEATHER_THEMES[mood];
  const particles = () => {
    if (reduced) return null;
    switch (theme.particles) {
      case 'rain': return <div className="weather-rain">{Array.from({ length: 60 }).map((_, i) => <span key={i} style={{ left: `${(i * 1.7) % 100}%`, animationDelay: `${(i * 0.13) % 2}s`, animationDuration: `${0.7 + (i % 5) * 0.15}s` }} />)}</div>;
      case 'snow': return <div className="weather-snow">{Array.from({ length: 40 }).map((_, i) => <span key={i} style={{ left: `${(i * 2.5) % 100}%`, animationDelay: `${(i * 0.4) % 8}s`, animationDuration: `${6 + (i % 4) * 1.5}s`, fontSize: `${10 + (i % 3) * 4}px` }}>❄</span>)}</div>;
      case 'stars': return <div className="weather-stars">{Array.from({ length: 50 }).map((_, i) => <span key={i} style={{ left: `${(i * 2 + i % 7) % 100}%`, top: `${(i * 5 + (i % 11) * 3) % 90}%`, animationDelay: `${(i * 0.2) % 4}s` }} />)}</div>;
      case 'heat': return <div className="weather-heat">{Array.from({ length: 8 }).map((_, i) => <span key={i} style={{ left: `${10 + i * 11}%`, animationDelay: `${i * 0.4}s`, animationDuration: `${4 + i % 3}s` }} />)}</div>;
      case 'sun': return <div className="weather-sun" />;
      case 'frost': return <div className="weather-frost">{Array.from({ length: 18 }).map((_, i) => <span key={i} style={{ left: `${(i * 5.5) % 100}%`, top: `${(i * 7 + (i % 5) * 9) % 90}%`, animationDelay: `${(i * 0.3) % 4}s` }} />)}</div>;
      case 'breeze': return <div className="weather-breeze">{Array.from({ length: 6 }).map((_, i) => <span key={i} style={{ top: `${12 + i * 14}%`, animationDelay: `${i * 1.1}s`, animationDuration: `${7 + i % 3}s` }} />)}</div>;
      case 'fog': return <div className="weather-fog" />;
      default: return null;
    }
  };
  return (
    <div className="weather-mood-bg" aria-hidden="true">
      <div className="weather-gradient" style={{ background: theme.gradient }} />
      {particles()}
    </div>
  );
}

export function WeatherChip() {
  const w = useWeatherMood();
  return (
    <>
      <button className="weatherchip" onClick={w.toggle} title={w.enabled ? 'Weather mood on — click to turn off' : 'Turn on weather mood'}>
        {w.enabled && w.theme ? `${w.theme.emoji} ${w.temp != null ? Math.round(w.temp) + '°' : w.theme.label}` : '🌤️ Mood'}
      </button>
      {w.enabled && <WeatherMoodBackground mood={w.mood} />}
    </>
  );
}

export function Avatar({ name }) {
  return <div className="avatar" title={name}>{(name || '?').trim().charAt(0).toUpperCase()}</div>;
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
