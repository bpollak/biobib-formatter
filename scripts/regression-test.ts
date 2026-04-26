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
  // If MARGIN-* rules failed in the original but the change log says we fixed them,
  // verify that no <w:pgMar> in the corrected XML has a top/bottom/left/right < 1440.
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
