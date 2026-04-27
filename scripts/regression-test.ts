/**
 * Regression test: run the full pipeline against the supplied dissertations
 * and verify the auto-fixer's output is valid and self-consistent.
 *
 * Run with: `npm run test:regression`.
 *
 * Fixtures are read from the repo root (the `Copy of *.docx` files).
 */
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { parseDocument } from '../lib/pipeline/parser';
import { validateDocument, buildValidationResults } from '../lib/pipeline/validator';
import { applyAutoFixes } from '../lib/pipeline/fixer';
import { DocumentMetadata, RuleResult, ChangeRecord } from '../lib/types';
import { allRules } from '../lib/rules';
import { isBodySkipStyle } from '../lib/style-skip';

const REPO_ROOT = path.resolve(__dirname, '..');

interface DocCheck {
  name: string;
  ok: boolean;
  detail: string;
}

const FIXTURES = [
  'Copy of Cheng_Li_PhD dissertation.docx',
  'Copy of Nies_Laurie- Rough Draft Dissertation Formatted 5-9.docx',
  'Copy of Niles_Renee_PhD_Dissertation_Draft.docx',
  'Copy of West_Melanie Dissertation .docx',
];

const VALID_RULE_IDS = new Set(allRules.map(r => r.id));

async function checkCorrectedZip(originalBuffer: Buffer, correctedBuffer: Buffer): Promise<DocCheck> {
  try {
    const zip = await JSZip.loadAsync(correctedBuffer);
    const docXml = await zip.file('word/document.xml')?.async('string');
    if (!docXml) return { name: 'corrected zip', ok: false, detail: 'word/document.xml missing' };
    // The bug we previously had emitted <w:w:spacing>; ensure no double-prefixed elements.
    if (/<w:w:[a-zA-Z]/.test(docXml)) {
      const sample = (docXml.match(/<w:w:[a-zA-Z][^>]*>/g) || []).slice(0, 3).join(' ');
      return { name: 'corrected zip', ok: false, detail: `double-prefixed elements present: ${sample}` };
    }
    // Ensure no NEW $1/$2/$3 leaked vs. the original (some docs legitimately
    // contain these in their text — only flag if our pipeline introduced more).
    const origZip = await JSZip.loadAsync(originalBuffer);
    const origXml = (await origZip.file('word/document.xml')?.async('string')) || '';
    const origCount = (origXml.match(/\$[1-9]/g) || []).length;
    const fixCount = (docXml.match(/\$[1-9]/g) || []).length;
    if (fixCount > origCount) {
      return { name: 'corrected zip', ok: false, detail: `replacement-token leak: ${fixCount - origCount} new $N tokens` };
    }
    return { name: 'corrected zip', ok: true, detail: 'valid OOXML, parseable' };
  } catch (err) {
    return { name: 'corrected zip', ok: false, detail: `failed to open as zip: ${(err as Error).message}` };
  }
}

function checkChangeRuleIds(changes: ChangeRecord[]): DocCheck {
  const unknown = changes.map(c => c.ruleId).filter(id => !VALID_RULE_IDS.has(id));
  if (unknown.length > 0) {
    return { name: 'change rule IDs', ok: false, detail: `unknown rule IDs in changes: ${[...new Set(unknown)].join(', ')}` };
  }
  return { name: 'change rule IDs', ok: true, detail: `${changes.length} change(s), all rule IDs valid` };
}

function checkNoBrokenAutoFixes(rules: RuleResult[]): DocCheck {
  // REF-002/REF-003 should never appear as 'auto-fixed' anymore (we disabled the broken fix)
  const ghosts = rules.filter(r =>
    (r.ruleId === 'REF-002' || r.ruleId === 'REF-003') && r.status === 'auto-fixed'
  );
  if (ghosts.length > 0) {
    return { name: 'no ghost auto-fixes', ok: false, detail: `REF-002/REF-003 marked auto-fixed: ${ghosts.map(g => g.ruleId).join(', ')}` };
  }
  return { name: 'no ghost auto-fixes', ok: true, detail: 'REF-002/REF-003 never claim auto-fixed' };
}

