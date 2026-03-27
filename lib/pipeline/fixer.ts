import JSZip from 'jszip';
import { DocumentModel, ChangeRecord } from '../types';
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
import { allRules } from '../rules';

export async function applyAutoFixes(
  docBuffer: Buffer,
  doc: DocumentModel
): Promise<{ correctedBuffer: Buffer; changes: ChangeRecord[] }> {
  const allChanges: ChangeRecord[] = [];

  // Load the docx once
  const zip = await JSZip.loadAsync(docBuffer);
  let documentXml = await (zip.file('word/document.xml')?.async('string') || Promise.resolve(''));
  let stylesXml = await (zip.file('word/styles.xml')?.async('string') || Promise.resolve(''));

  // Load all footer files
  const footerFiles: { path: string; xml: string }[] = [];
  for (const [path] of Object.entries(zip.files)) {
    if (/^word\/footer\d+\.xml$/i.test(path)) {
      const content = await (zip.file(path)?.async('string') || Promise.resolve(''));
      if (content) footerFiles.push({ path, xml: content });
    }
  }

  // Determine which rules need fixing
  const failingRuleIds = new Set<string>();
  for (const rule of allRules) {
    if (!rule.autoFixable) continue;
    const result = rule.check(doc);
    if (result.status === 'fail') {
      failingRuleIds.add(rule.id);
    }
  }

  // Apply all fixes in one pass on the XML strings
  try {
    // Margin fixes (MARGIN-001 through MARGIN-005)
    if (['MARGIN-001', 'MARGIN-002', 'MARGIN-003', 'MARGIN-004', 'MARGIN-005'].some(id => failingRuleIds.has(id))) {
      const targetMargins = { top: 1440, bottom: 1440, left: 1440, right: 1440, footer: 720 };
      documentXml = fixMargins(documentXml, allChanges, targetMargins);
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

    // Font color fix
    if (failingRuleIds.has('FONT-005')) {
      documentXml = fixFontColors(documentXml, allChanges);
    }

    // Body spacing fix
    if (failingRuleIds.has('SPACE-001') || failingRuleIds.has('ABSTRACT-004')) {
      documentXml = fixBodySpacing(documentXml, allChanges);
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
  } catch (error) {
    console.error('Error applying fixes:', error);
  }

  // Save the modified document once
  zip.file('word/document.xml', documentXml);
  if (stylesXml) {
    zip.file('word/styles.xml', stylesXml);
  }
  // Save modified footer files
  for (const footer of footerFiles) {
    zip.file(footer.path, footer.xml);
  }
  const arrayBuffer = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const correctedBuffer = Buffer.from(arrayBuffer);

  return { correctedBuffer, changes: allChanges };
}
