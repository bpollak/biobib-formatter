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
import { validateDocument } from '../lib/pipeline/validator';
import { applyAutoFixes } from '../lib/pipeline/fixer';
import { DocumentMetadata } from '../lib/types';

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
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
  headerXml?: string;
}

async function buildDocx(parts: DocxParts): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('word/_rels/document.xml.rels', DOC_RELS);
  zip.file('word/document.xml', parts.documentXml);
  zip.file('word/styles.xml', STYLES_XML);
  if (parts.headerXml) {
    zip.file('word/header1.xml', parts.headerXml);
  }
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

async function main() {
  await testTrackChanges();
  await testHeaderColors();
  await testMathRuns();

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