function checkMarginAttribution(rules: RuleResult[], changes: ChangeRecord[]): DocCheck {
  // For every margin rule that flipped to 'auto-fixed', there should be a matching change record.
  const fixedMarginRuleIds = rules
    .filter(r => r.ruleId.startsWith('MARGIN-') && r.status === 'auto-fixed')
    .map(r => r.ruleId);
  if (fixedMarginRuleIds.length === 0) {
    return { name: 'margin attribution', ok: true, detail: 'no margin auto-fixes to attribute' };
  }
  const changedMarginIds = new Set(changes.filter(c => c.ruleId.startsWith('MARGIN-')).map(c => c.ruleId));
  const missing = fixedMarginRuleIds.filter(id => !changedMarginIds.has(id));
  if (missing.length > 0) {
    return { name: 'margin attribution', ok: false, detail: `flipped to auto-fixed but no change record: ${missing.join(', ')}` };
  }
  return { name: 'margin attribution', ok: true, detail: `${fixedMarginRuleIds.length} margin rule(s) attributed correctly` };
}

function checkSummaryConsistency(results: ReturnType<typeof buildValidationResults>): DocCheck {
  const counted = results.summary.passed + results.summary.failed + results.summary.warned + results.summary.autoFixed + results.summary.skipped;
  if (counted !== results.summary.total) {
    return { name: 'summary consistency', ok: false, detail: `bucket sum ${counted} != total ${results.summary.total}` };
  }
  return { name: 'summary consistency', ok: true, detail: `${results.summary.total} rules bucketed correctly` };
}

// Rules whose fixers are known to be partial — they emit a ChangeRecord but
// re-validating the corrected document still flags the same rule as 'fail'.
// Currently empty: every auto-fixable rule round-trips cleanly. If a rule
// shows up here in the future, treat it as a real regression and either fix
// the underlying writer or add it explicitly with a code comment explaining why.
const KNOWN_PARTIAL_FIXES = new Set<string>();

async function checkRoundTripFixesHold(
  originalBuffer: Buffer,
  correctedBuffer: Buffer,
  metadata: DocumentMetadata,
  finalRules: RuleResult[]
): Promise<DocCheck> {
  // Re-parse + re-validate the corrected document. Any rule we marked
  // 'auto-fixed' should now pass (or at least not still fail) when re-checked.
  const correctedDoc = await parseDocument(correctedBuffer, metadata);
  const correctedResults = validateDocument(correctedDoc);
  const correctedById = new Map(correctedResults.map(r => [r.ruleId, r]));
  const stillFailing: string[] = [];
  for (const rule of finalRules) {
    if (rule.status !== 'auto-fixed') continue;
    const after = correctedById.get(rule.ruleId);
    if (after && after.status === 'fail') {
      stillFailing.push(rule.ruleId);
    }
  }
  void originalBuffer;
  const unexpected = stillFailing.filter(id => !KNOWN_PARTIAL_FIXES.has(id));
  if (unexpected.length > 0) {
    return { name: 'auto-fixes hold on round-trip', ok: false, detail: `unexpected partial fixes: ${unexpected.join(', ')}` };
  }
  if (stillFailing.length > 0) {
    return { name: 'auto-fixes hold on round-trip', ok: true, detail: `partial fixes (known): ${stillFailing.join(', ')}` };
  }
  return { name: 'auto-fixes hold on round-trip', ok: true, detail: 'every auto-fixed rule now passes/skips on re-validation' };
}

