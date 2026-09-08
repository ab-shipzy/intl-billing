import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, AuthError, fmt, computeWeights, fileToB64, ToastProvider, useToast, Splash, StatusTag, ShipmentDetail, DocList, Modal, Drawer, Field } from '../shared/shared.jsx';

const INCOTERMS = ['', 'EXW', 'FOB', 'CIF', 'CFR', 'DAP', 'DDP', 'FCA'];
const EXPORT_TYPES = ['', 'LUT', 'IGST', 'Non-commercial'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'INR'];
const STATUSES = ['Booked', 'In Transit', 'Delivered', 'Billed', 'Paid'];

// ---------- login ----------
function Login({ onLoggedIn }) {
  const toast = useToast();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!u || !p) return toast('Enter username and password', true);
    setBusy(true);
    try {
      await api('/api/login', { method: 'POST', body: { role: 'admin', username: u, password: p } });
      onLoggedIn(u);
    } catch (e) {
      toast(e instanceof AuthError ? 'Invalid credentials' : e.message, true);
    } finally { setBusy(false); }
  };
  return (
    <div className="loginwrap">
      <div className="card">
        <h2>Shipzy<span style={{ color: 'var(--blue)' }}>Cart</span> · Admin Login</h2>
        <div className="grid" style={{ marginTop: 10 }}>
          <Field label="Username"><input value={u} onChange={e => setU(e.target.value)} /></Field>
          <Field label="Password"><input type="password" value={p} onChange={e => setP(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} /></Field>
          <button className="btn" onClick={submit} disabled={busy}>{busy ? 'Logging in…' : 'Login'}</button>
        </div>
      </div>
    </div>
  );
}

