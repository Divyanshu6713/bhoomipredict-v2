/**
 * Minimal PDF 1.4 writer.
 *
 * Enough of the format to lay out documentation pages and wide data tables:
 * Helvetica text in three weights, rules, filled rectangles, page numbering and
 * Flate-compressed content streams. Written by hand so the dataset export has no
 * third-party dependency.
 */
import zlib from 'node:zlib';

const A4_LANDSCAPE = { width: 842, height: 595 };
const A4_PORTRAIT = { width: 595, height: 842 };

/** Characters the corpus uses that are outside ASCII, mapped to WinAnsi. */
const CHAR_MAP = new Map([
  ['—', '-'],
  ['–', '-'],
  ['’', "'"],
  ['‘', "'"],
  ['“', '"'],
  ['”', '"'],
  ['·', '-'],
  ['₹', 'Rs.'],
  ['≥', '>='],
  ['≤', '<='],
  ['×', 'x'],
  ['→', '->'],
  ['•', '-'],
  ['…', '...'],
]);

function sanitise(text) {
  let out = '';
  for (const ch of String(text)) {
    if (ch.charCodeAt(0) < 128) out += ch;
    else out += CHAR_MAP.get(ch) ?? '?';
  }
  return out;
}

const escapeText = (s) => sanitise(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** Helvetica advance widths (per 1000 units) for the printable ASCII range. */
const HELV_WIDTHS = (() => {
  const w = new Array(128).fill(556);
  const set = (chars, value) => {
    for (const ch of chars) w[ch.charCodeAt(0)] = value;
  };
  set(' !', 278);
  set('"', 355);
  set('#$', 556);
  set('%', 889);
  set('&', 667);
  set("'", 191);
  set('()', 333);
  set('*', 389);
  set('+', 584);
  set(',', 278);
  set('-', 333);
  set('.', 278);
  set('/', 278);
  set('0123456789', 556);
  set(':;', 278);
  set('<=>', 584);
  set('?', 556);
  set('@', 1015);
  set('ABDEHKNPRSUVXY', 667);
  set('C', 722);
  set('F', 611);
  set('G', 778);
  set('I', 278);
  set('J', 500);
  set('L', 556);
  set('MW', 944);
  set('O', 778);
  set('Q', 778);
  set('T', 611);
  set('Z', 611);
  set('[]', 278);
  set('\\', 278);
  set('^', 469);
  set('_', 556);
  set('`', 333);
  set('abcdeghnopqsu', 556);
  set('f', 278);
  set('ijl', 222);
  set('k', 500);
  set('m', 833);
  set('r', 333);
  set('t', 278);
  set('vxyz', 500);
  set('w', 722);
  set('{}', 334);
  set('|', 260);
  set('~', 584);
  return w;
})();

/** Width of a string in points. Bold is ~5% wider in Helvetica. */
export function textWidth(text, size, bold = false) {
  const s = sanitise(text);
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    total += code < 128 ? HELV_WIDTHS[code] : 556;
  }
  return (total / 1000) * size * (bold ? 1.05 : 1);
}

