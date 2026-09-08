import React, { useCallback, useEffect, useState } from 'react';
import { api, AuthError, fmt, fileToB64, ToastProvider, useToast, BootLoader, BrandBlock, LoginHead, LoginClock, Spinner, WeatherChip, Avatar, Sidebar, HeaderClock, Spotlight, StatusTag, ShipmentDetail, DocList, Drawer, TabBar, KYC_CATEGORIES, Field } from '../shared/shared.jsx';

const PAGES = { shipments: '/', kyc: '/kyc', rates: '/rates' };
function pageFromPath() {
  const p = window.location.pathname;
  if (p === '/kyc') return 'kyc';
  if (p === '/rates') return 'rates';
  return 'shipments';
}

function useLive(eventName, onEvent) {
  const [live, setLive] = useState(false);
  useEffect(() => {
    const es = new EventSource('/api/my/events');
    es.addEventListener(eventName, onEvent);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    return () => es.close();
  }, [eventName, onEvent]);
  return live;
}

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
    <div className="loginpage">
      <LoginClock />
      <div className="logincard">
        <LoginHead subtitle="Customer Portal" />
        <div className="body grid">
          <div><label>Customer Code</label>
            <input className="mono" value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. SZC-ACME" autoCapitalize="characters" /></div>
          <div><label>Password</label>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} /></div>
          <button className="btn login" onClick={submit} disabled={busy || !code.trim() || !pw}>{busy && <Spinner size={16} />}{busy ? 'Signing in…' : 'Sign in'}</button>
        </div>
      </div>
    </div>
  );
}

// ---------- shipments page ----------
function ShipmentsPage() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [detail, setDetail] = useState(null);
  const [drawerTab, setDrawerTab] = useState('details');

  const load = useCallback(() => {
    api('/api/my/shipments').then(setRows).catch(e => { setRows(r => r || []); toast(e.message, true); });
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = sessionStorage.getItem('szc_open_ship');
    if (id) { sessionStorage.removeItem('szc_open_ship'); open(Number(id)); }
  }, []);
  const live = useLive('shipments', load);

  const open = async id => {
    try { setDetail(await api('/api/my/shipments/' + id)); setDrawerTab('details'); }
    catch (e) { toast(e.message, true); }
  };

  const totW = (rows || []).reduce((a, s) => a + (s.chargeable_weight || 0), 0);
  const totA = (rows || []).reduce((a, s) => a + (s.amount || 0), 0);

  return (
    <>
      <div className="stats">
        <div className="stat"><div className="v">{rows ? rows.length : '…'}</div><div className="l">Shipments</div></div>
        <div className="stat"><div className="v">{fmt(totW)}</div><div className="l">Total Chg. Wt (kg)</div></div>
        <div className="stat"><div className="v">₹{fmt(totA)}</div><div className="l">Total Billed</div></div>
        <div className="stat"><div className="v" style={{ color: live ? '#0b7d6d' : '#94a3b8', fontSize: 14 }}>{live ? '● Live' : '○ Offline'}</div><div className="l">Updates</div></div>
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
      {detail && (
        <Drawer onClose={() => setDetail(null)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>{detail.awb || 'Shipment #' + detail.id}</h2>
            <button className="btn ghost" onClick={() => setDetail(null)}>✕</button>
          </div>
          <TabBar
            tabs={[{ k: 'details', label: 'Details' }, { k: 'docs', label: 'Documents', badge: (detail.documents || []).length || null }]}
            active={drawerTab} onChange={setDrawerTab}
          />
          {drawerTab === 'details' && <ShipmentDetail s={detail} />}
          {drawerTab === 'docs' && <DocList docs={detail.documents} />}
        </Drawer>
      )}
    </>
  );
}