async function checkMarginsActuallyFixed(originalBuffer: Buffer, correctedBuffer: Buffer): Promise<DocCheck> {
  const originalDoc = await parseDocument(originalBuffer, { type: 'dissertation', degreeType: 'doctoral', fileName: 'orig.docx', fileSize: originalBuffer.length });
  const originalResults = validateDocument(originalDoc);
  const marginFailing = originalResults.filter(r => r.ruleId.startsWith('MARGIN-') && r.status === 'fail' && r.autoFixable);
  if (marginFailing.length === 0) {
    return { name: 'margins actually fixed', ok: true, detail: 'no fixable margin failures in original' };
  }
  const zip = await JSZip.loadAsync(correctedBuffer);
  const docXml = (await zip.file('word/document.xml')?.async('string')) || '';
  const pgMarRegex = /<w:pgMar\b[^/]*\/>/g;
  const violations: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = pgMarRegex.exec(docXml)) !== null) {
    const pgMar = m[0];
    for (const attr of ['w:top', 'w:bottom', 'w:left', 'w:right']) {
      const val = new RegExp(`${attr.replace(':', '\\:')}="(\\d+)"`).exec(pgMar);
      if (val && parseInt(val[1]) < 1440) {
        violations.push(`${attr}=${val[1]}`);
      }
    }
  }
  if (violations.length > 0) {
    return { name: 'margins actually fixed', ok: false, detail: `still under 1440: ${violations.slice(0, 3).join(', ')}` };
  }
  return { name: 'margins actually fixed', ok: true, detail: `${marginFailing.length} margin rule(s) flagged + corrected` };
}

// ─────────────────────────────────────────────────────────────────────────
// Byte-level fix assertions
//
// These open the corrected docx and assert specific XML invariants for each
// auto-fixed rule. They're more granular than the round-trip check and
// transparent about what was verified (e.g. "after FONT-005, every <w:color>
// in the output has w:val=000000 or auto"). Each only runs if the rule was
// actually marked auto-fixed for this fixture.
// ─────────────────────────────────────────────────────────────────────────

interface ByteSources {
  documentXml: string;
  stylesXml: string;
  footerXmls: string[];
}

async function loadByteSources(buffer: Buffer): Promise<ByteSources> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = (await zip.file('word/document.xml')?.async('string')) || '';
  const stylesXml = (await zip.file('word/styles.xml')?.async('string')) || '';
  const footerXmls: string[] = [];
  for (const path of Object.keys(zip.files)) {
    if (/^word\/footer\d+\.xml$/i.test(path)) {
      footerXmls.push((await zip.file(path)?.async('string')) || '');
    }
  }
  return { documentXml, stylesXml, footerXmls };
}

const APPROVED_FONT_LIST = ['arial', 'century gothic', 'helvetica', 'times new roman'];

function checkFont001(src: ByteSources): DocCheck {
  // After FONT-001: every w:rFonts ascii/hAnsi/cs/eastAsia attribute is in
  // the approved list (case-insensitive substring match like the fixer uses).
  let scanned = 0;
  const offenders: string[] = [];
  const rFontsRe = /<w:rFonts\b[^>]*>/g;
  for (const xml of [src.documentXml, src.stylesXml]) {
    let m: RegExpExecArray | null;
    while ((m = rFontsRe.exec(xml)) !== null) {
      scanned++;
      for (const attr of ['w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia']) {
        const v = new RegExp(`${attr.replace(':', '\\:')}="([^"]+)"`).exec(m[0]);
        if (!v) continue;
        const fontVal = v[1].toLowerCase();
        if (!APPROVED_FONT_LIST.some(f => fontVal.includes(f))) {
          offenders.push(`${attr}="${v[1]}"`);
        }
      }
    }
  }
  if (offenders.length > 0) {
    return { name: 'FONT-001 byte-level', ok: false, detail: `${offenders.length} unapproved font attr(s): ${[...new Set(offenders)].slice(0, 3).join(', ')}` };
  }
  return { name: 'FONT-001 byte-level', ok: true, detail: `${scanned} <w:rFonts> scanned, all in approved list` };
}

function checkFont005(src: ByteSources): DocCheck {
  // After FONT-005: every <w:color> in document.xml AND styles.xml has
  // w:val="000000" or "auto" (case-insensitive on the hex form).
  let scanned = 0;
  const offenders: string[] = [];
  const colorRe = /<w:color\b[^>]*>/g;
  for (const xml of [src.documentXml, src.stylesXml]) {
    let m: RegExpExecArray | null;
    while ((m = colorRe.exec(xml)) !== null) {
      scanned++;
      const v = /w:val="([^"]+)"/.exec(m[0]);
      if (!v) continue;
      const val = v[1];
      if (val !== '000000' && val.toLowerCase() !== '000000' && val !== 'auto') {
        offenders.push(val);
      }
    }
  }
  if (offenders.length > 0) {
    return { name: 'FONT-005 byte-level', ok: false, detail: `${offenders.length} non-black colors: ${[...new Set(offenders)].slice(0, 3).join(', ')}` };
  }
  return { name: 'FONT-005 byte-level', ok: true, detail: `${scanned} <w:color> elements all 000000 or auto` };
}

