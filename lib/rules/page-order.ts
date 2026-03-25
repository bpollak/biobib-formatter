import { FormattingRule, DocumentModel, RuleResult } from '../types';

function makeResult(
  ruleId: string, name: string, severity: FormattingRule['severity'],
  autoFixable: boolean, pass: boolean, message: string,
  details?: string, manualFixInstruction?: string
): RuleResult {
  return {
    ruleId, category: 'page-order', name,
    status: pass ? 'pass' : 'fail',
    message, details, autoFixable, severity, manualFixInstruction,
  };
}

function warn(ruleId: string, name: string, severity: FormattingRule['severity'], message: string, manualFixInstruction?: string): RuleResult {
  return { ruleId, category: 'page-order', name, status: 'warning', message, autoFixable: false, severity, manualFixInstruction };
}

const pageOrderRules: FormattingRule[] = [
  {
    id: 'ORDER-001',
    category: 'page-order',
    name: 'Title Page is First',
    description: 'The title page must be the very first page of the document',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const titleSection = doc.sections.find(s => s.type === 'title');
      if (titleSection && titleSection.startParagraphIndex === 0) {
        return makeResult('ORDER-001', 'Title Page is First', 'critical', false, true,
          'Title page detected at document start');
      }
      if (!titleSection) {
        return makeResult('ORDER-001', 'Title Page is First', 'critical', false, false,
          'Title page not detected',
          undefined,
          'The first page must be your title page. Ensure it contains "UNIVERSITY OF CALIFORNIA SAN DIEGO" and all required title page elements.'
        );
      }
      return makeResult('ORDER-001', 'Title Page is First', 'critical', false, false,
        'Title page may not be in the correct position',
        undefined,
        'Move the title page to be the very first page of the document.'
      );
    },
  },
  {
    id: 'ORDER-002',
    category: 'page-order',
    name: 'Blank/Copyright Page Second',
    description: 'Second page must be blank or contain a copyright notice',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const copyrightSection = doc.sections.find(s => s.type === 'copyright');
      if (copyrightSection) {
        return makeResult('ORDER-002', 'Blank/Copyright Page Second', 'critical', false, true,
          'Blank/copyright page detected in correct position');
      }
      return warn('ORDER-002', 'Blank/Copyright Page Second', 'critical',
        'Could not detect blank/copyright page — verify it is the second page',
        'The second page must be blank or contain only a copyright notice (e.g., "Copyright [Year], [Your Name]"). It counts as page ii but has no visible number.'
      );
    },
  },
  {
    id: 'ORDER-003',
    category: 'page-order',
    name: 'Approval Page Third',
    description: 'The Dissertation/Thesis Approval page must be page iii',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const approvalSection = doc.sections.find(s => s.type === 'approval');
      if (approvalSection) {
        return makeResult('ORDER-003', 'Approval Page Third', 'critical', false, true,
          'Approval page detected');
      }
      return makeResult('ORDER-003', 'Approval Page Third', 'critical', false, false,
        'Approval page not detected',
        undefined,
        'The third page must be the Dissertation/Thesis Approval page. It is always page iii and has the committee signatures block. Download the template from GEPA.'
      );
    },
  },
  {
    id: 'ORDER-004',
    category: 'page-order',
    name: 'Optional Prelim Pages Correctly Placed',
    description: 'Dedication, epigraph, preface (if present) must appear after the approval page and before the TOC',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      return warn('ORDER-004', 'Optional Prelim Pages Correctly Placed', 'major',
        'Manually verify optional preliminary pages (dedication, epigraph, preface) are in the correct position',
        'Optional pages (Dedication, Epigraph, Preface) must appear after the Approval page and before the Table of Contents.'
      );
    },
  },
  {
    id: 'ORDER-005',
    category: 'page-order',
    name: 'Table of Contents Present',
    description: 'A Table of Contents is required',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const tocSection = doc.sections.find(s => s.type === 'toc');
      // Also check paragraphs for TOC text
      const tocPara = doc.paragraphs.find(p =>
        /table\s+of\s+contents/i.test(p.text)
      );
      if (tocSection || tocPara) {
        return makeResult('ORDER-005', 'Table of Contents Present', 'critical', false, true,
          'Table of Contents detected');
      }
      return makeResult('ORDER-005', 'Table of Contents Present', 'critical', false, false,
        'Table of Contents not detected',
        undefined,
        'Add a Table of Contents after the Approval page (and any optional preliminary pages). In Word: References → Table of Contents → Automatic Table 1.'
      );
    },
  },
  {
    id: 'ORDER-006',
    category: 'page-order',
    name: 'Acknowledgements Present',
    description: 'An Acknowledgements section is required',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const ackPara = doc.paragraphs.find(p =>
        /^acknowledg(e?ment|e?ments)$/i.test(p.text.trim())
      );
      if (ackPara) {
        return makeResult('ORDER-006', 'Acknowledgements Present', 'critical', false, true,
          'Acknowledgements section detected');
      }
      return makeResult('ORDER-006', 'Acknowledgements Present', 'critical', false, false,
        'Acknowledgements section not detected',
        undefined,
        'Add an Acknowledgements section in the preliminary pages (after Table of Contents, before Vita and Abstract). This is a required section.'
      );
    },
  },
  {
    id: 'ORDER-007',
    category: 'page-order',
    name: 'Vita Present (Doctoral)',
    description: 'A Vita section is required for doctoral dissertations',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'dissertation',
    check(doc: DocumentModel): RuleResult {
      if (doc.metadata.degreeType !== 'doctoral') {
        return { ruleId: 'ORDER-007', category: 'page-order', name: 'Vita Present (Doctoral)', status: 'skipped', message: 'Not applicable for master\'s theses', autoFixable: false, severity: 'critical' };
      }
      const vitaPara = doc.paragraphs.find(p =>
        /^vita$/i.test(p.text.trim())
      );
      if (vitaPara) {
        return makeResult('ORDER-007', 'Vita Present (Doctoral)', 'critical', false, true,
          'Vita section detected');
      }
      return makeResult('ORDER-007', 'Vita Present (Doctoral)', 'critical', false, false,
        'Vita section not detected (required for doctoral dissertations)',
        undefined,
        'Add a Vita section before the Abstract. The Vita is a brief biographical statement required for all doctoral dissertations.'
      );
    },
  },
  {
    id: 'ORDER-008',
    category: 'page-order',
    name: 'Abstract Present and Correctly Placed',
    description: 'An Abstract section is required and must be in the correct location',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (doc.abstract.detected) {
        return makeResult('ORDER-008', 'Abstract Present and Correctly Placed', 'critical', false, true,
          'Abstract section detected');
      }
      return makeResult('ORDER-008', 'Abstract Present and Correctly Placed', 'critical', false, false,
        'Abstract section not detected',
        undefined,
        'Add an Abstract section as the last preliminary page (after Vita for doctoral, after Acknowledgements for master\'s). Word limit: 350 words (doctoral) or 250 words (master\'s).'
      );
    },
  },
  {
    id: 'ORDER-009',
    category: 'page-order',
    name: 'Body Follows Abstract',
    description: 'Main body chapters must immediately follow the abstract',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const bodySection = doc.sections.find(s => s.type === 'body');
      if (bodySection) {
        return makeResult('ORDER-009', 'Body Follows Abstract', 'critical', false, true,
          'Main body section detected after preliminary pages');
      }
      return warn('ORDER-009', 'Body Follows Abstract', 'critical',
        'Could not detect the main body — ensure chapters follow the abstract',
        'Main body chapters must start immediately after the Abstract. Each chapter should begin on a new page.'
      );
    },
  },
  {
    id: 'ORDER-010',
    category: 'page-order',
    name: 'References at End',
    description: 'References/Bibliography must be the last section of the document',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const refSection = doc.sections.find(s => s.type === 'references');
      const refPara = doc.paragraphs.find(p =>
        /^(references|bibliography|works\s+cited)$/i.test(p.text.trim())
      );
      if (refSection || refPara) {
        return makeResult('ORDER-010', 'References at End', 'critical', false, true,
          'References/Bibliography section detected');
      }
      return makeResult('ORDER-010', 'References at End', 'critical', false, false,
        'References/Bibliography section not detected',
        undefined,
        'Add a References or Bibliography section at the end of the document (after appendices, if any).'
      );
    },
  },
  {
    id: 'ORDER-011',
    category: 'page-order',
    name: 'Appendices Before References',
    description: 'If appendices exist, they must precede the References section',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const appendixSection = doc.sections.find(s => s.type === 'appendix');
      const refSection = doc.sections.find(s => s.type === 'references');
      
      if (!appendixSection) {
        return { ruleId: 'ORDER-011', category: 'page-order', name: 'Appendices Before References', status: 'skipped', message: 'No appendices detected', autoFixable: false, severity: 'major' };
      }

      if (appendixSection && refSection && appendixSection.startParagraphIndex < refSection.startParagraphIndex) {
        return makeResult('ORDER-011', 'Appendices Before References', 'major', false, true,
          'Appendices appear before References');
      }

      return warn('ORDER-011', 'Appendices Before References', 'major',
        'Verify appendices appear before the References section',
        'All appendices must appear before the References/Bibliography section at the end of the document.'
      );
    },
  },
  {
    id: 'ORDER-012',
    category: 'page-order',
    name: 'List of Figures/Tables Present if Applicable',
    description: 'If the document contains figures or tables, a List of Figures/Tables must be in the preliminary pages',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const hasFigures = doc.figures.length > 0;
      const hasTables = doc.tables.length > 0;
      
      if (!hasFigures && !hasTables) {
        return { ruleId: 'ORDER-012', category: 'page-order', name: 'List of Figures/Tables Present', status: 'skipped', message: 'No figures or tables detected', autoFixable: false, severity: 'major' };
      }

      const hasListOfFigs = doc.paragraphs.some(p =>
        /list\s+of\s+(figures|tables|illustrations)/i.test(p.text)
      );

      if (hasListOfFigs) {
        return makeResult('ORDER-012', 'List of Figures/Tables Present', 'major', false, true,
          'List of Figures/Tables detected in preliminary pages');
      }

      return makeResult('ORDER-012', 'List of Figures/Tables Present', 'major', false, false,
        `Document has ${doc.figures.length} figure(s) and ${doc.tables.length} table(s) but no List of Figures/Tables`,
        undefined,
        'Add a "List of Figures" and/or "List of Tables" in the preliminary pages after the Table of Contents. In Word: References → Insert Table of Figures.'
      );
    },
  },
];

export default pageOrderRules;
