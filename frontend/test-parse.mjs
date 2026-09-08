import fs from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { groupLines, parsePages, mergeParsed } from './src/shared/labelparse.js';

async function extract(path) {
  const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(path)), useSystemFonts: true }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const lines = groupLines(tc.items.map(t => ({ x: t.transform[4], y: t.transform[5], str: t.str })));
    pages.push({ width: vp.width, lines });
  }
  return pages;
}

const sets = [
  ['/mnt/user-data/uploads/AWB_9221340452AWB.pdf', '/mnt/user-data/uploads/Performa_9221340452.pdf'],
  ['/mnt/user-data/uploads/AWB_9221340475AWB-DUBAI.pdf', '/mnt/user-data/uploads/Performa_9221340475-DUBAI.pdf']
];
for (const files of sets) {
  const parsed = [];
  for (const f of files) {
    const p = parsePages(await extract(f));
    console.log('---', f.split('/').pop(), '→ type:', p ? p.type : 'UNDETECTED');
    parsed.push(p);
  }
  console.log('MERGED:', JSON.stringify(mergeParsed(parsed.filter(Boolean)), null, 1));
  console.log('======');
}