function checkSpace001(src: ByteSources): DocCheck {
  // After SPACE-001: no body paragraph (mirroring the fixer's exclusion via
  // isBodySkipStyle) has an explicit <w:spacing> with w:line < 480, except
  // w:lineRule="exact" which the fixer preserves. Extract paragraphs first,
  // then test per-paragraph — handles both <w:p/> self-closing form and
  // <w:p>...</w:p> open-close form so we don't span paragraph boundaries.
  let scanned = 0;
  let bad = 0;
  const pRe = /<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(src.documentXml)) !== null) {
    const pXml = m[0];
    if (/^<w:p\b[^>]*\/>$/.test(pXml)) continue;
    const pPrMatch = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(pXml);
    if (!pPrMatch) continue;
    const pPr = pPrMatch[1];
    const styleMatch = /<w:pStyle\s+w:val="([^"]+)"/.exec(pPr);
    const styleName = styleMatch ? styleMatch[1] : 'Normal';
    if (isBodySkipStyle(styleName)) continue;
    const spacing = /<w:spacing\b[^>]*>/.exec(pPr);
    if (!spacing) continue;
    scanned++;
    const lineV = /w:line="(\d+)"/.exec(spacing[0]);
    const lineRuleV = /w:lineRule="([^"]+)"/.exec(spacing[0]);
    if (lineV && parseInt(lineV[1]) < 480 && lineRuleV?.[1] !== 'exact') {
      bad++;
    }
  }
  if (bad > 0) {
    return { name: 'SPACE-001 byte-level', ok: false, detail: `${bad} of ${scanned} body paragraphs still have w:line < 480` };
  }
  return { name: 'SPACE-001 byte-level', ok: true, detail: `${scanned} body paragraphs with explicit spacing all >= 480` };
}

function checkIndent001(src: ByteSources): DocCheck {
  // After INDENT-001: count body paragraphs (>20 chars text, not heading/
  // caption/footnote/toc/list/title) that still have <w:ind> with
  // w:firstLine < 720, OR are missing first-line indent entirely. The
  // fixer is supposed to add it in all three cases (no pPr, no ind,
  // existing ind without firstLine).
  let totalBody = 0;
  let withIndent = 0;
  const pRe = /<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(src.documentXml)) !== null) {
    const pXml = m[0];
    if (/^<w:p\b[^>]*\/>$/.test(pXml)) continue;
    const text = (pXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
      .map(t => t.replace(/<w:t[^>]*>|<\/w:t>/g, ''))
      .join('');
    if (text.trim().length <= 20) continue;
    const styleMatch = /<w:pStyle\s+w:val="([^"]+)"/.exec(pXml);
    const styleName = styleMatch ? styleMatch[1] : 'Normal';
    if (isBodySkipStyle(styleName)) continue;
    totalBody++;
    const indMatch = /<w:ind\b[^>]*>/.exec(pXml);
    if (indMatch) {
      const fl = /w:firstLine="(\d+)"/.exec(indMatch[0]);
      if (fl && parseInt(fl[1]) >= 720) withIndent++;
    }
  }
  if (totalBody === 0) {
    return { name: 'INDENT-001 byte-level', ok: true, detail: 'no body paragraphs to check' };
  }
  // Allow some slack — it's a heuristic. Require >= 95% of body paragraphs
  // to have the indent.
  const pct = Math.round((withIndent / totalBody) * 100);
  if (pct < 95) {
    return { name: 'INDENT-001 byte-level', ok: false, detail: `only ${withIndent} of ${totalBody} body paragraphs (${pct}%) have w:firstLine >= 720` };
  }
  return { name: 'INDENT-001 byte-level', ok: true, detail: `${withIndent} of ${totalBody} body paragraphs (${pct}%) have w:firstLine >= 720` };
}

