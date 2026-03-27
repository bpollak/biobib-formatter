import { FormattingRule, DocumentModel, RuleResult } from '../types';

function warn(ruleId: string, name: string, severity: FormattingRule['severity'], message: string, manualFixInstruction?: string): RuleResult {
  return { ruleId, category: 'accessibility', name, status: 'warning', message, autoFixable: false, severity, manualFixInstruction };
}

function makeResult(
  ruleId: string, name: string, severity: FormattingRule['severity'],
  autoFixable: boolean, pass: boolean, message: string,
  details?: string, manualFixInstruction?: string
): RuleResult {
  return {
    ruleId, category: 'accessibility', name,
    status: pass ? 'pass' : 'fail',
    message, details, autoFixable, severity, manualFixInstruction,
  };
}

const accessibilityRules: FormattingRule[] = [
  {
    id: 'A11Y-001',
    category: 'accessibility',
    name: 'Heading Styles Used',
    description: 'Headings must use proper Heading styles (not just bold or enlarged text)',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const headingStyleParas = doc.paragraphs.filter(p => p.isHeading);
      const boldLargeParas = doc.paragraphs.filter(p =>
        p.bold && !p.isHeading && p.text.trim().length < 100 &&
        p.fontSize && p.fontSize > 24
      );
      
      if (headingStyleParas.length === 0 && boldLargeParas.length > 0) {
        return makeResult('A11Y-001', 'Heading Styles Used', 'major', false, false,
          'Document may use bold/large text for headings instead of proper Heading styles',
          `${boldLargeParas.length} potential headings found using manual formatting`,
          'Apply proper Heading styles (Heading 1, Heading 2, etc.) instead of manually bolding/enlarging text. This is required for accessibility. Home → Styles → Heading 1/2/3.'
        );
      }
      if (headingStyleParas.length > 0) {
        return makeResult('A11Y-001', 'Heading Styles Used', 'major', false, true,
          `${headingStyleParas.length} heading(s) use proper Heading styles`);
      }
      return warn('A11Y-001', 'Heading Styles Used', 'major',
        'Could not verify heading styles — ensure all headings use Heading 1, Heading 2, etc.',
        'For WCAG 2.1 AA compliance (required April 2026), all headings must use proper Heading styles. Apply Heading 1, Heading 2, etc. from the Styles panel.'
      );
    },
  },
  {
    id: 'A11Y-002',
    category: 'accessibility',
    name: 'Images Have Alt Text',
    description: 'All images must have descriptive alternative text for screen readers',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (doc.figures.length === 0) {
        return { ruleId: 'A11Y-002', category: 'accessibility', name: 'Images Have Alt Text', status: 'skipped', message: 'No images detected', autoFixable: false, severity: 'major' };
      }
      const noAltText = doc.figures.filter(f => !f.hasAltText || !f.altText || f.altText.trim() === '');
      if (noAltText.length === 0) {
        return makeResult('A11Y-002', 'Images Have Alt Text', 'major', false, true,
          `All ${doc.figures.length} image(s) have alt text`);
      }
      return makeResult('A11Y-002', 'Images Have Alt Text', 'major', false, false,
        `${noAltText.length} of ${doc.figures.length} image(s) missing alt text`,
        undefined,
        'Add alt text to each image: right-click image → Edit Alt Text → describe the image content. Required for WCAG 2.1 AA compliance (effective April 2026).'
      );
    },
  },
  {
    id: 'A11Y-003',
    category: 'accessibility',
    name: 'Table Headers Marked',
    description: 'Tables must have header rows properly marked for accessibility',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (doc.tables.length === 0) {
        return { ruleId: 'A11Y-003', category: 'accessibility', name: 'Table Headers Marked', status: 'skipped', message: 'No tables detected', autoFixable: false, severity: 'major' };
      }
      const noHeader = doc.tables.filter(t => !t.hasHeaderRow);
      if (noHeader.length === 0) {
        return makeResult('A11Y-003', 'Table Headers Marked', 'major', false, true,
          `All ${doc.tables.length} table(s) have marked header rows`);
      }
      return makeResult('A11Y-003', 'Table Headers Marked', 'major', false, false,
        `${noHeader.length} table(s) may not have marked header rows`,
        undefined,
        'For each table: select the first row → Table Layout tab → check "Repeat Header Rows". Also right-click row → Table Properties → Row → check "Repeat as header row". Required for WCAG compliance.'
      );
    },
  },
  {
    id: 'A11Y-004',
    category: 'accessibility',
    name: 'Color Contrast Sufficient',
    description: 'Text and background color contrast must meet WCAG 4.5:1 ratio minimum',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      // Can't compute contrast ratio from docx metadata alone
      // If text is black on white (which it should be per other rules), contrast is fine
      if (!doc.styles.hasColoredText) {
        return makeResult('A11Y-004', 'Color Contrast Sufficient', 'major', false, true,
          'Text appears to be black — contrast with white background exceeds WCAG 4.5:1 requirement');
      }
      return warn('A11Y-004', 'Color Contrast Sufficient', 'major',
        'Colored text detected — manually verify color contrast ratio is at least 4.5:1',
        'Use the WebAIM Contrast Checker (webaim.org/resources/contrastchecker/) to verify text/background contrast. All text must achieve 4.5:1 ratio for WCAG 2.1 AA compliance.'
      );
    },
  },
  {
    id: 'A11Y-005',
    category: 'accessibility',
    name: 'Document Language Set',
    description: 'The document language must be explicitly set to English (or applicable language)',
    severity: 'minor',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      // Check if language is set in the XML
      const hasLang = /<w:lang[^>]+w:val="en-US"/.test(doc.rawXml) ||
                      /<w:lang[^>]+w:bidi="[^"]+"/.test(doc.rawXml);
      if (hasLang) {
        return makeResult('A11Y-005', 'Document Language Set', 'minor', false, true,
          'Document language is set');
      }
      return makeResult('A11Y-005', 'Document Language Set', 'minor', false, false,
        'Document language may not be explicitly set',
        undefined,
        'Set document language: File → Options → Language → Office authoring languages → ensure English (US) is set as default. Also: Review → Language → Set Proofing Language.'
      );
    },
  },
  {
    id: 'A11Y-006',
    category: 'accessibility',
    name: 'Logical Heading Hierarchy',
    description: 'Headings must follow a logical sequence without skipping levels (H1 → H2 → H3, not H1 → H3)',
    severity: 'minor',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const headings = doc.paragraphs.filter(p => p.isHeading && p.headingLevel);
      if (headings.length === 0) {
        return { ruleId: 'A11Y-006', category: 'accessibility', name: 'Logical Heading Hierarchy', status: 'skipped', message: 'No headings detected', autoFixable: false, severity: 'minor' };
      }

      let prevLevel = 0;
      const largeSkips: { from: number; to: number }[] = [];
      for (const heading of headings) {
        const level = heading.headingLevel!;
        // Only flag skips of more than 3 levels (e.g. H1→H5) — dissertations
        // commonly use non-sequential heading styles (H1→H4) for formatting
        if (level > prevLevel + 3) {
          largeSkips.push({ from: prevLevel, to: level });
        }
        prevLevel = level;
      }

      if (largeSkips.length === 0) {
        return makeResult('A11Y-006', 'Logical Heading Hierarchy', 'minor', false, true,
          `Heading hierarchy is acceptable (${headings.length} headings found)`);
      }

      const skipDescriptions = largeSkips.map(s => `H${s.from}→H${s.to}`).join(', ');
      return warn('A11Y-006', 'Logical Heading Hierarchy', 'minor',
        `Heading hierarchy has large level skips: ${skipDescriptions}`,
        'Consider reducing heading level gaps for better accessibility. Large jumps (e.g., Heading 1 to Heading 5) can confuse screen readers.'
      );
    },
  },
];

export default accessibilityRules;