/** Truncate to fit a column, with an ellipsis when it has to cut. */
export function fit(text, maxWidth, size, bold = false) {
  const s = sanitise(text ?? '');
  if (textWidth(s, size, bold) <= maxWidth) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(`${s.slice(0, mid)}..`, size, bold) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${s.slice(0, lo)}..`;
}

/** Greedy word wrap. */
export function wrap(text, maxWidth, size, bold = false) {
  const words = sanitise(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size, bold) <= maxWidth) line = candidate;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

class Page {
  constructor(doc, size) {
    this.doc = doc;
    this.width = size.width;
    this.height = size.height;
    this.ops = [];
  }

  /** Text with the origin at the baseline, measured from the top of the page. */
  text(x, top, value, { size = 9, font = 'R', color = [0.08, 0.12, 0.2], align = 'left', width = 0 } = {}) {
    let tx = x;
    if (align !== 'left' && width) {
      const w = textWidth(value, size, font === 'B');
      tx = align === 'right' ? x + width - w : x + (width - w) / 2;
    }
    this.ops.push(
      `q ${color.map((c) => c.toFixed(3)).join(' ')} rg BT /${font} ${size} Tf ${tx.toFixed(2)} ${(this.height - top).toFixed(2)} Td (${escapeText(value)}) Tj ET Q`,
    );
    return this;
  }

  line(x1, y1, x2, y2, { width = 0.5, color = [0.78, 0.82, 0.88] } = {}) {
    this.ops.push(
      `q ${color.map((c) => c.toFixed(3)).join(' ')} RG ${width} w ${x1.toFixed(2)} ${(this.height - y1).toFixed(2)} m ${x2.toFixed(2)} ${(this.height - y2).toFixed(2)} l S Q`,
    );
    return this;
  }

  rect(x, top, w, h, { fill = null, stroke = null, width = 0.5 } = {}) {
    const y = this.height - top - h;
    let op = 'q ';
    if (fill) op += `${fill.map((c) => c.toFixed(3)).join(' ')} rg `;
    if (stroke) op += `${stroke.map((c) => c.toFixed(3)).join(' ')} RG ${width} w `;
    op += `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re `;
    op += fill && stroke ? 'B' : fill ? 'f' : 'S';
    this.ops.push(`${op} Q`);
    return this;
  }

  content() {
    return this.ops.join('\n');
  }
}

export class Pdf {
  constructor({ title = 'Document', author = 'LandPulse AI', subject = '', compress = true } = {}) {
    this.pages = [];
    this.meta = { title, author, subject };
    this.compress = compress;
  }

  addPage(orientation = 'landscape') {
    const page = new Page(this, orientation === 'portrait' ? A4_PORTRAIT : A4_LANDSCAPE);
    this.pages.push(page);
    return page;
  }

  get pageCount() {
    return this.pages.length;
  }

  /** Move a page to a different position — used to put front matter first. */
  reorder(fromIndex, toIndex) {
    const [page] = this.pages.splice(fromIndex, 1);
    this.pages.splice(toIndex, 0, page);
  }

  build() {
    const objects = [];
    const push = (body) => {
      objects.push(body);
      return objects.length; // 1-based object number
    };

    // Reserve 1 for the catalog and 2 for the page tree.
    objects.push(null, null);

    const fontR = push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const fontB = push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const fontO = push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');

    const pageRefs = [];
    for (const page of this.pages) {
      const raw = Buffer.from(page.content(), 'latin1');
      const data = this.compress ? zlib.deflateSync(raw, { level: 9 }) : raw;
      const streamNum = push({
        dict: `<< /Length ${data.length}${this.compress ? ' /Filter /FlateDecode' : ''} >>`,
        stream: data,
      });
      const pageNum = push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] ` +
          `/Resources << /Font << /R ${fontR} 0 R /B ${fontB} 0 R /O ${fontO} 0 R >> >> ` +
          `/Contents ${streamNum} 0 R >>`,
      );
      pageRefs.push(pageNum);
    }

    const infoNum = push(
      `<< /Title (${escapeText(this.meta.title)}) /Author (${escapeText(this.meta.author)}) ` +
        `/Subject (${escapeText(this.meta.subject)}) /Creator (LandPulse AI dataset exporter) ` +
        `/CreationDate (D:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z) >>`,
    );

    objects[0] = `<< /Type /Catalog /Pages 2 0 R >>`;
    objects[1] = `<< /Type /Pages /Kids [${pageRefs.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`;

    const chunks = [];
    let offset = 0;
    const write = (buf) => {
      const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, 'latin1');
      chunks.push(b);
      offset += b.length;
    };

    write('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const offsets = [];
    objects.forEach((obj, i) => {
      offsets[i] = offset;
      write(`${i + 1} 0 obj\n`);
      if (typeof obj === 'string') {
        write(`${obj}\n`);
      } else {
        write(`${obj.dict}\nstream\n`);
        write(obj.stream);
        write('\nendstream\n');
      }
      write('endobj\n');
    });

    const xrefOffset = offset;
    write(`xref\n0 ${objects.length + 1}\n`);
    write('0000000000 65535 f \n');
    for (const off of offsets) write(`${String(off).padStart(10, '0')} 00000 n \n`);
    write(
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoNum} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    );

    return Buffer.concat(chunks);
  }
}

export const PAGE = { A4_LANDSCAPE, A4_PORTRAIT };

/** House palette, kept in sync with the application's risk colours. */
export const COLOR = {
  ink: [0.04, 0.08, 0.16],
  ink2: [0.28, 0.33, 0.41],
  ink3: [0.51, 0.56, 0.64],
  line: [0.84, 0.87, 0.91],
  lineStrong: [0.72, 0.76, 0.82],
  brand: [0.11, 0.31, 0.85],
  navy: [0.03, 0.07, 0.14],
  surface: [0.97, 0.98, 0.99],
  amber: [0.85, 0.55, 0.05],
  low: [0.06, 0.72, 0.51],
  medium: [0.96, 0.62, 0.04],
  high: [0.98, 0.45, 0.09],
  critical: [0.88, 0.11, 0.28],
  white: [1, 1, 1],
};