function checkText001(src: ByteSources): DocCheck {
  // After TEXT-001: no paragraph with a Heading style contains <w:i/> or
  // <w:i> (excluding <w:iCs/> which controls italic for complex scripts).
  // Extract paragraphs individually before testing — a single regex of the
  // form /<w:p>[\s\S]*?<w:pStyle ...Heading...>[\s\S]*?</w:p>/g would silently
  // span across paragraph boundaries when the heading style appears in a later
  // paragraph, falsely flagging any italic text in the preceding paragraph.
  const pRe = /<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let count = 0;
  let italics = 0;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(src.documentXml)) !== null) {
    const para = m[0];
    if (/^<w:p\b[^>]*\/>$/.test(para)) continue;
    if (!/<w:pStyle\s+w:val="Heading[^"]*"/.test(para)) continue;
    count++;
    const cleaned = para.replace(/<w:iCs\b[^>]*\/?>/g, '');
    if (/<w:i\s*\/>/.test(cleaned) || /<w:i>/.test(cleaned)) italics++;
  }
  if (italics > 0) {
    return { name: 'TEXT-001 byte-level', ok: false, detail: `${italics} of ${count} headings still italic` };
  }
  return { name: 'TEXT-001 byte-level', ok: true, detail: `${count} heading(s) checked, none italic` };
}

function checkPage001(src: ByteSources): DocCheck {
  // After PAGE-001: the first <w:sectPr> contains <w:titlePg/>.
  const m = /<w:sectPr\b[^>]*>([\s\S]*?)<\/w:sectPr>/.exec(src.documentXml);
  if (!m) {
    return { name: 'PAGE-001 byte-level', ok: false, detail: 'no <w:sectPr> found' };
  }
  if (!/<w:titlePg/.test(m[1])) {
    return { name: 'PAGE-001 byte-level', ok: false, detail: 'first sectPr missing <w:titlePg/>' };
  }
  return { name: 'PAGE-001 byte-level', ok: true, detail: 'first sectPr has <w:titlePg/>' };
}

function checkPagePrelimRoman(src: ByteSources): DocCheck {
  // After PAGE-003 / PAGE-004: at least one <w:sectPr> has
  // <w:pgNumType w:fmt="lowerRoman" w:start="3"/>.
  if (/<w:pgNumType[^>]*w:fmt="lowerRoman"[^>]*w:start="3"/.test(src.documentXml) ||
      /<w:pgNumType[^>]*w:start="3"[^>]*w:fmt="lowerRoman"/.test(src.documentXml)) {
    return { name: 'PAGE-003/004 byte-level', ok: true, detail: 'pgNumType lowerRoman start=3 present' };
  }
  return { name: 'PAGE-003/004 byte-level', ok: false, detail: 'no sectPr has lowerRoman start=3' };
}

function checkPageBodyArabic(src: ByteSources): DocCheck {
  // After PAGE-005: at least one <w:sectPr> has
  // <w:pgNumType w:fmt="decimal" w:start="1"/>.
  if (/<w:pgNumType[^>]*w:fmt="decimal"[^>]*w:start="1"/.test(src.documentXml) ||
      /<w:pgNumType[^>]*w:start="1"[^>]*w:fmt="decimal"/.test(src.documentXml)) {
    return { name: 'PAGE-005 byte-level', ok: true, detail: 'pgNumType decimal start=1 present' };
  }
  return { name: 'PAGE-005 byte-level', ok: false, detail: 'no sectPr has decimal start=1' };
}

