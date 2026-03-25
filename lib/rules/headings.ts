import { FormattingRule, DocumentModel, RuleResult } from '../types';

function makeResult(
  ruleId: string, name: string, severity: FormattingRule['severity'],
  autoFixable: boolean, pass: boolean, message: string,
  details?: string, manualFixInstruction?: string
): RuleResult {
  return {
    ruleId, category: 'text-formatting', name,
    status: pass ? 'pass' : 'fail',
    message, details, autoFixable, severity, manualFixInstruction,
  };
}

const headingRules: FormattingRule[] = [
  {
    id: 'TEXT-001',
    category: 'text-formatting',
    name: 'No Italics in Headings',
    description: 'Headings must not use italic formatting (unless document follows MLA style)',
    severity: 'major',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const headings = doc.paragraphs.filter(p => p.isHeading);
      if (headings.length === 0) {
        return {
          ruleId: 'TEXT-001', category: 'text-formatting', name: 'No Italics in Headings',
          status: 'skipped', message: 'No headings detected', autoFixable: true, severity: 'major',
        };
      }
      const italicHeadings = headings.filter(p => p.italic);
      if (italicHeadings.length === 0) {
        return makeResult('TEXT-001', 'No Italics in Headings', 'major', true, true,
          `All ${headings.length} heading(s) are non-italic`);
      }
      return makeResult('TEXT-001', 'No Italics in Headings', 'major', true, false,
        `${italicHeadings.length} heading(s) use italic formatting`,
        `Headings at levels: ${[...new Set(italicHeadings.map(h => h.headingLevel))].join(', ')}`,
        'Remove italic formatting from all headings. Select each heading and click the Italic button (Ctrl+I) to toggle off. Or: modify the Heading styles to not use italic.'
      );
    },
  },
  {
    id: 'TEXT-002',
    category: 'text-formatting',
    name: 'No Colored Text',
    description: 'All text in the document must be black — no colored text allowed',
    severity: 'critical',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (!doc.styles.hasColoredText) {
        return makeResult('TEXT-002', 'No Colored Text', 'critical', true, true,
          'All text appears to be black');
      }
      const coloredCount = doc.styles.colors.filter(
        c => c && c !== '000000' && c.toLowerCase() !== '000000' && c !== 'auto'
      ).length;
      return makeResult('TEXT-002', 'No Colored Text', 'critical', true, false,
        `Found ${coloredCount} non-black color reference(s) in document text`,
        `Colors found: ${[...new Set(doc.styles.colors.filter(c => c !== '000000' && c !== 'auto'))].slice(0, 5).join(', ')}`,
        'Select all text (Ctrl+A) and set font color to "Automatic" (which renders as black). This will not affect images or figures.'
      );
    },
  },
  {
    id: 'TEXT-003',
    category: 'text-formatting',
    name: 'No Colored Hyperlinks',
    description: 'Hyperlinks must use black text, not the default blue color',
    severity: 'major',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      // Detect blue/hyperlink colors
      const blueColors = doc.styles.colors.filter(c =>
        c && !['000000', 'auto'].includes(c.toLowerCase()) &&
        ['0563c1', '1f77b4', '0070c0', '4472c4', '0000ff', '0000ee'].some(blue =>
          c.toLowerCase() === blue
        )
      );
      if (blueColors.length === 0) {
        return makeResult('TEXT-003', 'No Colored Hyperlinks', 'major', true, true,
          'No blue/colored hyperlinks detected');
      }
      return makeResult('TEXT-003', 'No Colored Hyperlinks', 'major', true, false,
        'Hyperlinks with non-black coloring detected',
        undefined,
        'Modify the "Hyperlink" character style: Home → Styles → right-click "Hyperlink" → Modify → set color to Black. Or select hyperlink text and set font color to black.'
      );
    },
  },
];

export default headingRules;
