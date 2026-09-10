// Maps spreadsheet rows to shipment payloads for bulk import.
// Understands the Offiga railway booking format; extra columns land in `extra` JSON.

const KNOWN = {
  shipment_no: 'ref', shipment_date: 'date', customer: 'to_company',
  origin: 'from_address', destination: 'to_address', packages: 'packages',
  'total weight': 'total_weight', mode: 'mode', delivery_status: 'delivery_status', notes: 'notes'
};

const norm = h => String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function findHeaderRow(rows) {
  // rows: array-of-arrays; header row contains shipment_date or origin+destination
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = (rows[i] || []).map(norm);
    if (cells.includes('shipment_date') || (cells.includes('origin') && cells.includes('destination'))) return i;
  }
  return 0;
}

function excelDate(v) {
  if (v == null || v === '') return { iso: '', raw: '' };
  if (v instanceof Date && !isNaN(v)) return { iso: v.toISOString().slice(0, 10), raw: '' };
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Excel serial
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return { iso: d.toISOString().slice(0, 10), raw: '' };
  }
  const s = String(v).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}`, raw: '' };
  const m2 = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s);
  if (m2) return { iso: `${m2[3]}-${String(m2[2]).padStart(2, '0')}-${String(m2[1]).padStart(2, '0')}`, raw: '' };
  return { iso: '', raw: s }; // "Cancelled", "11th June" etc.
}

export function mapRows(headerCells, dataRows, opts = {}) {
  const category = opts.category || 'Railway';
  const headers = headerCells.map(norm);
  const items = [];
  for (const row of dataRows) {
    if (!row || row.every(c => c == null || String(c).trim() === '')) continue;
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = row[i]; });

    const it = { service_category: category, currency: 'INR', from_country: 'India', boxes: [] };
    const extra = {};

    for (const [h, v] of Object.entries(obj)) {
      if (v == null || String(v).trim() === '') continue;
      const key = KNOWN[h];
      if (key === 'ref') it.awb = String(v).replace(/\.0$/, '');
      else if (key === 'date') {
        const d = excelDate(v);
        it.ship_date = d.iso;
        if (d.raw) extra['Date (as entered)'] = d.raw;
      }
      else if (key === 'to_company') it.to_company = String(v).trim();
      else if (key === 'from_address') it.from_address = String(v).trim();
      else if (key === 'to_address') it.to_address = String(v).trim();
      else if (key === 'notes') it.notes = String(v).trim();
      else if (key === 'packages') { /* handled below via boxes */ obj.__pk = v; }
      else if (key === 'total_weight') { obj.__tw = v; }
      else if (key === 'mode') {
        const mv = String(v).trim();
        it.service = mv;
        it.provider = /movin/i.test(mv) ? 'Movin Express' : 'Indian Railways';
        extra['Mode'] = mv;
      }
      else if (key === 'delivery_status') {
        const sv = String(v).trim();
        it.status = /deliver/i.test(sv) ? 'Delivered' : /transit|connect/i.test(sv) ? 'In Transit' : 'Booked';
        extra['Delivery Status'] = sv;
      }
      else {
        // unmapped column → extra, with the original header prettified
        const label = h.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        extra[label] = typeof v === 'number' ? v : String(v).trim();
      }
    }

    const pk = Number(obj.__pk);
    const tw = Number(obj.__tw);
    if (pk > 0 && tw > 0) {
      it.boxes = [{ count: pk, length: '', width: '', height: '', weight: +(tw / pk).toFixed(2), divisor: 5000 }];
    } else if (pk > 0) {
      it.boxes = [{ count: pk, length: '', width: '', height: '', weight: 0, divisor: 5000 }];
      if (obj.__tw != null && String(obj.__tw).trim() !== '') extra['Total Weight (as entered)'] = String(obj.__tw).trim();
    }
    if (!it.to_country) it.to_country = 'India';
    if (Object.keys(extra).length) it.extra = JSON.stringify(extra);
    // skip rows that carry nothing meaningful
    if (!it.awb && !it.ship_date && !it.to_company && !it.to_address) continue;
    items.push(it);
  }
  return items;
}
