import { FormattingRule, DocumentModel, RuleResult } from '../types';

function makeResult(
  ruleId: string, name: string, severity: FormattingRule['severity'],
  autoFixable: boolean, pass: boolean, message: string,
  details?: string, manualFixInstruction?: string
): RuleResult {
  return {
    ruleId, category: 'figures-tables', name,
    status: pass ? 'pass' : 'fail',
    message, details, autoFixable, severity, manualFixInstruction,
  };
}

function warn(ruleId: string, name: string, severity: FormattingRule['severity'], message: string, manualFixInstruction?: string): RuleResult {
  return { ruleId, category: 'figures-tables', name, status: 'warning', message, autoFixable: false, severity, manualFixInstruction };
}

const figuresTablesRules: FormattingRule[] = [
  {
    id: 'FIG-001',
    category: 'figures-tables',
    name: 'All Figures Have Captions',
    description: 'Every figure must have a caption',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (doc.figures.length === 0) {
        return { ruleId: 'FIG-001', category: 'figures-tables', name: 'All Figures Have Captions', status: 'skipped', message: 'No figures detected in document', autoFixable: false, severity: 'critical' };
      }
      const noCaption = doc.figures.filter(f => !f.hasCaption);
      if (noCaption.length === 0) {
        return makeResult('FIG-001', 'All Figures Have Captions', 'critical', false, true,
          `All ${doc.figures.length} figure(s) have captions`);
      }
      return makeResult('FIG-001', 'All Figures Have Captions', 'critical', false, false,
        `${noCaption.length} of ${doc.figures.length} figure(s) are missing captions`,
        undefined,
        'Add a caption below each figure. Use Insert → Caption and select "Figure" as the label. Caption should appear immediately below the figure.'
      );
    },
  },
  {
    id: 'FIG-002',
    category: 'figures-tables',
    name: 'Figure Captions Below Figure',
    description: 'Figure captions must appear immediately below the figure',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (doc.figures.length === 0) {
        return { ruleId: 'FIG-002', category: 'figures-tables', name: 'Figure Captions Below Figure', status: 'skipped', message: 'No figures detected', autoFixable: false, severity: 'major' };
      }
      const wrongPosition = doc.figures.filter(f => f.hasCaption && f.captionPosition === 'before');
      if (wrongPosition.length === 0) {
        return makeResult('FIG-002', 'Figure Captions Below Figure', 'major', false, true,
          'All figure captions appear below their figures');
      }
      return makeResult('FIG-002', 'Figure Captions Below Figure', 'major', false, false,
        `${wrongPosition.length} figure caption(s) appear above the figure instead of below`,
        undefined,
        'Move figure captions to appear immediately below each figure. Figure captions belong below the image (unlike table captions which go above).'
      );
    },
  },
  {
    id: 'FIG-003',
    category: 'figures-tables',
    name: 'All Tables Have Captions',
    description: 'Every table must have a caption',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (doc.tables.length === 0) {
        return { ruleId: 'FIG-003', category: 'figures-tables', name: 'All Tables Have Captions', status: 'skipped', message: 'No tables detected in document', autoFixable: false, severity: 'critical' };
      }
      const noCaption = doc.tables.filter(t => !t.hasCaption);
      if (noCaption.length === 0) {
        return makeResult('FIG-003', 'All Tables Have Captions', 'critical', false, true,
          `All ${doc.tables.length} table(s) have captions`);
      }
      return makeResult('FIG-003', 'All Tables Have Captions', 'critical', false, false,
        `${noCaption.length} of ${doc.tables.length} table(s) are missing captions`,
        undefined,
        'Add a caption above each table. Use Insert → Caption and select "Table" as the label. Table captions appear above the table (unlike figures).'
      );
    },
  },
  {
    id: 'FIG-004',
    category: 'figures-tables',
    name: 'Table Captions Above Table',
    description: 'Table captions must appear immediately above the table',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (doc.tables.length === 0) {
        return { ruleId: 'FIG-004', category: 'figures-tables', name: 'Table Captions Above Table', status: 'skipped', message: 'No tables detected', autoFixable: false, severity: 'major' };
      }
      const wrongPosition = doc.tables.filter(t => t.hasCaption && t.captionPosition === 'after');
      if (wrongPosition.length === 0) {
        return makeResult('FIG-004', 'Table Captions Above Table', 'major', false, true,
          'All table captions appear above their tables');
      }
      return makeResult('FIG-004', 'Table Captions Above Table', 'major', false, false,
        `${wrongPosition.length} table caption(s) appear below the table instead of above`,
        undefined,
        'Move table captions to appear immediately above each table. Table captions always go above the table.'
      );
    },
  },
  {
    id: 'FIG-005',
    category: 'figures-tables',
    name: 'Consistent Caption Formatting',
    description: 'All captions should use consistent style, font, and size',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const captionParas = doc.paragraphs.filter(p => p.isCaption);
      if (captionParas.length === 0) {
        return { ruleId: 'FIG-005', category: 'figures-tables', name: 'Consistent Caption Formatting', status: 'skipped', message: 'No captions detected', autoFixable: false, severity: 'major' };
      }
      const fontSizes = new Set(captionParas.filter(p => p.fontSize).map(p => p.fontSize));
      const fontFamilies = new Set(captionParas.filter(p => p.fontFamily).map(p => p.fontFamily));
      if (fontSizes.size <= 1 && fontFamilies.size <= 1) {
        return makeResult('FIG-005', 'Consistent Caption Formatting', 'major', false, true,
          'Caption formatting is consistent');
      }
      return makeResult('FIG-005', 'Consistent Caption Formatting', 'major', false, false,
        'Caption formatting is inconsistent',
        `${fontSizes.size} different font sizes, ${fontFamilies.size} different font families`,
        'Ensure all captions use the same font, size, and style. Apply the "Caption" style to all captions via Home → Styles.'
      );
    },
  },
  {
    id: 'FIG-006',
    category: 'figures-tables',
    name: 'Full-Page Items Have Facing Captions',
    description: 'If a figure or table fills an entire page, the caption must appear on the facing page',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(_doc: DocumentModel): RuleResult {
      return warn('FIG-006', 'Full-Page Items Have Facing Captions', 'major',
        'Manually verify: if any figure or table fills a full page, its caption must be on the facing (opposite) page',
        'For landscape or full-page figures/tables, place the caption on the page immediately preceding the figure/table. The caption page should be in portrait orientation.'
      );
    },
  },
  {
    id: 'FIG-007',
    category: 'figures-tables',
    name: 'Multi-Page Tables Repeat Headers',
    description: 'If a table spans multiple pages, the header row must repeat on each page',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const multiPageTables = doc.tables.filter(t => t.isMultiPage);
      if (multiPageTables.length === 0) {
        return { ruleId: 'FIG-007', category: 'figures-tables', name: 'Multi-Page Tables Repeat Headers', status: 'skipped', message: 'No multi-page tables detected', autoFixable: false, severity: 'major' };
      }
      const missingRepeat = multiPageTables.filter(t => !t.hasHeaderRow);
      if (missingRepeat.length === 0) {
        return makeResult('FIG-007', 'Multi-Page Tables Repeat Headers', 'major', false, true,
          'Multi-page tables have repeating header rows');
      }
      return makeResult('FIG-007', 'Multi-Page Tables Repeat Headers', 'major', false, false,
        `${missingRepeat.length} multi-page table(s) may not have repeating headers`,
        undefined,
        'For each multi-page table: select the header row → right-click → Table Properties → Row tab → check "Repeat as header row at the top of each page".'
      );
    },
  },
  {
    id: 'FIG-008',
    category: 'figures-tables',
    name: 'Multi-Page Tables Have Continuation Captions',
    description: 'Tables that span multiple pages should have ", Continued" added to repeated captions',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const multiPageTables = doc.tables.filter(t => t.isMultiPage);
      if (multiPageTables.length === 0) {
        return { ruleId: 'FIG-008', category: 'figures-tables', name: 'Multi-Page Continuation Captions', status: 'skipped', message: 'No multi-page tables detected', autoFixable: false, severity: 'major' };
      }
      return warn('FIG-008', 'Multi-Page Continuation Captions', 'major',
        'Verify multi-page tables have ", Continued" in their repeated captions',
        'For tables that span multiple pages, add ", Continued" to the caption on subsequent pages (e.g., "Table 1. Results, Continued").'
      );
    },
  },
];

export default figuresTablesRules;
