/**
 * Stress test the auto-fixer with synthetic .docx fixtures targeting
 * edge cases not covered by the supplied dissertations:
 *
 *  - Track changes (<w:rPrChange>): is the historical color/italic
 *    record corrupted by our color/italic fixers?
 *  - Headers (header1.xml): does the fixer process colored text in
 *    headers when the validator triggers it via body content?
 *  - Math equations (<m:oMath>): are runs inside math zones extracted
 *    and validated? (Likely a gap rather than a bug.)
 *
 * Each scenario constructs a minimal valid .docx in memory, runs the
 * pipeline, and asserts the expected before/after state.
 */
import JSZip from 'jszip';
import { parseDocument } from '../lib/pipeline/parser';
import { buildValidationResults, validateDocument } from '../lib/pipeline/validator';
import { applyAutoFixes } from '../lib/pipeline/fixer';
import { DocumentMetadata, DocumentModel } from '../lib/types';

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>
  <Override PartName="/word/endnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"/>
  <Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
</Relationships>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman"/></w:rPr></w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`;

interface DocxParts {
  documentXml: string;
  stylesXml?: string;
  headerXml?: string;
  footnotesXml?: string;
  endnotesXml?: string;
  commentsXml?: string;
}

async function buildDocx(parts: DocxParts): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('word/_rels/document.xml.rels', DOC_RELS);
  zip.file('word/document.xml', parts.documentXml);
  zip.file('word/styles.xml', parts.stylesXml ?? STYLES_XML);
  if (parts.headerXml) zip.file('word/header1.xml', parts.headerXml);
  if (parts.footnotesXml) zip.file('word/footnotes.xml', parts.footnotesXml);
  if (parts.endnotesXml) zip.file('word/endnotes.xml', parts.endnotesXml);
  if (parts.commentsXml) zip.file('word/comments.xml', parts.commentsXml);
  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  return Buffer.from(buf);
}

function wrapDocument(bodyContent: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:body>
    ${bodyContent}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

async function processDoc(buffer: Buffer) {
  const meta: DocumentMetadata = {
    type: 'dissertation', degreeType: 'doctoral', fileName: 'synthetic.docx', fileSize: buffer.length,
  };
  const doc = await parseDocument(buffer, meta);
  const ruleResults = validateDocument(doc);
  const { correctedBuffer, changes } = await applyAutoFixes(buffer, doc, ruleResults);
  return { doc, ruleResults, correctedBuffer, changes };
}

async function readFromDocx(buffer: Buffer, path: string): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  return (await zip.file(path)?.async('string')) || '';
}

interface TestResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: TestResult[] = [];

function expect(name: string, condition: boolean, detail: string) {
  results.push({ name, ok: condition, detail });
  console.log(`  ${condition ? '✓' : '✗'} ${name}: ${detail}`);
}

// ── Test 1: Track changes corruption ────────────────────────────────────
async function testTrackChanges() {
  console.log('\n── Test: Track changes <w:rPrChange> not corrupted by color fix ──');

  // Body has a long paragraph with a current RED color and a historical
  // BLUE color in <w:rPrChange>. Validator should flag FONT-005 (RED is
  // current). Fixer should change RED → 000000 but PRESERVE the historical
  // BLUE in <w:rPrChange>.
  const body = `<w:p><w:r>
      <w:rPr>
        <w:color w:val="FF0000"/>
        <w:rPrChange w:id="0" w:author="reviewer"><w:rPr>
          <w:color w:val="0000FF"/>
        </w:rPr></w:rPrChange>
      </w:rPr>
      <w:t>This paragraph contains substantial text to qualify as body content for first-line indentation rule.</w:t>
    </w:r></w:p>`;
  const buffer = await buildDocx({ documentXml: wrapDocument(body) });
  const { ruleResults, correctedBuffer, changes } = await processDoc(buffer);

  const font005 = ruleResults.find(r => r.ruleId === 'FONT-005');
  expect('validator flags FONT-005', font005?.status === 'fail', `status=${font005?.status}`);

  const wasFixed = changes.some(c => c.ruleId === 'FONT-005');
  expect('fixer dispatched FONT-005', wasFixed, `${changes.length} changes`);

  const correctedXml = await readFromDocx(correctedBuffer, 'word/document.xml');
  // Current color should be 000000.
  const hasCurrentBlack = /<w:color w:val="000000"\/>\s*<w:rPrChange/.test(correctedXml);
  expect('current color is now 000000', hasCurrentBlack, 'matches `<w:color val="000000"/> <w:rPrChange ...>`');

  // Historical color in <w:rPrChange> should be preserved as 0000FF.
  const historicalPreserved = /<w:rPrChange[^>]*>[\s\S]*?<w:color w:val="0000FF"\/>/.test(correctedXml);
  expect('historical color in <w:rPrChange> preserved (BUG: currently corrupted)', historicalPreserved,
    historicalPreserved
      ? 'BLUE preserved in revision history'
      : 'BLUE was overwritten — fixer corrupts revision history');
}

