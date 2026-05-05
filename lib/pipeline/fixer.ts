import JSZip from 'jszip';
import { DocumentModel, ChangeRecord, RuleResult } from '../types';
import {
  fixMargins,
  fixFontColors,
  fixFonts,
  fixBodySpacing,
  fixFirstLineIndent,
  fixHeadingItalics,
  fixTitlePageNumbering,
  fixCopyrightPageNumbering,
  fixPreliminaryPageNumbering,
  fixBodyPageNumbering,
  fixFooterPageNumberCentering,
  fixImageAltText,
  fixTableHeaders,
  fixDocumentLanguage,
} from '../docx/writer';

export async function applyAutoFixes(
  docBuffer: Buffer,
  _doc: DocumentModel,
  ruleResults: RuleResult[]
): Promise<{ correctedBuffer: Buffer; changes: ChangeRecord[] }> {
  const allChanges: ChangeRecord[] = [];

  // Load the docx once
  const zip = await JSZip.loadAsync(docBuffer);
  let documentXml = await (zip.file('word/document.xml')?.async('string') || Promise.resolve(''));
  let stylesXml = await (zip.file('word/styles.xml')?.async('string') || Promise.resolve(''));

  // Load all parts that may contain user-authored formatting that
  // FONT-005 (and similar) should reach: headers, footers, footnotes,
  // endnotes, comments. Validator only sees document.xml + styles.xml,
  // but a real submission's "visible content" extends to these parts too.
  const footerFiles: { path: string; xml: string }[] = [];
  const headerFiles: { path: string; xml: string }[] = [];
  const auxFiles: { path: string; xml: string }[] = [];
  const AUX_PATHS = [
    'word/footnotes.xml',
    'word/endnotes.xml',
    'word/comments.xml',
  ];
  for (const [path] of Object.entries(zip.files)) {
    if (/^word\/footer\d+\.xml$/i.test(path)) {
      const content = await (zip.file(path)?.async('string') || Promise.resolve(''));
      if (content) footerFiles.push({ path, xml: content });
    } else if (/^word\/header\d+\.xml$/i.test(path)) {
      const content = await (zip.file(path)?.async('string') || Promise.resolve(''));
      if (content) headerFiles.push({ path, xml: content });
    } else if (AUX_PATHS.includes(path)) {
      const content = await (zip.file(path)?.async('string') || Promise.resolve(''));
      if (content) auxFiles.push({ path, xml: content });
    }
  }

  // Determine which rules need fixing from the already-computed validation results
  const failingRuleIds = new Set(
    ruleResults.filter(r => r.status === 'fail' && r.autoFixable).map(r => r.ruleId)
  );

  // Apply all fixes in one pass on the XML strings
  try {
    // Margin fixes (MARGIN-001 through MARGIN-005)
    const marginRuleIds = ['MARGIN-001', 'MARGIN-002', 'MARGIN-003', 'MARGIN-004', 'MARGIN-005']
      .filter(id => failingRuleIds.has(id));
    if (marginRuleIds.length > 0) {
      const targetMargins = { top: 1440, bottom: 1440, left: 1440, right: 1440, footer: 720 };
      documentXml = fixMargins(documentXml, allChanges, marginRuleIds, targetMargins);
    }

    // Font family fix
    if (failingRuleIds.has('FONT-001')) {
      const result = fixFonts(
        documentXml, stylesXml,
        ['Arial', 'Century Gothic', 'Helvetica', 'Times New Roman'],
        'Times New Roman', allChanges
      );
      documentXml = result.documentXml;
      stylesXml = result.stylesXml;
    }

    // Font color fix (touches documentXml, stylesXml, headers, footers,
    // footnotes, endnotes, comments). Skips <w:rPrChange>/<w:pPrChange>
    // blocks to preserve track-changes historical color records, and
    // strips w:themeColor so the val change isn't masked by theme rendering.
    if (failingRuleIds.has('FONT-005')) {
      const extras = [
        ...headerFiles.map(f => f.xml),
        ...footerFiles.map(f => f.xml),
        ...auxFiles.map(f => f.xml),
      ];
      const out = fixFontColors(documentXml, stylesXml, allChanges, extras);
      documentXml = out.documentXml;
      stylesXml = out.stylesXml;
      let i = 0;
      for (const f of headerFiles) f.xml = out.extraXmls[i++];
      for (const f of footerFiles) f.xml = out.extraXmls[i++];
      for (const f of auxFiles) f.xml = out.extraXmls[i++];
    }

    // Body / abstract spacing fix
    if (failingRuleIds.has('SPACE-001') || failingRuleIds.has('ABSTRACT-004')) {
      const spacingRuleIds = ['SPACE-001', 'ABSTRACT-004'].filter(id => failingRuleIds.has(id));
      documentXml = fixBodySpacing(documentXml, allChanges, spacingRuleIds, {
        includeAbstractStyles: failingRuleIds.has('ABSTRACT-004'),
      });
    }

    // First-line indent fix
    if (failingRuleIds.has('INDENT-001')) {
      documentXml = fixFirstLineIndent(documentXml, allChanges);
    }

    // Heading italics fix
    if (failingRuleIds.has('TEXT-001')) {
      documentXml = fixHeadingItalics(documentXml, allChanges);
    }

    // ── Pagination fixes ──
    if (failingRuleIds.has('PAGE-001')) {
      documentXml = fixTitlePageNumbering(documentXml, allChanges);
    }
    if (failingRuleIds.has('PAGE-002')) {
      documentXml = fixCopyrightPageNumbering(documentXml, allChanges);
    }
    if (failingRuleIds.has('PAGE-003') || failingRuleIds.has('PAGE-004')) {
      documentXml = fixPreliminaryPageNumbering(documentXml, allChanges);
    }
    if (failingRuleIds.has('PAGE-005')) {
      documentXml = fixBodyPageNumbering(documentXml, allChanges);
    }
    if (failingRuleIds.has('PAGE-006')) {
      for (const footer of footerFiles) {
        footer.xml = fixFooterPageNumberCentering(footer.xml, allChanges);
      }
    }

    // ── Accessibility fixes ──
    if (failingRuleIds.has('A11Y-002')) {
      documentXml = fixImageAltText(documentXml, allChanges);
    }
    if (failingRuleIds.has('A11Y-003')) {
      documentXml = fixTableHeaders(documentXml, allChanges);
    }
    if (failingRuleIds.has('A11Y-005')) {
      stylesXml = fixDocumentLanguage(stylesXml, allChanges);
    }
  } catch (error: unknown) {
    console.error('Error applying fixes:', error);
  }

  // Save the modified document once
  zip.file('word/document.xml', documentXml);
  if (stylesXml) {
    zip.file('word/styles.xml', stylesXml);
  }
  // Save modified header, footer, and aux (footnotes/endnotes/comments) files.
  for (const header of headerFiles) zip.file(header.path, header.xml);
  for (const footer of footerFiles) zip.file(footer.path, footer.xml);
  for (const aux of auxFiles) zip.file(aux.path, aux.xml);
  const arrayBuffer = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const correctedBuffer = Buffer.from(arrayBuffer);

  return { correctedBuffer, changes: allChanges };
}