function checkPage006(src: ByteSources): DocCheck {
  // After PAGE-006: every footer paragraph that contains a PAGE field has
  // <w:jc w:val="center"/> in its <w:pPr>.
  let pageParas = 0;
  let centered = 0;
  for (const footer of src.footerXmls) {
    const pRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
    let m: RegExpExecArray | null;
    while ((m = pRe.exec(footer)) !== null) {
      const para = m[0];
      if (!/PAGE/.test(para) && !/<w:pgNum/.test(para)) continue;
      pageParas++;
      if (/<w:jc\s+w:val="center"/.test(para)) centered++;
    }
  }
  if (pageParas === 0) {
    return { name: 'PAGE-006 byte-level', ok: true, detail: 'no PAGE-field paragraphs in footers' };
  }
  if (centered < pageParas) {
    return { name: 'PAGE-006 byte-level', ok: false, detail: `${centered} of ${pageParas} PAGE-field paragraphs centered` };
  }
  return { name: 'PAGE-006 byte-level', ok: true, detail: `${centered} PAGE-field paragraph(s) centered` };
}

function checkA11y002(src: ByteSources): DocCheck {
  // After A11Y-002: every <wp:docPr> has a non-empty descr attribute.
  const re = /<wp:docPr\b[^>]*>/g;
  let total = 0;
  let missing = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src.documentXml)) !== null) {
    total++;
    const d = /descr="([^"]*)"/.exec(m[0]);
    if (!d || d[1].trim() === '') missing++;
  }
  if (missing > 0) {
    return { name: 'A11Y-002 byte-level', ok: false, detail: `${missing} of ${total} <wp:docPr> missing/empty descr` };
  }
  return { name: 'A11Y-002 byte-level', ok: true, detail: `${total} <wp:docPr> all have non-empty descr` };
}

function checkA11y003(src: ByteSources): DocCheck {
  // After A11Y-003: every <w:tbl> contains <w:tblHeader/> somewhere
  // (specifically on the first row).
  const tblRe = /<w:tbl>([\s\S]*?)<\/w:tbl>/g;
  let total = 0;
  let missing = 0;
  let m: RegExpExecArray | null;
  while ((m = tblRe.exec(src.documentXml)) !== null) {
    total++;
    if (!/<w:tblHeader/.test(m[1])) missing++;
  }
  if (total === 0) {
    return { name: 'A11Y-003 byte-level', ok: true, detail: 'no tables to check' };
  }
  if (missing > 0) {
    return { name: 'A11Y-003 byte-level', ok: false, detail: `${missing} of ${total} tables missing <w:tblHeader/>` };
  }
  return { name: 'A11Y-003 byte-level', ok: true, detail: `${total} table(s) all have <w:tblHeader/>` };
}

function checkA11y005(src: ByteSources): DocCheck {
  // After A11Y-005: styles.xml contains <w:lang w:val="en-US"/> in docDefaults.
  if (/<w:lang[^>]+w:val="en-US"/.test(src.stylesXml)) {
    return { name: 'A11Y-005 byte-level', ok: true, detail: 'styles.xml has <w:lang w:val="en-US">' };
  }
  return { name: 'A11Y-005 byte-level', ok: false, detail: 'styles.xml missing <w:lang w:val="en-US">' };
}

async function byteLevelChecks(correctedBuffer: Buffer, autoFixedRuleIds: Set<string>): Promise<DocCheck[]> {
  const src = await loadByteSources(correctedBuffer);
  const out: DocCheck[] = [];
  if (autoFixedRuleIds.has('FONT-001')) out.push(checkFont001(src));
  if (autoFixedRuleIds.has('FONT-005')) out.push(checkFont005(src));
  if (autoFixedRuleIds.has('SPACE-001')) out.push(checkSpace001(src));
  if (autoFixedRuleIds.has('INDENT-001')) out.push(checkIndent001(src));
  if (autoFixedRuleIds.has('TEXT-001')) out.push(checkText001(src));
  if (autoFixedRuleIds.has('PAGE-001')) out.push(checkPage001(src));
  if (autoFixedRuleIds.has('PAGE-003') || autoFixedRuleIds.has('PAGE-004')) out.push(checkPagePrelimRoman(src));
  if (autoFixedRuleIds.has('PAGE-005')) out.push(checkPageBodyArabic(src));
  if (autoFixedRuleIds.has('PAGE-006')) out.push(checkPage006(src));
  if (autoFixedRuleIds.has('A11Y-002')) out.push(checkA11y002(src));
  if (autoFixedRuleIds.has('A11Y-003')) out.push(checkA11y003(src));
  if (autoFixedRuleIds.has('A11Y-005')) out.push(checkA11y005(src));
  return out;
}