// ---------- customers ----------
function CustomerForm({ cust, onSaved, onClose }) {
  const toast = useToast();
  const isEdit = !!cust;
  const [f, setF] = useState(cust || { code: '', name: '', email: '', phone: '', gstin: '', address: '', password: '', active: 1 });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const save = async () => {
    if (!f.code.trim() || !f.name.trim() || (!isEdit && !f.password)) return toast('Code, name and password are required', true);
    setBusy(true);
    try {
      if (isEdit) await api('/api/customers/' + cust.id, { method: 'PUT', body: { ...f, active: String(f.active) === '1' || f.active === true } });
      else await api('/api/customers', { method: 'POST', body: f });
      onSaved();
    } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  };
  return (
    <Modal narrow title={isEdit ? 'Edit Customer' : 'Onboard Customer'} onClose={onClose}>
      <div className="grid g2">
        <Field label="Customer Code * (login ID)"><input className="mono" value={f.code} disabled={isEdit} onChange={e => set('code', e.target.value)} placeholder="e.g. SZC-ACME" /></Field>
        <Field label="Name *"><input value={f.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Email"><input value={f.email || ''} onChange={e => set('email', e.target.value)} /></Field>
        <Field label="Phone"><input value={f.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
        <Field label="GSTIN"><input className="mono" value={f.gstin || ''} onChange={e => set('gstin', e.target.value)} /></Field>
        <Field label={'Portal Password' + (isEdit ? '' : ' *')}><input value={f.password || ''} onChange={e => set('password', e.target.value)} placeholder={isEdit ? 'Leave blank to keep current' : 'Set login password'} /></Field>
        <Field label="Address" className="span2"><textarea value={f.address || ''} onChange={e => set('address', e.target.value)} /></Field>
        <Field label="Active"><select value={String(f.active ?? 1)} onChange={e => set('active', e.target.value)}><option value="1">Yes</option><option value="0">No</option></select></Field>
      </div>
      <div className="foot">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  );
}

function CustomersTab({ customers, reload }) {
  const [editing, setEditing] = useState(null); // null | 'new' | customer
  return (
    <section>
      <div className="toolbar"><button className="btn" onClick={() => setEditing('new')}>＋ Onboard Customer</button></div>
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Email</th><th>Phone</th><th>GSTIN</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {customers.length === 0 && <tr><td colSpan={7} className="empty">No customers yet</td></tr>}
            {customers.map(c => (
              <tr key={c.id}>
                <td className="mono">{c.code}</td><td><b>{c.name}</b></td><td>{c.email}</td><td>{c.phone}</td>
                <td className="mono">{c.gstin}</td>
                <td>{c.active ? <span className="tag mint">Active</span> : <span className="tag gray">Inactive</span>}</td>
                <td><button className="btn sm ghost" onClick={() => setEditing(c)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <CustomerForm cust={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </section>
  );
}

// ---------- consignees ----------
function ConsigneeForm({ cons, customers, onSaved, onClose }) {
  const toast = useToast();
  const isEdit = !!cons;
  const [f, setF] = useState(cons || { company: '', contact: '', address: '', country: '', phone: '', email: '', customer_id: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const save = async () => {
    if (!f.company.trim()) return toast('Company is required', true);
    setBusy(true);
    try {
      const body = { ...f, customer_id: f.customer_id || null };
      if (isEdit) await api('/api/consignees/' + cons.id, { method: 'PUT', body });
      else await api('/api/consignees', { method: 'POST', body });
      onSaved();
    } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  };
  return (
    <Modal narrow title={isEdit ? 'Edit Consignee' : 'Add Consignee'} onClose={onClose}>
      <div className="grid g2">
        <Field label="Company *"><input value={f.company} onChange={e => set('company', e.target.value)} /></Field>
        <Field label="Contact Person"><input value={f.contact || ''} onChange={e => set('contact', e.target.value)} /></Field>
        <Field label="Address" className="span2"><textarea value={f.address || ''} onChange={e => set('address', e.target.value)} /></Field>
        <Field label="Country"><input value={f.country || ''} onChange={e => set('country', e.target.value)} /></Field>
        <Field label="Phone"><input value={f.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
        <Field label="Email"><input value={f.email || ''} onChange={e => set('email', e.target.value)} /></Field>
        <Field label="Link to Customer (optional)">
          <select value={f.customer_id || ''} onChange={e => set('customer_id', e.target.value)}>
            <option value="">—</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="foot">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  );
}

function ConsigneesTab({ consignees, customers, reload }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const del = async id => {
    if (!confirm('Delete consignee?')) return;
    try { await api('/api/consignees/' + id, { method: 'DELETE' }); reload(); }
    catch (e) { toast(e.message, true); }
  };
  return (
    <section>
      <div className="toolbar"><button className="btn" onClick={() => setEditing('new')}>＋ Add Consignee</button></div>
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table>
          <thead><tr><th>Company</th><th>Contact</th><th>Country</th><th>Phone</th><th>Linked Customer</th><th></th></tr></thead>
          <tbody>
            {consignees.length === 0 && <tr><td colSpan={6} className="empty">No consignees yet</td></tr>}
            {consignees.map(n => (
              <tr key={n.id}>
                <td><b>{n.company}</b></td><td>{n.contact}</td><td>{n.country}</td><td>{n.phone}</td>
                <td>{n.customer_name || '—'}</td>
                <td>
                  <button className="btn sm ghost" onClick={() => setEditing(n)}>Edit</button>{' '}
                  <button className="btn sm danger" onClick={() => del(n.id)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <ConsigneeForm cons={editing === 'new' ? null : editing} customers={customers} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </section>
  );
}

// ---------- settings ----------
function SettingsTab({ providers, services, reload }) {
  const toast = useToast();
  const [newProv, setNewProv] = useState('');
  const [svcInputs, setSvcInputs] = useState({});
  const addProv = async () => {
    if (!newProv.trim()) return;
    try { await api('/api/settings/providers', { method: 'POST', body: { name: newProv.trim() } }); setNewProv(''); reload(); }
    catch (e) { toast('Provider already exists', true); }
  };
  const delProv = async id => {
    if (!confirm('Delete provider and its services?')) return;
    await api('/api/settings/providers/' + id, { method: 'DELETE' }); reload();
  };
  const addSvc = async pid => {
    const name = (svcInputs[pid] || '').trim();
    if (!name) return;
    await api('/api/settings/services', { method: 'POST', body: { provider_id: pid, name } });
    setSvcInputs(s => ({ ...s, [pid]: '' })); reload();
  };
  const delSvc = async id => { await api('/api/settings/services/' + id, { method: 'DELETE' }); reload(); };
  return (
    <section>
      <div className="card">
        <h2>Service Providers &amp; Services</h2>
        <div className="toolbar">
          <input placeholder="New provider (e.g. FedEx)" value={newProv} onChange={e => setNewProv(e.target.value)} onKeyDown={e => e.key === 'Enter' && addProv()} />
          <button className="btn sm" onClick={addProv}>Add Provider</button>
        </div>
        {providers.map(p => (
          <div className="card" key={p.id} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <b>{p.name}</b>
              <button className="btn sm danger" onClick={() => delProv(p.id)}>✕</button>
              <input placeholder="Add service (e.g. Priority, Economy)" style={{ maxWidth: 260, marginLeft: 'auto' }}
                value={svcInputs[p.id] || ''} onChange={e => setSvcInputs(s => ({ ...s, [p.id]: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addSvc(p.id)} />
              <button className="btn sm" onClick={() => addSvc(p.id)}>Add Service</button>
            </div>
            <div style={{ marginTop: 8 }}>
              {services.filter(s => s.provider_id === p.id).map(s => (
                <span className="tag" key={s.id} style={{ marginRight: 6 }}>
                  {s.name} <a href="#" onClick={e => { e.preventDefault(); delSvc(s.id); }} style={{ color: 'inherit', textDecoration: 'none' }}>✕</a>
                </span>
              ))}
              {!services.some(s => s.provider_id === p.id) && <span className="tag gray">No services yet</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- shipment form ----------
const EMPTY_BOX = { count: 1, length: '', width: '', height: '', weight: '', divisor: 5000 };

function ShipmentForm({ ship, customers, consignees, providers, services, onSaved, onClose }) {
  const toast = useToast();
  const isEdit = !!ship;
  const [f, setF] = useState(() => ship ? { ...ship } : {
    customer_id: '', provider: '', service: '', awb: '', ship_date: new Date().toISOString().slice(0, 10), status: 'Booked',
    from_address: '', from_country: 'India', from_pincode: '',
    consignee_id: '', to_company: '', to_contact: '', to_address: '', to_country: '', to_phone: '',
    invoice_no: '', invoice_date: '', invoice_value: '', currency: 'USD', incoterm: '', export_type: '',
    items_desc: '', rate: '', amount: '', notes: ''
  });
  const [boxes, setBoxes] = useState(() => (ship && ship.boxes && ship.boxes.length) ? ship.boxes.map(b => ({ ...b })) : [{ ...EMPTY_BOX }]);
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [pdfFiles, setPdfFiles] = useState([]); // parsed PDFs, auto-attached as documents on save
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const setBox = (i, k, v) => setBoxes(bs => bs.map((b, j) => j === i ? { ...b, [k]: v } : b));

  const autofillFromPdfs = async files => {
    if (!files.length) return;
    setParsing(true);
    try {
      const { parsePdfFile } = await import('../shared/pdfextract.js');
      const { mergeParsed } = await import('../shared/labelparse.js');
      const parsed = [];
      for (const file of files) {
        const p = await parsePdfFile(file);
        if (p) parsed.push(p);
      }
      if (!parsed.length) { toast('PDF format not recognized — fill manually', true); return; }
      const mg = mergeParsed(parsed);
      setF(s => {
        const next = { ...s };
        ['awb', 'ship_date', 'provider', 'from_address', 'from_country', 'from_pincode',
         'to_company', 'to_contact', 'to_address', 'to_country', 'to_phone',
         'invoice_no', 'invoice_date', 'invoice_value', 'currency', 'incoterm', 'export_type', 'items_desc']
          .forEach(k => { if (mg[k] !== undefined && mg[k] !== '') next[k] = mg[k]; });
        return next;
      });
      if (mg.boxes && mg.boxes.length) setBoxes(mg.boxes.map(b => ({ ...b })));
      setPdfFiles(prev => [...prev, ...files]);
      toast(`Auto-filled from ${parsed.length} PDF${parsed.length > 1 ? 's' : ''} — verify before saving`);
    } catch (e) {
      toast('Parse failed: ' + e.message, true);
    } finally { setParsing(false); }
  };

  const w = useMemo(() => computeWeights(boxes), [boxes]);
  const autoAmount = f.rate ? (w.chargeable * Number(f.rate)).toFixed(2) : '';

  // recompute amount when rate or boxes change
  useEffect(() => { if (f.rate) set('amount', (w.chargeable * Number(f.rate)).toFixed(2)); }, [f.rate, w.chargeable]);

  const pickConsignee = id => {
    set('consignee_id', id);
    const n = consignees.find(x => String(x.id) === String(id));
    if (n) setF(s => ({ ...s, consignee_id: id, to_company: n.company || '', to_contact: n.contact || '', to_address: n.address || '', to_country: n.country || '', to_phone: n.phone || '' }));
  };

  const provServices = useMemo(() => {
    const p = providers.find(x => x.name === f.provider);
    return p ? services.filter(s => s.provider_id === p.id) : [];
  }, [f.provider, providers, services]);

  const save = async () => {
    if (!f.customer_id) return toast('Select customer', true);
    setBusy(true);
    try {
      const body = { ...f, consignee_id: f.consignee_id || null, boxes };
      let sid = isEdit ? ship.id : null;
      if (isEdit) await api('/api/shipments/' + ship.id, { method: 'PUT', body });
      else { const r = await api('/api/shipments', { method: 'POST', body }); sid = r.id; }
      // auto-attach the parsed PDFs to the shipment drawer
      if (pdfFiles.length && sid) {
        try {
          const arr = [];
          for (const file of pdfFiles) arr.push({ name: file.name, data: await fileToB64(file) });
          await api(`/api/shipments/${sid}/documents`, { method: 'POST', body: { files: arr } });
          toast('Saved — PDFs attached to shipment drawer');
        } catch (e) { toast('Saved, but PDF attach failed: ' + e.message, true); }
      }
      onSaved();
    } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title={isEdit ? 'Edit Billing Item' : 'New Billing Item'} onClose={onClose}>
      <div style={{ border: '2px dashed var(--blue)', borderRadius: 10, padding: '12px 14px', background: '#f0f7ff', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <b style={{ color: 'var(--navy)' }}>📄 Upload AWB label / invoice PDF to auto-fill</b>
        <input type="file" accept="application/pdf" multiple style={{ width: 'auto', flex: 1, minWidth: 200 }}
          onChange={e => { autofillFromPdfs([...e.target.files]); e.target.value = ''; }} disabled={parsing} />
        {parsing && <span style={{ color: 'var(--blue)', fontWeight: 600 }}>Parsing…</span>}
        {pdfFiles.length > 0 && <span className="tag mint">{pdfFiles.length} PDF{pdfFiles.length > 1 ? 's' : ''} will be attached on save</span>}
      </div>
      <h3>Customer &amp; Service</h3>
      <div className="grid g3">
        <Field label="Customer *">
          <select className={f.customer_id ? '' : 'invalid'} value={f.customer_id} onChange={e => set('customer_id', e.target.value)}>
            <option value="">Select customer…</option>
            {customers.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
        </Field>
        <Field label="Service Provider">
          <select value={f.provider} onChange={e => setF(s => ({ ...s, provider: e.target.value, service: '' }))}>
            <option value="">Select…</option>
            {providers.map(p => <option key={p.id}>{p.name}</option>)}
            {f.provider && !providers.some(p => p.name === f.provider) && <option value={f.provider}>{f.provider} (from PDF)</option>}
          </select>
        </Field>
        <Field label="Service">
          <select value={f.service} onChange={e => set('service', e.target.value)}>
            <option value="">—</option>
            {provServices.map(s => <option key={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="AWB Number"><input className="mono" value={f.awb} onChange={e => set('awb', e.target.value)} /></Field>
        <Field label="Shipment Date"><input type="date" value={f.ship_date} onChange={e => set('ship_date', e.target.value)} /></Field>
        <Field label="Status"><select value={f.status} onChange={e => set('status', e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></Field>
      </div>
      <h3>From Location</h3>
      <div className="grid g3">
        <Field label="Address" className="span3"><input value={f.from_address} onChange={e => set('from_address', e.target.value)} /></Field>
        <Field label="Country"><input value={f.from_country} onChange={e => set('from_country', e.target.value)} /></Field>
        <Field label="Pin Code"><input value={f.from_pincode} onChange={e => set('from_pincode', e.target.value)} /></Field>
      </div>
      <h3>To Location (Consignee)</h3>
      <div className="grid g3">
        <Field label="Pick from Consignee DB">
          <select value={f.consignee_id || ''} onChange={e => pickConsignee(e.target.value)}>
            <option value="">— manual entry —</option>
            {consignees.map(n => <option key={n.id} value={n.id}>{n.company} ({n.country})</option>)}
          </select>
        </Field>
        <Field label="Company Name"><input value={f.to_company} onChange={e => set('to_company', e.target.value)} /></Field>
        <Field label="Consignee Name"><input value={f.to_contact} onChange={e => set('to_contact', e.target.value)} /></Field>
        <Field label="Address" className="span3"><input value={f.to_address} onChange={e => set('to_address', e.target.value)} /></Field>
        <Field label="Country"><input value={f.to_country} onChange={e => set('to_country', e.target.value)} /></Field>
        <Field label="Phone"><input value={f.to_phone} onChange={e => set('to_phone', e.target.value)} /></Field>
      </div>
      <h3>Boxes</h3>
      <div className="boxrow" style={{ marginBottom: 2 }}>
        <label>Count</label><label>L (cm)</label><label>W (cm)</label><label>H (cm)</label><label>Wt/box (kg)</label><label>Divisor</label><label></label>
      </div>
      {boxes.map((b, i) => (
        <div className="boxrow" key={i}>
          <input type="number" min="1" value={b.count} onChange={e => setBox(i, 'count', e.target.value)} />
          <input type="number" step="0.1" value={b.length} onChange={e => setBox(i, 'length', e.target.value)} />
          <input type="number" step="0.1" value={b.width} onChange={e => setBox(i, 'width', e.target.value)} />
          <input type="number" step="0.1" value={b.height} onChange={e => setBox(i, 'height', e.target.value)} />
          <input type="number" step="0.01" value={b.weight} onChange={e => setBox(i, 'weight', e.target.value)} />
          <select value={b.divisor} onChange={e => setBox(i, 'divisor', e.target.value)}>
            <option>5000</option><option>4000</option><option>6000</option>
          </select>
          <button className="btn sm danger" onClick={() => setBoxes(bs => bs.length > 1 ? bs.filter((_, j) => j !== i) : bs)}>✕</button>
        </div>
      ))}
      <button className="btn ghost" style={{ width: '100%', borderStyle: 'dashed', marginTop: 4 }} onClick={() => setBoxes(bs => [...bs, { ...EMPTY_BOX }])}>＋ Add another box category</button>
      <div className="wsum">
        <span>Boxes: <b>{w.count}</b></span>
        <span>Actual: <b>{w.actual.toFixed(2)}</b> kg</span>
        <span>Volumetric: <b>{w.vol.toFixed(2)}</b> kg</span>
        <span>Chargeable: <b style={{ color: 'var(--blue)' }}>{w.chargeable.toFixed(2)}</b> kg</span>
      </div>
      <h3>Invoice &amp; Terms</h3>
      <div className="grid g4">
        <Field label="Invoice No"><input value={f.invoice_no} onChange={e => set('invoice_no', e.target.value)} /></Field>
        <Field label="Invoice Date"><input type="date" value={f.invoice_date} onChange={e => set('invoice_date', e.target.value)} /></Field>
        <Field label="Invoice Value"><input type="number" step="0.01" value={f.invoice_value} onChange={e => set('invoice_value', e.target.value)} /></Field>
        <Field label="Currency"><select value={f.currency} onChange={e => set('currency', e.target.value)}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Inco Terms"><select value={f.incoterm} onChange={e => set('incoterm', e.target.value)}>{INCOTERMS.map(t => <option key={t} value={t}>{t || '—'}</option>)}</select></Field>
        <Field label="Export Under"><select value={f.export_type} onChange={e => set('export_type', e.target.value)}>{EXPORT_TYPES.map(t => <option key={t} value={t}>{t || '—'}</option>)}</select></Field>
        <Field label="Item Description" className="span2"><input value={f.items_desc} onChange={e => set('items_desc', e.target.value)} /></Field>
      </div>
      <h3>Billing</h3>
      <div className="grid g3">
        <Field label="Rate (₹/kg)"><input type="number" step="0.01" value={f.rate} onChange={e => set('rate', e.target.value)} /></Field>
        <Field label={'Amount ₹' + (autoAmount ? ` (auto ${autoAmount}, editable)` : '')}><input type="number" step="0.01" value={f.amount} onChange={e => set('amount', e.target.value)} /></Field>
        <Field label="Notes"><input value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      </div>
      <div className="foot">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save Billing Item'}</button>
      </div>
    </Modal>
  );
}

// ---------- shipment drawer ----------
function ShipmentDrawer({ id, onClose, onEdit, onDeleted }) {
  const toast = useToast();
  const [s, setS] = useState(null);
  const [files, setFiles] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api('/api/shipments/' + id).then(setS).catch(e => { toast(e.message, true); onClose(); });
  }, [id]);
  useEffect(load, [load]);

  const upload = async () => {
    if (!files || !files.length) return toast('Choose files first', true);
    setBusy(true);
    try {
      const arr = [];
      for (const f of files) {
        if (f.size > 15 * 1024 * 1024) throw new Error(f.name + ' exceeds 15 MB');
        arr.push({ name: f.name, data: await fileToB64(f) });
      }
      await api(`/api/shipments/${id}/documents`, { method: 'POST', body: { files: arr } });
      setFiles(null);
      document.getElementById('docFiles').value = '';
      load();
      toast('Documents uploaded');
    } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  };
  const delDoc = async did => { await api('/api/documents/' + did, { method: 'DELETE' }); load(); };
  const delShip = async () => {
    if (!confirm('Delete this billing item and its documents?')) return;
    await api('/api/shipments/' + id, { method: 'DELETE' });
    onDeleted();
  };

  return (
    <Drawer onClose={onClose}>
      {!s ? <div className="center">Loading…</div> : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>{s.awb || 'Shipment #' + s.id}</h2>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn sm ghost" onClick={() => onEdit(s)}>Edit</button>
              <button className="btn sm danger" onClick={delShip}>Delete</button>
              <button className="btn sm ghost" onClick={onClose}>✕</button>
            </div>
          </div>
          <ShipmentDetail s={s} showCustomer />
          <h3>Documents</h3>
          <DocList docs={s.documents} onDelete={delDoc} />
          <input type="file" id="docFiles" multiple style={{ margin: '8px 0' }} onChange={e => setFiles([...e.target.files])} />
          <button className="btn sm" onClick={upload} disabled={busy}>{busy ? 'Uploading…' : 'Upload to Shipment Drawer'}</button>
        </>
      )}
    </Drawer>
  );
}

// ---------- shipments tab ----------
function ShipmentsTab({ customers, consignees, providers, services }) {
  const toast = useToast();
  const [shipments, setShipments] = useState(null);
  const [search, setSearch] = useState('');
  const [custFilter, setCustFilter] = useState('');
  const [form, setForm] = useState(null); // null | 'new' | shipment(with boxes)
  const [drawerId, setDrawerId] = useState(null);

  const reload = useCallback(() => {
    api('/api/shipments').then(setShipments).catch(e => { setShipments([]); toast(e.message, true); });
  }, []);
  useEffect(reload, [reload]);

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return (shipments || []).filter(s => {
      if (custFilter && String(s.customer_id) !== custFilter) return false;
      if (!q) return true;
      return [s.awb, s.customer_name, s.customer_code, s.to_company, s.provider].join(' ').toLowerCase().includes(q);
    });
  }, [shipments, search, custFilter]);

  return (
    <section>
      <div className="toolbar">
        <button className="btn" onClick={() => setForm('new')}>＋ New Billing Item</button>
        <input placeholder="Search AWB / customer / consignee…" style={{ flex: 1, minWidth: 220 }} value={search} onChange={e => setSearch(e.target.value)} />
        <select value={custFilter} onChange={e => setCustFilter(e.target.value)}>
          <option value="">All customers</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table>
          <thead><tr><th>Date</th><th>AWB</th><th>Customer</th><th>Carrier / Service</th><th>Consignee</th><th>Dest</th><th>Boxes</th><th>Chg. Wt (kg)</th><th>Rate</th><th>Amount ₹</th><th>Status</th></tr></thead>
          <tbody>
            {shipments === null && <tr><td colSpan={11} className="empty">Loading…</td></tr>}
            {shipments !== null && rows.length === 0 && <tr><td colSpan={11} className="empty">No shipments yet</td></tr>}
            {rows.map(s => (
              <tr className="row" key={s.id} onClick={() => setDrawerId(s.id)}>
                <td>{s.ship_date}</td>
                <td className="mono"><b>{s.awb}</b></td>
                <td>{s.customer_code}</td>
                <td>{s.provider}{s.service ? ' · ' + s.service : ''}</td>
                <td>{s.to_company}</td>
                <td>{s.to_country}</td>
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
      {form && (
        <ShipmentForm
          ship={form === 'new' ? null : form}
          customers={customers} consignees={consignees} providers={providers} services={services}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); reload(); }}
        />
      )}
      {drawerId && (
        <ShipmentDrawer
          id={drawerId}
          onClose={() => setDrawerId(null)}
          onEdit={s => { setDrawerId(null); setForm(s); }}
          onDeleted={() => { setDrawerId(null); reload(); }}
        />
      )}
    </section>
  );
}

// ---------- shell ----------
function Dashboard({ userName, onLogout }) {
  const toast = useToast();
  const [tab, setTab] = useState('shipments');
  const [customers, setCustomers] = useState([]);
  const [consignees, setConsignees] = useState([]);
  const [providers, setProviders] = useState([]);
  const [services, setServices] = useState([]);

  const loadCustomers = useCallback(() => api('/api/customers').then(setCustomers).catch(e => toast(e.message, true)), []);
  const loadConsignees = useCallback(() => api('/api/consignees').then(setConsignees).catch(e => toast(e.message, true)), []);
  const loadServices = useCallback(() => api('/api/settings/services').then(d => { setProviders(d.providers); setServices(d.services); }).catch(e => toast(e.message, true)), []);
  useEffect(() => { loadCustomers(); loadConsignees(); loadServices(); }, []);

  const TABS = [['shipments', 'Shipments'], ['customers', 'Customers'], ['consignees', 'Consignees'], ['settings', 'Settings']];
  return (
    <>
      <header>
        <h1>Shipzy<span>Cart</span> · Intl Billing</h1>
        <nav>
          {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </nav>
        <div className="right">
          <span className="mono">{userName}</span>
          <button className="btn ghost dark" onClick={onLogout}>Logout</button>
        </div>
      </header>
      <main>
        {tab === 'shipments' && <ShipmentsTab customers={customers} consignees={consignees} providers={providers} services={services} />}
        {tab === 'customers' && <CustomersTab customers={customers} reload={loadCustomers} />}
        {tab === 'consignees' && <ConsigneesTab consignees={consignees} customers={customers} reload={loadConsignees} />}
        {tab === 'settings' && <SettingsTab providers={providers} services={services} reload={loadServices} />}
      </main>
    </>
  );
}

function App() {
  const [authed, setAuthed] = useState(undefined);
  const [userName, setUserName] = useState('Admin');
  const [splash, setSplash] = useState(null);

  useEffect(() => {
    api('/api/me?p=admin').then(m => setAuthed(m.role === 'admin')).catch(() => setAuthed(false));
  }, []);

  const onLoggedIn = name => {
    setUserName(name);
    setSplash(name);
    setTimeout(() => setAuthed(true), 1500);
    setTimeout(() => setSplash(null), 2200);
  };
  const onLogout = async () => { try { await api('/api/logout', { method: 'POST' }); } catch (e) {} location.reload(); };

  if (authed === undefined) return <div className="center">Loading…</div>;
  return (
    <>
      {authed ? <Dashboard userName={userName} onLogout={onLogout} /> : (!splash && <Login onLoggedIn={onLoggedIn} />)}
      {splash && <Splash name={splash} />}
    </>
  );
}

export default function Root() {
  return <ToastProvider><App /></ToastProvider>;
}