// ---------- KYC page ----------
function KycPage() {
  const toast = useToast();
  const [docs, setDocs] = useState(null);
  const [category, setCategory] = useState(KYC_CATEGORIES[0]);
  const [remark, setRemark] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api('/api/my/kyc').then(setDocs).catch(e => { setDocs(d => d || []); toast(e.message, true); });
  }, []);
  useEffect(() => { load(); }, [load]);
  useLive('kyc', load);

  const upload = async () => {
    if (!files.length) return toast('Choose files first', true);
    setBusy(true);
    try {
      const arr = [];
      for (const f of files) {
        if (f.size > 15 * 1024 * 1024) throw new Error(f.name + ' exceeds 15 MB');
        arr.push({ name: f.name, data: await fileToB64(f) });
      }
      await api('/api/my/kyc', { method: 'POST', body: { category, remark, files: arr } });
      setFiles([]); setRemark('');
      document.getElementById('kycFiles').value = '';
      load();
      toast('Documents uploaded');
    } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="card">
        <h2>Upload KYC Document</h2>
        <div className="grid g3">
          <Field label="Category">
            <select value={category} onChange={e => setCategory(e.target.value)}>
              {KYC_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Remark"><input value={remark} onChange={e => setRemark(e.target.value)} placeholder="Optional note" /></Field>
          <Field label="Files"><input type="file" id="kycFiles" multiple onChange={e => setFiles([...e.target.files])} /></Field>
        </div>
        <div className="foot" style={{ marginTop: 10 }}>
          <button className="btn" onClick={upload} disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button>
        </div>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table>
          <thead><tr><th>Date</th><th>Category</th><th>Document</th><th>Remark</th><th>Uploaded By</th><th>Size</th></tr></thead>
          <tbody>
            {docs === null && <tr><td colSpan={6} className="empty">Loading…</td></tr>}
            {docs && docs.length === 0 && <tr><td colSpan={6} className="empty">No KYC documents yet</td></tr>}
            {docs && docs.map(d => (
              <tr key={d.id}>
                <td>{(d.uploaded_at || '').slice(0, 10)}</td>
                <td><span className="tag">{d.category}</span></td>
                <td><a href={`/api/kyc/${d.id}/download`} style={{ color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>📄 {d.original_name}</a></td>
                <td>{d.remark}</td>
                <td><span className={'tag ' + (d.uploaded_by === 'customer' ? 'mint' : 'gray')}>{d.uploaded_by === 'customer' ? 'You' : 'ShipzyCart'}</span></td>
                <td>{(d.size / 1024).toFixed(0)} KB</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------- spot rates page (view only) ----------
function RatesPage() {
  const toast = useToast();
  const [rows, setRows] = useState(null);

  const load = useCallback(() => {
    api('/api/my/spot-rates').then(setRows).catch(e => { setRows(r => r || []); toast(e.message, true); });
  }, []);
  useEffect(() => { load(); }, [load]);
  useLive('spot', load);

  return (
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table>
        <thead><tr><th>Date</th><th>From</th><th>To</th><th>Boxes</th><th>Dimensions</th><th>Exp. Wt (kg)</th><th>Rate ₹/kg</th><th>Status</th><th>AWB</th><th>Remark</th></tr></thead>
        <tbody>
          {rows === null && <tr><td colSpan={10} className="empty">Loading…</td></tr>}
          {rows && rows.length === 0 && <tr><td colSpan={10} className="empty">No spot rates given yet</td></tr>}
          {rows && rows.map(r => (
            <tr key={r.id}>
              <td>{(r.created_at || '').slice(0, 10)}</td>
              <td>{[r.from_state, r.from_country].filter(Boolean).join(', ')}</td>
              <td>{[r.to_address, r.to_country].filter(Boolean).join(', ')}</td>
              <td>{r.box_count || '—'}</td>
              <td>{r.dimensions || '—'}</td>
              <td className="amt">{fmt(r.expected_weight)}</td>
              <td className="amt"><b>₹{fmt(r.rate)}</b></td>
              <td><span className={'tag ' + (r.status === 'Executed' ? 'mint' : r.status === 'Expired' ? 'gray' : '')}>{r.status}</span></td>
              <td className="mono">{r.awb || '—'}</td>
              <td>{r.remark || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- shell ----------
function Dashboard({ me, onLogout }) {
  const page = pageFromPath();
  const NAV = [['shipments', 'Shipments', '📦', 'box'], ['kyc', 'KYC Docs', '🪪', 'idcard'], ['rates', 'Spot Rates', '⚡', 'zap']];
  const spotlightSources = async () => {
    const items = NAV.map(([k, l, g]) => ({ group: 'Pages', glyph: g, label: l, action: () => { window.location.href = PAGES[k]; } }));
    try {
      const [ships, kyc, rates] = await Promise.all([api('/api/my/shipments'), api('/api/my/kyc'), api('/api/my/spot-rates')]);
      ships.forEach(s2 => items.push({
        group: 'Shipments', glyph: '📦', label: s2.awb || '#' + s2.id,
        sub: `${s2.to_company || ''} ${s2.to_country || ''} · ₹${fmt(s2.amount)}`,
        action: () => { sessionStorage.setItem('szc_open_ship', s2.id); window.location.href = '/'; }
      }));
      kyc.forEach(d2 => items.push({
        group: 'KYC Docs', glyph: '🪪', label: d2.original_name, sub: d2.category,
        action: () => { window.location.href = '/kyc'; }
      }));
      rates.forEach(r2 => items.push({
        group: 'Spot Rates', glyph: '⚡', label: `₹${fmt(r2.rate)}/kg · ${r2.to_country || ''}`, sub: r2.status,
        action: () => { window.location.href = '/rates'; }
      }));
    } catch (e) {}
    return items;
  };
  const label = (NAV.find(t => t[0] === page) || NAV[0])[1];
  return (
    <div className="layout">
      <Sidebar subtitle="Customer Portal" activeKey={page}
        items={NAV.map(([k, l, g, ic]) => ({ key: k, href: PAGES[k], label: l, icon: ic }))} />
      <div className="content">
        <div className="topbar">
          <div className="pagetitle">{label}</div>
          <Spotlight getSources={spotlightSources} />
          <WeatherChip />
          <HeaderClock />
          <Avatar name={me.name} />
          <button className="out" onClick={onLogout}>Logout</button>
        </div>
        <main className="shipzy-page-in">
          {page === 'shipments' && <ShipmentsPage />}
          {page === 'kyc' && <KycPage />}
          {page === 'rates' && <RatesPage />}
        </main>
      </div>
    </div>
  );
}

function App() {
  const [me, setMe] = useState(undefined);

  useEffect(() => {
    api('/api/me?p=customer').then(m => setMe(m.role === 'customer' ? m : null)).catch(() => setMe(null));
  }, []);

  const onLoggedIn = r => {
    setMe({ role: 'customer', name: r.name, code: r.code });
  };
  const onLogout = async () => { try { await api('/api/logout', { method: 'POST' }); } catch (e) {} window.location.href = '/'; };

  if (me === undefined) return <BootLoader />;
  return (
    <>
      {me ? <Dashboard me={me} onLogout={onLogout} /> : <Login onLoggedIn={onLoggedIn} />}
    </>
  );
}

export default function Root() {
  return <ToastProvider><App /></ToastProvider>;
}
