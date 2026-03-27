import { FormattingRule, DocumentModel, RuleResult } from '../types';
import { APPROVED_FONTS, MIN_FONT_SIZE_HP, MAX_FONT_SIZE_HP } from '../constants';

function pass(ruleId: string, category: FormattingRule['category'], name: string, severity: FormattingRule['severity'], autoFixable: boolean, message: string): RuleResult {
  return { ruleId, category, name, status: 'pass', message, autoFixable, severity };
}

function fail(ruleId: string, category: FormattingRule['category'], name: string, severity: FormattingRule['severity'], autoFixable: boolean, message: string, details?: string, manualFixInstruction?: string): RuleResult {
  return { ruleId, category, name, status: 'fail', message, details, autoFixable, severity, manualFixInstruction };
}

const fontRules: FormattingRule[] = [
  {
    id: 'FONT-001',
    category: 'fonts',
    name: 'Approved Font Family',
    description: 'All text must use an approved font: Arial, Century Gothic, Helvetica, or Times New Roman',
    severity: 'critical',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const unapproved = doc.styles.fonts.filter(
        f => f && !APPROVED_FONTS.some(af => f.toLowerCase().includes(af.toLowerCase()))
      );
      if (unapproved.length === 0) {
        return pass('FONT-001', 'fonts', 'Approved Font Family', 'critical', true,
          'All fonts are from the approved list');
      }
      return fail('FONT-001', 'fonts', 'Approved Font Family', 'critical', true,
        `Found ${unapproved.length} unapproved font(s)`,
        `Unapproved: ${[...new Set(unapproved)].slice(0, 3).join(', ')}`,
        `Replace all text with an approved font: Arial, Century Gothic, Helvetica, or Times New Roman. Use Edit → Find & Replace → Font to identify and replace.`
      );
    },
  },
  {
    id: 'FONT-002',
    category: 'fonts',
    name: 'Font Size 10–12pt',
    description: 'Body text must be between 10pt and 12pt',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const outOfRange = doc.styles.sizes.filter(
        s => s < MIN_FONT_SIZE_HP || s > MAX_FONT_SIZE_HP
      );
      if (outOfRange.length === 0) {
        return pass('FONT-002', 'fonts', 'Font Size 10–12pt', 'critical', false,
          'All font sizes are within the 10–12pt range');
      }
      const tooSmall = outOfRange.filter(s => s < MIN_FONT_SIZE_HP);
      const tooBig = outOfRange.filter(s => s > MAX_FONT_SIZE_HP);
      const details: string[] = [];
      if (tooSmall.length > 0) details.push(`Too small: ${[...new Set(tooSmall)].map(s => `${s/2}pt`).join(', ')}`);
      if (tooBig.length > 0) details.push(`Too large: ${[...new Set(tooBig)].map(s => `${s/2}pt`).join(', ')}`);
      return fail('FONT-002', 'fonts', 'Font Size 10–12pt', 'critical', false,
        `Found font sizes outside the 10–12pt range`,
        details.join('; '),
        'Select all body text (Ctrl+A), then set font size to 12pt. Note: footnotes and captions may have smaller sizes — these are acceptable.'
      );
    },
  },
  {
    id: 'FONT-003',
    category: 'fonts',
    name: 'Consistent Font Throughout',
    description: 'Body text should use a single consistent font family',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const uniqueFonts = [...new Set(doc.styles.fonts.filter(Boolean))];
      if (uniqueFonts.length <= 2) { // Allow some variation (e.g., normal + monospace for code)
        return pass('FONT-003', 'fonts', 'Consistent Font Throughout', 'major', false,
          `Font is consistent: ${uniqueFonts.join(', ')}`);
      }
      return fail('FONT-003', 'fonts', 'Consistent Font Throughout', 'major', false,
        `Multiple font families detected (${uniqueFonts.length})`,
        `Fonts found: ${uniqueFonts.slice(0, 5).join(', ')}`,
        'Ensure the entire document uses one consistent font family. Select all (Ctrl+A), then apply your chosen approved font.'
      );
    },
  },
  {
    id: 'FONT-004',
    category: 'fonts',
    name: 'Consistent Font Size',
    description: 'Body text should use a single consistent font size',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      // Filter to only approved sizes
      const validSizes = doc.styles.sizes.filter(s => s >= MIN_FONT_SIZE_HP && s <= MAX_FONT_SIZE_HP);
      const uniqueSizes = [...new Set(validSizes)];
      if (uniqueSizes.length <= 1) {
        return pass('FONT-004', 'fonts', 'Consistent Font Size', 'major', false,
          `Font size is consistent: ${uniqueSizes.map(s => `${s/2}pt`).join(', ')}`);
      }
      return fail('FONT-004', 'fonts', 'Consistent Font Size', 'major', false,
        `Multiple font sizes detected in body text`,
        `Sizes found: ${uniqueSizes.map(s => `${s/2}pt`).join(', ')}`,
        'Use a single consistent font size (10, 11, or 12pt) for all body text throughout the document.'
      );
    },
  },
  {
    id: 'FONT-005',
    category: 'fonts',
    name: 'All Text Black',
    description: 'All text must be black — no colored text allowed',
    severity: 'critical',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (!doc.styles.hasColoredText) {
        return pass('FONT-005', 'fonts', 'All Text Black', 'critical', true,
          'All text is black');
      }
      const coloredCount = doc.styles.colors.filter(
        c => c && c !== '000000' && c.toLowerCase() !== '000000' && c !== 'auto'
      ).length;
      return fail('FONT-005', 'fonts', 'All Text Black', 'critical', true,
        `Found ${coloredCount} non-black color references`,
        `Colors: ${[...new Set(doc.styles.colors.filter(c => c !== '000000' && c !== 'auto'))].slice(0, 5).join(', ')}`,
        'Select all text (Ctrl+A), then set font color to Automatic (black). Also check hyperlinks via the Styles panel.'
      );
    },
  },
  {
    id: 'FONT-006',
    category: 'fonts',
    name: 'No Colored Hyperlinks',
    description: 'Hyperlinks must not use colored text — should be black like body text',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      // Check for hyperlink style colors in styles
      // This is a heuristic - look for blue-colored text which is often hyperlinks
      const blueColors = doc.styles.colors.filter(c =>
        c && ['0563C1', '1F77B4', '0070C0', '4472C4', 'auto'].some(blue =>
          c.toLowerCase() === blue.toLowerCase()
        )
      );
      if (blueColors.length === 0) {
        return pass('FONT-006', 'fonts', 'No Colored Hyperlinks', 'major', false,
          'No colored hyperlinks detected');
      }
      return fail('FONT-006', 'fonts', 'No Colored Hyperlinks', 'major', false,
        'Hyperlinks may have colored formatting',
        undefined,
        'Right-click any hyperlink → Edit Hyperlink, or use Home → Styles → modify "Hyperlink" style to use black, no underline color.'
      );
    },
  },
];

export default fontRules;
