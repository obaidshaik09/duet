/**
 * Renders docs/TEST_REPORT.md to docs/Duet-Test-Report.pdf using the locally installed Edge (or Chrome).
 *   npm run report:pdf
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from 'marked';
import { chromium } from 'playwright-core';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs');
const mdPath = path.join(docs, 'TEST_REPORT.md');
const htmlPath = path.join(docs, '.report-render.html');
const pdfPath = path.join(docs, 'Duet-Test-Report.pdf');

const browserPaths = [
  `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
];
const executablePath = browserPaths.find((p) => p && fs.existsSync(p));
if (!executablePath) {
  console.error('No Edge or Chrome found.');
  process.exit(1);
}

const body = marked.parse(fs.readFileSync(mdPath, 'utf8'))
  .replace(/<td>Pass<\/td>/g, '<td class="pass">Pass</td>')
  .replace(/<th>(Result|Passed)<\/th>/g, '<th class="num">$1</th>');

const css = `
  @page { size: Letter; margin: 0.75in 0.7in 0.8in; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif; font-size: 10.5pt; line-height: 1.5;
    color: #2a2622; margin: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1 {
    font-family: Georgia, serif; font-size: 30pt; margin: 0 0 6pt; letter-spacing: -0.5pt;
    border-bottom: 3pt solid #c46a4a; padding-bottom: 8pt;
  }
  h2 {
    font-family: Georgia, serif; font-size: 17pt; margin: 22pt 0 8pt; color: #2a2622;
    break-after: avoid;
  }
  h3 { font-size: 12pt; margin: 14pt 0 6pt; color: #4f6f5c; break-after: avoid; }
  p { margin: 4pt 0 8pt; }
  strong { color: #2a2622; }
  em { color: #6f675e; }
  hr { border: 0; border-top: 1pt solid #e6dccd; margin: 16pt 0; }
  table { width: 100%; border-collapse: collapse; margin: 6pt 0 12pt; font-size: 9.5pt; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th {
    background: #2a2622; color: #fffdf8; text-align: left; padding: 5pt 8pt; font-weight: 600;
  }
  td { padding: 5pt 8pt; border-bottom: 1pt solid #e6dccd; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #faf6ef; }
  td.pass { color: #4f6f5c; font-weight: 700; white-space: nowrap; }
  th.num, table:has(th.num) td:last-child { width: 0.9in; white-space: nowrap; }
  td code { white-space: nowrap; }
  code {
    font-family: Consolas, monospace; font-size: 9pt; background: #f4efe6;
    padding: 1pt 4pt; border-radius: 3pt;
  }
  pre {
    background: #2a2622; color: #fffdf8; padding: 10pt 12pt; border-radius: 6pt;
    break-inside: avoid; font-size: 9pt;
  }
  pre code { background: none; color: inherit; padding: 0; }
  ol, ul { margin: 4pt 0 10pt; padding-left: 18pt; }
  li { margin: 3pt 0; }
  img {
    max-width: 100%; max-height: 3.4in; border: 1pt solid #e6dccd; border-radius: 6pt;
    display: block; margin: 4pt auto;
  }
  td:has(img) { text-align: center; background: #fffdf8 !important; }
  .cover-band {
    background: #f4efe6; border-radius: 10pt; padding: 14pt 18pt; margin: 10pt 0 6pt;
    display: flex; gap: 16pt; align-items: center;
  }
  .cover-band img { width: 54pt; height: 54pt; border: 0; margin: 0; }
  .big { font-family: Georgia, serif; font-size: 26pt; font-weight: 700; color: #4f6f5c; line-height: 1.1; }
  .sub { color: #6f675e; font-size: 10pt; }
`;

const iconSrc = pathToFileURL(path.join(root, 'public', 'icons', 'icon-192.png')).href;
const banner = `
  <div class="cover-band">
    <img src="${iconSrc}" alt="">
    <div>
      <div class="big">115 / 115 checks passed</div>
      <div class="sub">11 unit · 73 end-to-end · 31 browser · 4 bugs found and fixed</div>
    </div>
  </div>`;

const withBanner = body.replace('</h1>', `</h1>${banner}`);

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Duet — Test Report</title>
<style>${css}</style></head><body>${withBanner}</body></html>`;

fs.writeFileSync(htmlPath, html);

const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  if (process.env.REPORT_PREVIEW) {
    await page.emulateMedia({ media: 'print' });
    await page.setViewportSize({ width: 816, height: 1056 });
    await page.screenshot({ path: process.env.REPORT_PREVIEW, fullPage: true });
  }
  await page.pdf({
    path: pdfPath,
    format: 'Letter',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="font-family:'Segoe UI',sans-serif;font-size:8pt;color:#6f675e;width:100%;padding:0 0.7in;display:flex;justify-content:space-between;">
      <span>Duet — Test Report · October 1, 2026</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    margin: { top: '0.75in', bottom: '0.8in', left: '0.7in', right: '0.7in' },
  });
} finally {
  await browser.close();
  fs.rmSync(htmlPath, { force: true });
}

const pages = (fs.readFileSync(pdfPath, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log(`Wrote ${path.relative(root, pdfPath)} (${pages} pages)`);
