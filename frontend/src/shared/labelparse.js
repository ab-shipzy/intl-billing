// Parses Atlantic International AWB labels and proforma invoices into shipment-form fields.
// Pure functions over x/y-aware extracted lines — usable in browser (via pdf.js) and node (tests).

export function groupLines(textItems) {
  // textItems: [{x, y, str}] for one page
  const items = textItems.filter(t => t.str.trim());
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of items) {
    const ln = lines.find(l => Math.abs(l.y - it.y) < 3);
    if (ln) ln.items.push(it); else lines.push({ y: it.y, items: [it] });
  }
  lines.forEach(l => {
    l.items.sort((a, b) => a.x - b.x);
    l.text = l.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
  });
  return lines;
}

const ddmmyyyy = s => {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};
const cleanNum = s => String(s || '').replace(/,/g, '');

export function detectDocType(fullText) {
  if (/TO RECEIVER/i.test(fullText) && /FROM SHIPPER/i.test(fullText)) return 'awb';
  if (/COMMERCIAL INVOICE/i.test(fullText) && /Air Waybill/i.test(fullText)) return 'fedex_ci';
  if (/Invoice No/i.test(fullText) && /Consignee/i.test(fullText)) return 'pi';
  return null;
}

// ---------- FedEx commercial invoice ----------
export function parseFedexCI(pages) {
  const { lines } = pages[0];
  const fullText = pages.map(p => p.lines.map(l => l.text).join('\n')).join('\n');
  const out = { boxes: [], provider: 'FedEx', currency: 'INR' };
  let m;

  const monthDate = s => {
    const mm = /(\d{1,2})\s+([A-Za-z]{3}),?\s+(\d{4})/.exec(s || '');
    if (!mm) return '';
    const mo = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }[mm[2].toLowerCase().slice(0, 3)];
    return mo ? `${mm[3]}-${mo}-${String(mm[1]).padStart(2, '0')}` : '';
  };

  // right-column header fields: value sits on the line after the label at x≈298
  const idxOf = re => lines.findIndex(l => re.test(l.text));
  const valBelow = (re, valRe, xNear = 298, span = 3) => {
    const i = idxOf(re);
    if (i < 0) return '';
    // value may be on the same line first
    const same = valRe.exec(lines[i].items.filter(it => Math.abs(it.x - xNear) < 60).map(it => it.str).join(' '));
    if (same && !re.test(same[0])) return same[1] || same[0];
    for (let j = i + 1; j <= Math.min(i + span, lines.length - 1); j++) {
      const seg = lines[j].items.filter(it => Math.abs(it.x - xNear) < 60).map(it => it.str).join(' ').trim();
      const v = valRe.exec(seg);
      if (v) return v[1] || v[0];
    }
    return '';
  };

  out.awb = valBelow(/Air Waybill/, /(\d{10,14})/);
  const sd = valBelow(/Ship Date/, /(\d{1,2}\s+[A-Za-z]{3},?\s+\d{4})/);
  if (sd) out.ship_date = monthDate(sd);
  out.invoice_no = valBelow(/Invoice No\.?:/, /^(\S{1,20})$/) || valBelow(/Invoice No\.?:/, /(\S+)/);
  out.invoice_date = out.ship_date;

  if ((m = /Invoice Total:\s*([\d,]+\.?\d*)/.exec(fullText))) out.invoice_value = cleanNum(m[1]);
  if ((m = /Currency Code:\s*\n?.*?\b([A-Z]{3})\b/.exec(fullText)) && /INR|USD|EUR|GBP|AED/.test(m[1])) out.currency = m[1];
  if ((m = /\b(EXW|FOB|CIF|CFR|DAP|DDP|DDU|FCA|CPT|CIP)\b/.exec(fullText))) out.incoterm = m[1];

  // exporter (from) block: lines between "Company Name/Address:" and "Country/Territory:" in the EXPORTER section (left col, before CONSIGNEE)
  const consIdx = idxOf(/^CONSIGNEE:/);
  const leftBlock = (startRe, endRe, from, to) => {
    const seg = lines.slice(from, to);
    const si = seg.findIndex(l => startRe.test(l.text));
    if (si < 0) return [];
    const res = [];
    for (let j = si + 1; j < seg.length; j++) {
      if (endRe.test(seg[j].text)) break;
      const leftItems = seg[j].items.filter(it => it.x < 290).map(it => it.str).join(' ').trim();
      if (leftItems) res.push(leftItems);
    }
    return res;
  };
  const exp = leftBlock(/Company Name\/Address:/, /Country\/Territory/, 0, consIdx > 0 ? consIdx : 25);
  if (exp.length) {
    out.from_address = exp.join(', ');
    const pin = /(\d{6})\b/.exec(out.from_address);
    if (pin) out.from_pincode = pin[1];
  }
  out.from_country = 'India';

  // consignee block
  if (consIdx >= 0) {
    const endIdx = lines.findIndex((l, i) => i > consIdx && /designated broker/i.test(l.text));
    const seg = lines.slice(consIdx, endIdx > 0 ? endIdx : consIdx + 14);
    for (const l of seg) {
      const left = l.items.filter(it => it.x < 290).map(it => it.str).join(' ').trim();
      if ((m = /Contact Name:\s*(.+)/.exec(left))) out.to_contact = m[1].trim();
      if ((m = /Telephone No\.?:\s*(\+?\d[\d ]{5,})/.exec(left))) out.to_phone = m[1].trim();
      if ((m = /Country\/Territory\s*:?\s*(.+)/.exec(left))) out.to_country = m[1].trim();
    }
    const caddr = leftBlock(/Company Name\/Address:/, /Country\/Territory/, consIdx, endIdx > 0 ? endIdx : consIdx + 14);
    if (caddr.length) {
      out.to_company = caddr[0];
      out.to_address = caddr.slice(1).join(', ');
    }
  }

  // totals row: "2 110.00 0.20 KG 20.00 KG ..." right after "Pkgs Units Weight" header
  const totIdx = lines.findIndex(l => /^Pkgs\s+Units/.test(l.text) || (/Pkgs/.test(l.text) && /Subtotal/.test(l.text)));
  if (totIdx >= 0 && totIdx + 1 < lines.length) {
    const t = lines[totIdx + 1].text;
    const tm = /^(\d+)\s+([\d.]+)\s+([\d.]+)\s*KGS?\s+([\d.]+)\s*KGS?/.exec(t);
    if (tm) {
      const pkgs = parseInt(tm[1], 10) || 1;
      const gross = parseFloat(tm[4]) || 0;
      out.boxes.push({ count: pkgs, length: '', width: '', height: '', weight: gross ? +(gross / pkgs).toFixed(2) : '', divisor: 5000 });
      out.total_weight = gross;
    }
  }

  // item descriptions: rows like "55.00 0.10 PCS <desc> <hs> IN <unit> <total>"
  const items = [];
  for (const l of lines) {
    const im = /^[\d.]+\s+[\d.]+\s+PCS\s+(.+?)\s+\d{6,12}\s+\w{2}\s+[\d,.]+\s+[\d,.]+$/.exec(l.text);
    if (im) items.push(im[1].trim());
  }
  if (items.length) out.items_desc = items.join(', ');
  return out;
}