// ── Test 2: Headers get color fixes when fixer runs ─────────────────────
async function testHeaderColors() {
  console.log('\n── Test: Headers should be color-fixed when fixer runs ──');

  // Body has colored text (validator flags), header also has colored text.
  const body = `<w:p><w:r>
      <w:rPr><w:color w:val="FF0000"/></w:rPr>
      <w:t>Body text in red — long enough to qualify for first-line indent rule.</w:t>
    </w:r></w:p>`;
  const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:r>
    <w:rPr><w:color w:val="00FF00"/></w:rPr>
    <w:t>Header text in green</w:t>
  </w:r></w:p>
</w:hdr>`;

  const buffer = await buildDocx({ documentXml: wrapDocument(body), headerXml });
  const { ruleResults, correctedBuffer, changes } = await processDoc(buffer);

  const font005 = ruleResults.find(r => r.ruleId === 'FONT-005');
  expect('validator flags FONT-005 (sees body red)', font005?.status === 'fail', `status=${font005?.status}`);
  expect('fixer dispatched FONT-005', changes.some(c => c.ruleId === 'FONT-005'), '');

  const bodyXml = await readFromDocx(correctedBuffer, 'word/document.xml');
  expect('body color now 000000', /<w:color w:val="000000"/.test(bodyXml) && !/FF0000/.test(bodyXml),
    /FF0000/.test(bodyXml) ? 'FF0000 still present in body' : 'fixed');

  const headerOut = await readFromDocx(correctedBuffer, 'word/header1.xml');
  const headerStillGreen = /00FF00/.test(headerOut);
  expect('header color also fixed (BUG: currently NOT fixed)', !headerStillGreen,
    headerStillGreen ? 'header still has 00FF00 — fixer ignores headers' : 'header fixed');
}

// ── Test 3: Math equation runs (<m:r>) — feature gap ─────────────────────
async function testMathRuns() {
  console.log('\n── Test: Math <m:r> runs (likely a feature gap) ──');

  const body = `<w:p>
    <m:oMathPara><m:oMath>
      <m:r><w:rPr><w:color w:val="FF0000"/></w:rPr><m:t>x² + y² = z²</m:t></m:r>
    </m:oMath></m:oMathPara>
  </w:p>`;
  const buffer = await buildDocx({ documentXml: wrapDocument(body) });
  const { ruleResults, correctedBuffer } = await processDoc(buffer);

  const font005 = ruleResults.find(r => r.ruleId === 'FONT-005');
  // The validator may or may not see the color — math runs are <m:r>, but
  // <w:color> inside is still scannable by raw-XML regex.
  console.log(`  validator FONT-005 status on math-only red: ${font005?.status}`);

  const xmlOut = await readFromDocx(correctedBuffer, 'word/document.xml');
  const mathStillRed = /<m:r[\s\S]*?<w:color w:val="FF0000"/.test(xmlOut);
  expect('math color fixed by raw-XML scan', !mathStillRed,
    mathStillRed ? 'fixer missed math run color' : 'math color fixed');
}

// ── Test 4: Theme colors override w:val ─────────────────────────────────
async function testThemeColors() {
  console.log('\n── Test: <w:color w:val="..." w:themeColor="..."/> ──');

  // A run with both w:val (red) and w:themeColor (accent1). Word renders
  // via the theme color and ignores w:val. Our fix must strip the theme
  // attributes too — otherwise the visible color persists.
  const body = `<w:p><w:r>
      <w:rPr><w:color w:val="FF0000" w:themeColor="accent1"/></w:rPr>
      <w:t>This paragraph has substantial text and a themed accent color override.</w:t>
    </w:r></w:p>`;
  const buffer = await buildDocx({ documentXml: wrapDocument(body) });
  const { ruleResults, correctedBuffer, changes } = await processDoc(buffer);

  const font005 = ruleResults.find(r => r.ruleId === 'FONT-005');
  expect('validator flags themed FONT-005', font005?.status === 'fail', `status=${font005?.status}`);
  expect('fixer dispatched FONT-005', changes.some(c => c.ruleId === 'FONT-005'), '');

  const xmlOut = await readFromDocx(correctedBuffer, 'word/document.xml');
  const themePresent = /w:themeColor=/.test(xmlOut);
  expect('w:themeColor stripped (else Word still renders accent color)',
    !themePresent,
    themePresent ? 'w:themeColor still present — Word will still paint accent1' : 'theme attributes stripped');
}

// ── Test 5: Footnotes / endnotes / comments color processing ────────────
async function testFootnoteEndnoteComments() {
  console.log('\n── Test: footnote / endnote / comment color processing ──');

  const body = `<w:p><w:r>
      <w:rPr><w:color w:val="FF0000"/></w:rPr>
      <w:t>Body has red text — long enough to qualify for indent rule too.</w:t>
    </w:r></w:p>`;
  const footnotesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:footnote w:id="1"><w:p><w:r>
    <w:rPr><w:color w:val="00FF00"/></w:rPr>
    <w:t>Footnote text in green</w:t>
  </w:r></w:p></w:footnote>
</w:footnotes>`;
  const endnotesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:endnote w:id="1"><w:p><w:r>
    <w:rPr><w:color w:val="0000FF"/></w:rPr>
    <w:t>Endnote text in blue</w:t>
  </w:r></w:p></w:endnote>
</w:endnotes>`;
  const commentsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:comment w:id="1" w:author="reviewer" w:date="2026-01-01"><w:p><w:r>
    <w:rPr><w:color w:val="FF00FF"/></w:rPr>
    <w:t>Comment in magenta</w:t>
  </w:r></w:p></w:comment>
</w:comments>`;

  const buffer = await buildDocx({
    documentXml: wrapDocument(body),
    footnotesXml, endnotesXml, commentsXml,
  });
  const { correctedBuffer, changes } = await processDoc(buffer);
  expect('fixer dispatched FONT-005 (from body)', changes.some(c => c.ruleId === 'FONT-005'), '');

  const fnOut = await readFromDocx(correctedBuffer, 'word/footnotes.xml');
  const enOut = await readFromDocx(correctedBuffer, 'word/endnotes.xml');
  const cmOut = await readFromDocx(correctedBuffer, 'word/comments.xml');
  expect('footnote color fixed', !/00FF00/.test(fnOut), /00FF00/.test(fnOut) ? 'still green' : 'green→black');
  expect('endnote color fixed', !/0000FF/.test(enOut), /0000FF/.test(enOut) ? 'still blue' : 'blue→black');
  expect('comment color fixed', !/FF00FF/.test(cmOut), /FF00FF/.test(cmOut) ? 'still magenta' : 'magenta→black');
}

