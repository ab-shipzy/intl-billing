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
    pages.push({ width: vp.width, lines: groupLines(tc.items.map(t => ({ x: t.transform[4], y: t.transform[5], str: t.str }))) });
  }
  return pages;
}
const p = parsePages(await extract('/mnt/user-data/uploads/Invoice_6003550806__1_.pdf'));
console.log('type:', p.type);
console.log(JSON.stringify(mergeParsed([p]), null, 1));
