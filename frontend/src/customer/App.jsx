import React, { useCallback, useEffect, useState } from 'react';
import { api, AuthError, fmt, ToastProvider, useToast, Splash, StatusTag, ShipmentDetail, DocList, Drawer } from '../shared/shared.jsx';

function Login({ onLoggedIn }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!code.trim() || !pw) return toast('Enter customer code and password', true);
    setBusy(true);
    try {
      const r = await api('/api/login', { method: 'POST', body: { role: 'customer', code, password: pw } });
      onLoggedIn(r);
    } catch (e) {
      toast(e instanceof AuthError ? 'Invalid customer code or password' : e.message, true);
    } finally { setBusy(false); }
  };
  return (
    <div className="loginwrap">
      <div className="card">
        <h2>Shipzy<span style={{ color: 'var(--blue)' }}>Cart</span> · Customer Portal</h2>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>Track your international shipment billing</p>
        <div className="grid">
          <div><label>Customer Code</label>
            <input className="mono" value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. SZC-ACME" autoCapitalize="characters" /></div>
          <div><label>Password</label>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} /></div>
          <button className="btn" onClick={submit} disabled={busy}>{busy ? 'Logging in…' : 'Login'}</button>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ me, onLogout }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [detail, setDetail] = useState(null);
  const [live, setLive] = useState(false);

  const load = useCallback(() => {
    api('/api/my/shipments').then(setRows).catch(e => { setRows(r => r || []); toast(e.message, true); });
  }, []);

  useEffect(() => { load(); }, [load]);

  // live updates: refresh instantly when the backend saves a shipment on this customer's code
  useEffect(() => {
    const es = new EventSource('/api/my/events');
    es.addEventListener('shipments', load);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    return () => es.close();
  }, [load]);

  const open = async id => {
    try { setDetail(await api('/api/my/shipments/' + id)); }
    catch (e) { toast(e.message, true); }
  };

  const totW = (rows || []).reduce((a, s) => a + (s.chargeable_weight || 0), 0);
  const totA = (rows || []).reduce((a, s) => a + (s.amount || 0), 0);

  return (
    <>
      <header>
        <h1>Shipzy<span>Cart</span></h1>
        <div className="right">
          {live && <span className="tag mint">● Live</span>}
          <span className="mono">{me.code} · {me.name}</span>
          <button className="btn ghost dark" onClick={onLogout}>Logout</button>
        </div>
      </header>
      <main>
        <div className="stats">
          <div className="stat"><div className="v">{rows ? rows.length : '…'}</div><div className="l">Shipments</div></div>
          <div className="stat"><div className="v">{fmt(totW)}</div><div className="l">Total Chg. Wt (kg)</div></div>
          <div className="stat"><div className="v">₹{fmt(totA)}</div><div className="l">Total Billed</div></div>
        </div>
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table>
            <thead><tr><th>Date</th><th>AWB</th><th>Carrier</th><th>From</th><th>To</th><th>Boxes</th><th>Weight (kg)</th><th>Rate</th><th>Amount ₹</th><th>Status</th></tr></thead>
            <tbody>
              {rows === null && <tr><td colSpan={10} className="empty">Loading…</td></tr>}
              {rows && rows.length === 0 && <tr><td colSpan={10} className="empty">No shipments yet</td></tr>}
              {rows && rows.map(s => (
                <tr className="row" key={s.id} onClick={() => open(s.id)}>
                  <td>{s.ship_date}</td>
                  <td className="mono"><b>{s.awb}</b></td>
                  <td>{s.provider}</td>
                  <td>{s.from_country}{s.from_pincode ? ' · ' + s.from_pincode : ''}</td>
                  <td>{s.to_company}{s.to_country ? ' · ' + s.to_country : ''}</td>
                  <td>{s.box_count}</td>
                  <td className="amt">{fmt(s.chargeable_weight)}</td>
                  <td className="amt">{fmt(s.rate)}</td>
                  <td className="amt">₹{fmt(s.amount)}</td>
                  <td><StatusTag status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
      {detail && (
        <Drawer onClose={() => setDetail(null)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>{detail.awb || 'Shipment #' + detail.id}</h2>
            <button className="btn ghost" onClick={() => setDetail(null)}>✕</button>
          </div>
          <ShipmentDetail s={detail} />
          <h3>Documents</h3>
          <DocList docs={detail.documents} />
        </Drawer>
      )}
    </>
  );
}

function App() {
  const [me, setMe] = useState(undefined); // undefined = checking, null = logged out
  const [splash, setSplash] = useState(null);

  useEffect(() => {
    api('/api/me?p=customer').then(m => setMe(m.role === 'customer' ? m : null)).catch(() => setMe(null));
  }, []);

  const onLoggedIn = r => {
    setSplash(r.name || r.code);
    setTimeout(() => { setMe({ role: 'customer', name: r.name, code: r.code }); }, 1500);
    setTimeout(() => setSplash(null), 2200);
  };
  const onLogout = async () => { try { await api('/api/logout', { method: 'POST' }); } catch (e) {} location.reload(); };

  if (me === undefined) return (
    <div className="splash">
      <div className="logo">Shipzy<span>Cart</span></div>
      <div className="bar"><i /></div>
    </div>
  );
  return (
    <>
      {me ? <Dashboard me={me} onLogout={onLogout} /> : (!splash && <Login onLoggedIn={onLoggedIn} />)}
      {splash && <Splash name={splash} />}
    </>
  );
}

export default function Root() {
  return <ToastProvider><App /></ToastProvider>;
}
