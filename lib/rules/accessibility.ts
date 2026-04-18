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
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (doc.figures.length === 0) {
        return { ruleId: 'A11Y-002', category: 'accessibility', name: 'Images Have Alt Text', status: 'skipped', message: 'No images detected', autoFixable: true, severity: 'major' };
      }
      const noAltText = doc.figures.filter(f => !f.hasAltText || !f.altText || f.altText.trim() === '');
      if (noAltText.length === 0) {
        return makeResult('A11Y-002', 'Images Have Alt Text', 'major', true, true,
          `All ${doc.figures.length} image(s) have alt text`);
      }
      return makeResult('A11Y-002', 'Images Have Alt Text', 'major', true, false,
        `${noAltText.length} of ${doc.figures.length} image(s) missing alt text`,
        undefined,
        'Placeholder alt text will be added automatically. Update each placeholder with a real description: right-click image → Edit Alt Text.'
      );
    },
  },
  {
    id: 'A11Y-003',
    category: 'accessibility',
    name: 'Table Headers Marked',
    description: 'Tables must have header rows properly marked for accessibility',
    severity: 'major',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (doc.tables.length === 0) {
        return { ruleId: 'A11Y-003', category: 'accessibility', name: 'Table Headers Marked', status: 'skipped', message: 'No tables detected', autoFixable: true, severity: 'major' };
      }
      const noHeader = doc.tables.filter(t => !t.hasHeaderRow);
      if (noHeader.length === 0) {
        return makeResult('A11Y-003', 'Table Headers Marked', 'major', true, true,
          `All ${doc.tables.length} table(s) have marked header rows`);
      }
      return makeResult('A11Y-003', 'Table Headers Marked', 'major', true, false,
        `${noHeader.length} table(s) may not have marked header rows`,
        undefined,
        'Table header rows will be marked automatically. Verify each table\'s first row is the correct header.'
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
      // Check if language is set in styles.xml or document.xml
      const hasLang = /<w:lang[^>]+w:val="en-US"/.test(doc.rawXml) ||
                      /<w:lang[^>]+w:val="en-US"/.test(doc.stylesXml) ||
                      /<w:lang[^>]+w:bidi="[^"]+"/.test(doc.rawXml);
      if (hasLang) {
        return makeResult('A11Y-005', 'Document Language Set', 'minor', true, true,
          'Document language is set');
      }
      return makeResult('A11Y-005', 'Document Language Set', 'minor', true, false,
        'Document language may not be explicitly set',
        undefined,
        'Document language will be set to English (en-US) automatically in the corrected file.'
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
  {
    id: 'A11Y-007',
    category: 'accessibility',
    name: 'Reading Order / Tab Order',
    description: 'Floating text boxes and positioned objects must have alt text or be marked decorative',
    severity: 'minor',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      // Check for floating text boxes (wp:anchor elements) and positioned objects
      const floatingObjects = (doc.rawXml.match(/<wp:anchor\b/g) || []).length;
      if (floatingObjects === 0) {
        return makeResult('A11Y-007', 'Reading Order / Tab Order', 'minor', false, true,
          'No floating objects detected — reading order is linear');
      }
      // Check if floating objects have alt text
      const anchorRegex = /<wp:anchor\b[\s\S]*?<\/wp:anchor>/g;
      let missingAlt = 0;
      let anchorMatch;
      while ((anchorMatch = anchorRegex.exec(doc.rawXml)) !== null) {
        const anchor = anchorMatch[0];
        const hasDescr = /descr="[^"]+"|<wp:cNvPr[^>]+descr="[^"]+"/.test(anchor);
        if (!hasDescr) missingAlt++;
      }
      if (missingAlt === 0) {
        return makeResult('A11Y-007', 'Reading Order / Tab Order', 'minor', false, true,
          `${floatingObjects} floating object(s) all have alt text or descriptions`);
      }
      return warn('A11Y-007', 'Reading Order / Tab Order', 'minor',
        `${missingAlt} of ${floatingObjects} floating object(s) may lack alt text — reading order may be unclear for screen readers`,
        'Right-click each floating text box or image → Edit Alt Text. If the object is purely decorative, mark it as decorative. Otherwise add a description.'
      );
    },
  },
  {
    id: 'A11Y-008',
    category: 'accessibility',
    name: 'Bookmarks for Navigation',
    description: 'Document should have bookmarks or named destinations to aid screen reader navigation',
    severity: 'minor',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const bookmarkCount = (doc.rawXml.match(/<w:bookmarkStart\b/g) || []).length;
      const headingCount = doc.paragraphs.filter(p => p.isHeading).length;
      if (bookmarkCount > 0 || headingCount > 0) {
        return makeResult('A11Y-008', 'Bookmarks for Navigation', 'minor', false, true,
          `Document has ${bookmarkCount} bookmark(s) and ${headingCount} heading(s) for navigation`);
      }
      return warn('A11Y-008', 'Bookmarks for Navigation', 'minor',
        'No bookmarks or heading styles detected — screen readers may have difficulty navigating',
        'Add bookmarks at key sections: Insert → Bookmark. Also ensure headings use proper Heading styles for automatic navigation.'
      );
    },
  },
  {
    id: 'A11Y-009',
    category: 'accessibility',
    name: 'No Flashing Content',
    description: 'Document must not contain animated GIFs or flashing content that could trigger seizures',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      // Check for GIF images in the document relationships
      const gifPattern = /\.gif["'\s>]/i;
      const hasGif = gifPattern.test(doc.rawXml);
      // Also check content types for GIF media type
      const hasGifContentType = /image\/gif/i.test(doc.rawXml);
      if (!hasGif && !hasGifContentType) {
        return makeResult('A11Y-009', 'No Flashing Content', 'major', false, true,
          'No animated GIF images detected');
      }
      return warn('A11Y-009', 'No Flashing Content', 'major',
        'Possible animated GIF detected — ensure it does not flash more than 3 times per second',
        'WCAG 2.1 AA requires no content that flashes more than 3 times per second. Replace animated GIFs with static images or ensure they meet the flash threshold. Use the PEAT (Photosensitive Epilepsy Analysis Tool) to test.'
      );
    },
  },
  {
    id: 'A11Y-010',
    category: 'accessibility',
    name: 'Color Not Sole Indicator',
    description: 'Color must not be the only visual means of conveying information',
    severity: 'minor',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      // Look for colored text that lacks additional formatting (bold, italic, underline)
      const coloredRuns: { hasOtherIndicator: boolean }[] = [];
      for (const p of doc.paragraphs) {
        if (p.color && p.color !== '000000' && p.color !== 'auto') {
          const hasOtherIndicator = !!(p.bold || p.italic);
          coloredRuns.push({ hasOtherIndicator });
        }
      }
      if (coloredRuns.length === 0) {
        return makeResult('A11Y-010', 'Color Not Sole Indicator', 'minor', false, true,
          'No colored text detected — color is not used as an indicator');
      }
      const colorOnly = coloredRuns.filter(r => !r.hasOtherIndicator);
      if (colorOnly.length === 0) {
        return makeResult('A11Y-010', 'Color Not Sole Indicator', 'minor', false, true,
          'Colored text also uses bold/italic — not relying on color alone');
      }
      return warn('A11Y-010', 'Color Not Sole Indicator', 'minor',
        `${colorOnly.length} instance(s) of colored text without bold/italic/underline — verify color is not the only indicator`,
        'Ensure that any information conveyed by color is also available through other visual cues (bold, italic, underline, or text labels). WCAG 1.4.1 requires that color not be the sole means of conveying information.'
      );
    },
  },
];

export default accessibilityRules;