// ---------- AWB label (Atlantic layout) ----------
export function parseAwbLabel(pages) {
  const { width, lines } = pages[0];
  const fullText = pages.map(p => p.lines.map(l => l.text).join('\n')).join('\n');
  const thr = width * 0.36; // receiver column starts right of this
  const out = { boxes: [] };

  // AWB number: barcode text *9221340452-1* or the big number on the ACCOUNT row
  let m = /\*(\d{8,})-\d+\*/.exec(fullText) || /ACCOUNT\s+\S+\s+(\d{8,})/.exec(fullText);
  if (m) out.awb = m[1];

  if ((m = /DATE\s*:\s*(\d{2}\/\d{2}\/\d{4})/.exec(fullText))) out.ship_date = ddmmyyyy(m[1]);
  if ((m = /Amount\s*:\s*([\d,\.]+)/.exec(fullText))) out.invoice_value = cleanNum(m[1]);
  if ((m = /Currency\s*:\s*([A-Z]{3})/.exec(fullText))) out.currency = m[1];
  if (/atlantic/i.test(fullText)) out.provider = 'Atlantic';

  // pieces + total weight sit on the row that also has "Currency : XXX"
  const wRow = lines.find(l => /Currency\s*:/.test(l.text));
  if (wRow) {
    const nums = wRow.items.filter(i => i.x > width * 0.6 && /^[\d.]+$/.test(i.str.trim())).map(i => i.str.trim());
    if (nums.length >= 2) {
      const pcs = parseInt(nums[0], 10) || 1;
      const tot = parseFloat(nums[1]) || 0;
      out.boxes.push({ count: pcs, length: '', width: '', height: '', weight: tot ? +(tot / pcs).toFixed(2) : '', divisor: 5000 });
      out.total_weight = tot;
    }
  }

  // column split helpers
  const rightText = l => l.items.filter(i => i.x >= thr).map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
  const leftText = l => l.items.filter(i => i.x < thr - 10 && i.x > width * 0.03).map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();

  // stop at the table section
  const stopIdx = lines.findIndex(l => /CUSTOMER REF/.test(l.text));
  const head = stopIdx > 0 ? lines.slice(0, stopIdx) : lines;

  const rlines = head.map(rightText).filter(Boolean);
  const llines = head.map(leftText).filter(Boolean);

  const grab = (arr, labelRe, stopRe) => {
    const i = arr.findIndex(t => labelRe.test(t));
    if (i < 0) return [];
    const outLines = [];
    for (let j = i + 1; j < arr.length; j++) {
      if (stopRe.test(arr[j])) break;
      outLines.push(arr[j].replace(labelRe, '').trim());
    }
    return outLines.filter(Boolean);
  };

  // receiver
  const comp = grab(rlines, /^COMPANY NAME$/, /^(RECEIVER'?S NAME|ADDRESS)$/);
  if (comp.length) out.to_company = comp[0].replace(/DUTY PAID|DESCRIPTION OF CONTENTS/g, '').trim();
  const rname = grab(rlines, /^RECEIVER'?S NAME$/, /^ADDRESS$/);
  if (rname.length) out.to_contact = rname[0].replace(/DESCRIPTION OF CONTENTS/g, '').trim();
  const raddr = grab(rlines, /^ADDRESS$/, /^CITY\s*:/);
  let city = '';
  for (const t of rlines) {
    let mm;
    if ((mm = /^CITY\s*:\s*(.+)$/.exec(t))) city = mm[1].replace(/SPECIAL INSTRUCTION/g, '').trim();
    if ((mm = /^COUNTRY\s*:\s*(.+)$/.exec(t))) out.to_country = mm[1].trim();
    if ((mm = /^TEL\.?\s*:\s*(\+?[\d ]{7,})$/.exec(t))) out.to_phone = mm[1].trim();
  }
  out.to_address = [...raddr, city].filter(Boolean).join(', ');

  // sender (left column)
  const saddr = grab(llines, /^ADDRESS$/, /^(TEL|PIN CODE)/);
  out.from_address = saddr.join(', ');
  for (const t of llines) {
    const mm = /^PIN CODE\s*:\s*(\d+)/.exec(t);
    if (mm) out.from_pincode = mm[1];
  }
  out.from_country = 'India';
  return out;
}

// ---------- Proforma invoice ----------
export function parseProforma(pages) {
  const { lines } = pages[0];
  const fullText = pages.map(p => p.lines.map(l => l.text).join('\n')).join('\n');
  const out = { boxes: [] };
  let m;

  if ((m = /AWB No\.?\s*:?\s*(\d{8,})/.exec(fullText.replace(/\n/g, ' ')))) out.awb = m[1];

  // Invoice No: value sits under the "Invoice No.:" label at similar x
  const noIdx = lines.findIndex(l => /Invoice No/.test(l.text));
  if (noIdx >= 0) {
    const labelItem = lines[noIdx].items.find(i => /Invoice No/.test(i.str));
    const lx = labelItem ? labelItem.x : 300;
    for (let j = noIdx + 1; j < Math.min(noIdx + 3, lines.length); j++) {
      const v = lines[j].items.find(i => Math.abs(i.x - lx) < 20 && /^\S+$/.test(i.str.trim()));
      if (v) { out.invoice_no = v.str.trim(); break; }
    }
  }
  if ((m = /Invoice Date\s*:?\s*(\d{2}\/\d{2}\/\d{4})/.exec(fullText))) out.invoice_date = ddmmyyyy(m[1]);
  if (!out.invoice_date && (m = /(\d{2}\/\d{2}\/\d{4})/.exec(fullText))) out.invoice_date = ddmmyyyy(m[1]);
  out.ship_date = out.invoice_date || '';

  if ((m = /Total invoice value\s*=?\s*([\d,]+\.?\d*)/i.exec(fullText))) out.invoice_value = cleanNum(m[1]);
  out.currency = /\(INR\)|RATE\(INR/.test(fullText) ? 'INR' : undefined;

  if ((m = /BOX\s*:\s*(\d+)\s+([\d.]+)\s*KGS/i.exec(fullText))) {
    const pcs = parseInt(m[1], 10) || 1, tot = parseFloat(m[2]) || 0;
    out.boxes.push({ count: pcs, length: '', width: '', height: '', weight: tot ? +(tot / pcs).toFixed(2) : '', divisor: 5000 });
    out.total_weight = tot;
  }

  if ((m = /\b(EXW|FOB|CIF|CFR|DAP|DDP|FCA)\b/.exec(fullText))) out.incoterm = m[1];
  if (/FREE SAMPLE|NO COMMERI?C/i.test(fullText)) out.export_type = 'Non-commercial';

  // items: "1 BRASS BOTTLE SET 74181022 20 200.00 4,000.00"
  const items = [];
  for (const l of lines) {
    const im = /^(\d{1,2})\s+(.+?)\s+(\d{4,10})\s+(\d+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/.exec(l.text);
    if (im) items.push(im[2].trim());
  }
  if (items.length) out.items_desc = items.join(', ');

  // consignee block: lines after "Consignee :" in the left column until PIN/PH
  const cIdx = lines.findIndex(l => /^Consignee\s*:/.test(l.text));
  if (cIdx >= 0) {
    const block = [];
    for (let j = cIdx + 1; j < lines.length && block.length < 8; j++) {
      const left = lines[j].items.filter(i => i.x < 200).map(i => i.str).join(' ').trim();
      if (!left) continue;
      if (/^(PIN|Email)\s*:/.test(left)) {
        const ph = /PH\s*:\s*(\+?\d[\d ]{6,})/.exec(lines[j].text);
        if (ph) out.to_phone = ph[1].trim();
        break;
      }
      block.push(left);
    }
    if (block.length) {
      out.to_contact = block[0];
      out.to_company = block[0];
      const addr = block.slice(1);
      // last line like "U.A.E.DUBAI" is country-ish
      if (addr.length) {
        const last = addr[addr.length - 1];
        if (/U\.?A\.?E|INDIA|USA|U\.?K\.?/i.test(last) && last.length < 20) { out.to_country = last; addr.pop(); }
      }
      out.to_address = addr.join(', ');
    }
  }
  return out;
}

// Merge parsed docs: AWB label fields take priority for logistics, PI for invoice details
export function mergeParsed(parsedDocs) {
  const awb = parsedDocs.find(d => d.type === 'awb');
  const pi = parsedDocs.find(d => d.type === 'pi' || d.type === 'fedex_ci');
  const merged = {};
  const put = (src, keys) => { if (src) keys.forEach(k => { if (src[k] !== undefined && src[k] !== '') merged[k] = src[k]; }); };
  // base: PI first, AWB overrides shared logistics fields
  put(pi, ['awb', 'ship_date', 'provider', 'invoice_no', 'invoice_date', 'invoice_value', 'currency', 'incoterm', 'export_type', 'items_desc', 'to_company', 'to_contact', 'to_address', 'to_country', 'to_phone', 'from_address', 'from_pincode', 'from_country']);
  put(awb, ['awb', 'ship_date', 'provider', 'to_company', 'to_contact', 'to_address', 'to_country', 'to_phone', 'from_address', 'from_pincode', 'from_country']);
  if (awb && !merged.invoice_value && awb.invoice_value) merged.invoice_value = awb.invoice_value;
  if (awb && !merged.currency && awb.currency) merged.currency = awb.currency;
  merged.boxes = (awb && awb.boxes.length ? awb.boxes : (pi ? pi.boxes : [])) || [];
  return merged;
}

export function parsePages(pages) {
  const fullText = pages.map(p => p.lines.map(l => l.text).join('\n')).join('\n');
  const type = detectDocType(fullText);
  if (type === 'awb') return { type, ...parseAwbLabel(pages) };
  if (type === 'fedex_ci') return { type, ...parseFedexCI(pages) };
  if (type === 'pi') return { type, ...parseProforma(pages) };
  return null;
}
