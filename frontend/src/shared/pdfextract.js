// Browser-side: extract x/y-aware lines from a PDF File via pdf.js, then parse.
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { groupLines, parsePages } from './labelparse.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function parsePdfFile(file) {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const lines = groupLines(tc.items.map(t => ({ x: t.transform[4], y: t.transform[5], str: t.str })));
    pages.push({ width: vp.width, lines });
  }
  return parsePages(pages);
}