// ── Test 6: Page-numbering picks the right section ──────────────────────
async function testPageNumberingSectionPicker() {
  console.log('\n── Test: page-numbering section picker on multi-section docs ──');

  // Title section, copyright section, prelim section, body section.
  // Each section has its own sectPr with type="continuous". Validator
  // should detect Roman / Arabic numbering issues. Fixer should apply
  // lowerRoman start=3 to the prelim section (3rd) and decimal start=1
  // to the body (4th, last).
  const body = `<w:p><w:r><w:t>UNIVERSITY OF CALIFORNIA SAN DIEGO</w:t></w:r></w:p>
<w:p><w:r><w:t>Title page substantial content for body indent rule.</w:t></w:r></w:p>
<w:p><w:pPr><w:sectPr><w:type w:val="continuous"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:pPr></w:p>
<w:p><w:r><w:t>Copyright © 2026 — substantial content text here for body filtering.</w:t></w:r></w:p>
<w:p><w:pPr><w:sectPr><w:type w:val="continuous"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:pPr></w:p>
<w:p><w:r><w:t>Acknowledgments and table of contents go in this prelim section.</w:t></w:r></w:p>
<w:p><w:pPr><w:sectPr><w:type w:val="continuous"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:pPr></w:p>
<w:p><w:r><w:t>Chapter 1: Introduction with substantial body content text here.</w:t></w:r></w:p>`;

  const buffer = await buildDocx({ documentXml: wrapDocument(body) });
  const { correctedBuffer } = await processDoc(buffer);
  const xmlOut = await readFromDocx(correctedBuffer, 'word/document.xml');

  // sectPr count
  const sectPrs = xmlOut.match(/<w:sectPr\b/g) || [];
  expect('document has 4 sectPr elements (3 inline + 1 trailing)', sectPrs.length === 4,
    `found ${sectPrs.length} sectPr`);

  // Whichever sectPr ends up with lowerRoman start=3 should be the prelim
  // section (the one whose preceding content mentions acknowledgments,
  // contents, abstract, etc.) — not the title section.
  const lowerRomanContext = /([\s\S]{0,400})<w:pgNumType[^>]*w:fmt="lowerRoman"[^>]*w:start="3"/.exec(xmlOut);
  if (!lowerRomanContext) {
    expect('lowerRoman start=3 applied somewhere', false, 'not applied');
  } else {
    const ctx = lowerRomanContext[1].toLowerCase();
    const isPrelim = /acknowledg|contents|abstract|prelim/.test(ctx);
    expect('lowerRoman start=3 applied to prelim section, not title',
      isPrelim,
      isPrelim ? 'preceding context looks like prelim' : `applied to wrong section: "${ctx.slice(-200)}"`);
  }
}