async function runOne(filename: string): Promise<{ filename: string; ok: boolean; checks: DocCheck[]; stats: Record<string, number> }> {
  const filePath = path.join(REPO_ROOT, filename);
  const buffer = fs.readFileSync(filePath);

  const metadata: DocumentMetadata = {
    type: 'dissertation',
    degreeType: 'doctoral',
    fileName: filename,
    fileSize: buffer.length,
  };

  const checks: DocCheck[] = [];
  let ok = true;
  const stats: Record<string, number> = {};

  try {
    const doc = await parseDocument(buffer, metadata);
    stats.paragraphs = doc.paragraphs.length;
    stats.figures = doc.figures.length;
    stats.tables = doc.tables.length;
    stats.references = doc.references.length;

    const ruleResults = validateDocument(doc);
    const { correctedBuffer, changes } = await applyAutoFixes(buffer, doc, ruleResults);
    const finalResults = buildValidationResults('test-session', metadata, ruleResults, changes);

    stats.totalRules = finalResults.summary.total;
    stats.passed = finalResults.summary.passed;
    stats.failed = finalResults.summary.failed;
    stats.warned = finalResults.summary.warned;
    stats.autoFixed = finalResults.summary.autoFixed;
    stats.skipped = finalResults.summary.skipped;
    stats.changes = changes.length;
    stats.correctedBytes = correctedBuffer.length;

    checks.push(await checkCorrectedZip(buffer, correctedBuffer));
    checks.push(checkChangeRuleIds(changes));
    checks.push(checkNoBrokenAutoFixes(finalResults.rules));
    checks.push(checkMarginAttribution(finalResults.rules, changes));
    checks.push(checkSummaryConsistency(finalResults));
    checks.push(await checkMarginsActuallyFixed(buffer, correctedBuffer));
    checks.push(await checkRoundTripFixesHold(buffer, correctedBuffer, metadata, finalResults.rules));

    // Idempotence: feeding the corrected output back through the pipeline
    // should produce zero new changes. This is what real users experience
    // when they re-upload an already-corrected file.
    const doc2 = await parseDocument(correctedBuffer, metadata);
    const ruleResults2 = validateDocument(doc2);
    const { changes: changes2 } = await applyAutoFixes(correctedBuffer, doc2, ruleResults2);
    if (changes2.length > 0) {
      const ids = [...new Set(changes2.map(c => c.ruleId))].join(', ');
      checks.push({ name: 'idempotent on second pass', ok: false, detail: `${changes2.length} more change(s) on pass 2: ${ids}` });
    } else {
      checks.push({ name: 'idempotent on second pass', ok: true, detail: 're-running pipeline on corrected output produces 0 changes' });
    }

    // Byte-level fix assertions — one per auto-fixed rule.
    const autoFixedRuleIds = new Set(
      finalResults.rules.filter(r => r.status === 'auto-fixed').map(r => r.ruleId)
    );
    checks.push(...await byteLevelChecks(correctedBuffer, autoFixedRuleIds));
  } catch (err) {
    checks.push({ name: 'pipeline', ok: false, detail: `threw: ${(err as Error).message}` });
  }

  ok = checks.every(c => c.ok);
  return { filename, ok, checks, stats };
}

async function main() {
  console.log('Running regression tests against supplied dissertations...\n');
  let allOk = true;
  for (const filename of FIXTURES) {
    const fullPath = path.join(REPO_ROOT, filename);
    if (!fs.existsSync(fullPath)) {
      console.log(`SKIP: ${filename} (not found)\n`);
      continue;
    }
    const { ok, checks, stats } = await runOne(filename);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${filename}`);
    console.log(`  stats: ${JSON.stringify(stats)}`);
    for (const c of checks) {
      console.log(`    ${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`);
    }
    console.log('');
    if (!ok) allOk = false;
  }
  console.log(allOk ? 'All fixtures passed regression checks.' : 'One or more fixtures FAILED.');
  process.exit(allOk ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(2);
});