// ── Test 7: Document language detection ─────────────────────────────────
async function testDocumentLanguageDetection() {
  console.log("\n── Test: document language detection (don't override existing non-English) ──");

  // A doc explicitly tagged as Spanish in styles.xml. fixDocumentLanguage
  // should NOT overwrite it with en-US.
  const stylesWithSpanish = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="Times New Roman"/>
      <w:lang w:val="es-ES"/>
    </w:rPr></w:rPrDefault>
  </w:docDefaults>
</w:styles>`;

  // Body content that triggers SOMETHING (so fixer runs) but won't make
  // A11Y-005 fail (because lang is already set). Use a colored run.
  const body = `<w:p><w:r>
      <w:rPr><w:color w:val="FF0000"/></w:rPr>
      <w:t>Spanish dissertation with red text — long enough for body indent rule.</w:t>
    </w:r></w:p>`;
  const buffer = await buildDocx({ documentXml: wrapDocument(body), stylesXml: stylesWithSpanish });
  const { ruleResults, correctedBuffer } = await processDoc(buffer);

  const a11y005 = ruleResults.find(r => r.ruleId === 'A11Y-005');
  // Lang IS set (to es-ES), so A11Y-005 should pass without dispatching the fix.
  expect('A11Y-005 passes when non-English lang already set', a11y005?.status === 'pass',
    `status=${a11y005?.status}`);

  // Verify the corrected output preserves es-ES.
  const stylesOut = await readFromDocx(correctedBuffer, 'word/styles.xml');
  expect('non-English language preserved', /w:val="es-ES"/.test(stylesOut),
    /w:val="en-US"/.test(stylesOut) ? 'overwritten with en-US' : 'es-ES preserved');
}

// ── Test 8: PDF report paginates many fixes (no silent truncation) ──────
async function testPdfReportPagination() {
  console.log("\n── Test: PDF report paginates a high-fix-count document ──");
  const { generateReportPDFClient } = await import('../lib/pipeline/reporter-client');
  const { PDFDocument } = await import('pdf-lib');
  const fakeResults = {
    sessionId: 'stress',
    metadata: { type: 'dissertation' as const, degreeType: 'doctoral' as const, fileName: 'stress.docx', fileSize: 1000 },
    summary: { total: 84, passed: 20, failed: 30, warned: 25, autoFixed: 9, skipped: 0,
               overallStatus: 'fail' as const },
    rules: [],
    changes: Array.from({ length: 30 }, (_, i) => ({
      ruleId: `RULE-${i.toString().padStart(3, '0')}`,
      description: `Auto-fixed change number ${i + 1} with a moderately long description that should fit within the truncation budget.`,
      location: `Paragraph ${i * 10}`,
      before: 'before',
      after: 'after',
    })),
    manualFixes: Array.from({ length: 25 }, (_, i) => ({
      ruleId: `MANUAL-${i.toString().padStart(3, '0')}`,
      severity: 'major' as const,
      title: `Manual fix ${i + 1}: title that is moderately long`,
      instruction: 'Open the document, select the affected paragraph, and apply the corresponding GEPA-required formatting change manually using the Format menu.',
      location: `Paragraph ${i * 7}`,
    })),
  };
  const pdfBytes = await generateReportPDFClient(fakeResults);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pageCount = pdfDoc.getPageCount();
  expect('PDF report has more than 1 page when there are 30+30 entries', pageCount > 1, `${pageCount} pages, ${pdfBytes.length} bytes`);
  // Roughly check: ~13 entries per page → 30 changes + 25 manual fixes = ~5 pages.
  expect('PDF report covers all entries (>= 4 pages)', pageCount >= 4, `${pageCount} pages`);
}

// ── Test 9: API rejects degenerate inputs with friendly messages ─────────
async function testApiDegenerateInputs() {
  console.log("\n── Test: pipeline behavior on near-empty / corrupt input ──");

  // Near-empty doc — pipeline should still parse, but the API layer rejects
  // it before validation. We test the parser directly here; the API rejection
  // is exercised by the route's < 10 paragraphs check.
  const zip = new JSZip();
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Single paragraph.</w:t></w:r></w:p><w:sectPr/></w:body></w:document>');
  zip.file('word/styles.xml', '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:styles>');
  const buf = Buffer.from(await zip.generateAsync({ type: 'arraybuffer' }));
  const doc = await parseDocument(buf, {
    type: 'dissertation', degreeType: 'doctoral', fileName: 'tiny.docx', fileSize: buf.length,
  });
  expect('parser does not crash on tiny doc', doc.paragraphs.length >= 1, `${doc.paragraphs.length} paragraphs`);
  expect('API guard would reject (< 10 paragraphs)', doc.paragraphs.length < 10,
    `paragraphs=${doc.paragraphs.length} → /api/check returns 400`);
}

// ── Test 10: Missing paragraph spacing is detected and created ──────────
async function testMissingSpacingFix() {
  console.log("\n── Test: missing <w:spacing> is detected and auto-fixed ──");

  const body = `<w:p>
    <w:pPr><w:pStyle w:val="Normal"/></w:pPr>
    <w:r><w:t>This body paragraph has no explicit spacing node, so Word can inherit single spacing.</w:t></w:r>
  </w:p>`;
  const buffer = await buildDocx({ documentXml: wrapDocument(body) });
  const { ruleResults, correctedBuffer, changes } = await processDoc(buffer);

  const space001 = ruleResults.find(r => r.ruleId === 'SPACE-001');
  expect('validator flags missing spacing as SPACE-001 failure', space001?.status === 'fail',
    `status=${space001?.status}`);
  expect('fixer attributes missing spacing to SPACE-001', changes.some(c => c.ruleId === 'SPACE-001'),
    `${changes.length} change(s)`);

  const xmlOut = await readFromDocx(correctedBuffer, 'word/document.xml');
  expect('fixer creates double-spacing node', /<w:spacing[^>]*w:line="480"[^>]*w:lineRule="auto"/.test(xmlOut),
    'w:spacing line=480 inserted');
}

// ── Test 11: Abstract-only spacing fix is attributed correctly ──────────
async function testAbstractSpacingAttribution() {
  console.log("\n── Test: abstract spacing fix is marked auto-fixed ──");

  const body = `<w:p><w:r><w:t>Abstract</w:t></w:r></w:p>
  <w:p>
    <w:pPr><w:pStyle w:val="Abstract"/><w:spacing w:line="240" w:lineRule="auto"/></w:pPr>
    <w:r><w:t>This abstract paragraph is intentionally single-spaced and long enough to be checked.</w:t></w:r>
  </w:p>
  <w:p><w:r><w:t>Chapter 1</w:t></w:r></w:p>`;
  const buffer = await buildDocx({ documentXml: wrapDocument(body) });
  const metadata: DocumentMetadata = {
    type: 'dissertation', degreeType: 'doctoral', fileName: 'abstract.docx', fileSize: buffer.length,
  };
  const doc = await parseDocument(buffer, metadata);
  const ruleResults = validateDocument(doc);
  const { correctedBuffer, changes } = await applyAutoFixes(buffer, doc, ruleResults);
  const correctedDoc = await parseDocument(correctedBuffer, metadata);
  const finalResults = buildValidationResults(
    'abstract-spacing',
    metadata,
    ruleResults,
    changes,
    validateDocument(correctedDoc)
  );

  const originalAbstract = ruleResults.find(r => r.ruleId === 'ABSTRACT-004');
  const finalAbstract = finalResults.rules.find(r => r.ruleId === 'ABSTRACT-004');
  expect('validator flags ABSTRACT-004', originalAbstract?.status === 'fail',
    `status=${originalAbstract?.status}`);
  expect('fixer records ABSTRACT-004 change', changes.some(c => c.ruleId === 'ABSTRACT-004'),
    `${changes.map(c => c.ruleId).join(', ')}`);
  expect('final results mark ABSTRACT-004 auto-fixed', finalAbstract?.status === 'auto-fixed',
    `status=${finalAbstract?.status}`);
}

// ── Test 12: Type/degree mismatch no longer skips both word-count rules ─
async function testAbstractTypeDegreeMismatch() {
  console.log("\n── Test: invalid type/degree metadata does not skip both abstract limits ──");

  const doc: DocumentModel = {
    metadata: { type: 'dissertation', degreeType: 'masters', fileName: 'mismatch.docx', fileSize: 100 },
    rawXml: '',
    stylesXml: '',
    numberingXml: '',
    paragraphs: [],
    margins: [{ top: 3600, bottom: 1440, left: 1440, right: 1440, header: 720, footer: 720, sectionIndex: 0 }],
    styles: { fonts: ['Times New Roman'], sizes: [24], colors: [], hasColoredText: false, dominantFont: 'Times New Roman', dominantSize: 24 },
    figures: [],
    tables: [],
    references: [],
    titlePage: {
      detected: true, hasUniversityName: true, universityNameCorrect: true, hasInLine: true,
      hasbyLine: true, committeeDetected: false, paragraphIndices: [],
    },
    abstract: { detected: true, wordCount: 300, topMargin: 3600, paragraphIndices: [] },
    pageNumbering: {
      hasPrelimRoman: true, hasBodyArabic: true, romanStartsAtIii: true,
      arabicStartsAtOne: true, pageNumbersAtBottom: true, pageNumbersCentered: true,
    },
    sections: [{ type: 'title', startParagraphIndex: 0, endParagraphIndex: 0, detected: true, confidence: 'high' }],
    pages: [],
  };

  const abstractRules = validateDocument(doc).filter(r => r.ruleId === 'ABSTRACT-001' || r.ruleId === 'ABSTRACT-002');
  const skippedBoth = abstractRules.every(r => r.status === 'skipped');
  expect('mismatched metadata does not skip both abstract word-count checks', !skippedBoth,
    abstractRules.map(r => `${r.ruleId}:${r.status}`).join(', '));
}

async function main() {
  await testTrackChanges();
  await testHeaderColors();
  await testMathRuns();
  await testThemeColors();
  await testFootnoteEndnoteComments();
  await testPageNumberingSectionPicker();
  await testDocumentLanguageDetection();
  await testPdfReportPagination();
  await testApiDegenerateInputs();
  await testMissingSpacingFix();
  await testAbstractSpacingAttribution();
  await testAbstractTypeDegreeMismatch();

  console.log(`\n${'═'.repeat(60)}`);
  const failures = results.filter(r => !r.ok);
  console.log(`${results.length - failures.length}/${results.length} assertions passed`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  ✗ ${f.name}: ${f.detail}`);
  }
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(2); });
