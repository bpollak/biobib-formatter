import { FormattingRule, DocumentModel, RuleResult } from '../types';

function makeResult(
  ruleId: string, name: string, severity: FormattingRule['severity'],
  autoFixable: boolean, pass: boolean, message: string,
  details?: string, manualFixInstruction?: string
): RuleResult {
  return {
    ruleId, category: 'title-page', name,
    status: pass ? 'pass' : 'fail',
    message, details, autoFixable, severity, manualFixInstruction,
  };
}

function warn(ruleId: string, name: string, severity: FormattingRule['severity'], message: string, manualFixInstruction?: string): RuleResult {
  return { ruleId, category: 'title-page', name, status: 'warning', message, autoFixable: false, severity, manualFixInstruction };
}

const titlePageRules: FormattingRule[] = [
  {
    id: 'TITLE-001',
    category: 'title-page',
    name: 'University Name in All Caps',
    description: '"UNIVERSITY OF CALIFORNIA SAN DIEGO" must appear in all capital letters',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (!doc.titlePage.detected) {
        return makeResult('TITLE-001', 'University Name in All Caps', 'critical', false, false,
          'Title page not detected',
          undefined,
          'Ensure the title page is the first page and contains "UNIVERSITY OF CALIFORNIA SAN DIEGO" in all capital letters at the top.'
        );
      }
      if (doc.titlePage.universityNameCorrect) {
        return makeResult('TITLE-001', 'University Name in All Caps', 'critical', false, true,
          '"UNIVERSITY OF CALIFORNIA SAN DIEGO" found in all caps');
      }
      if (doc.titlePage.hasUniversityName) {
        return makeResult('TITLE-001', 'University Name in All Caps', 'critical', false, false,
          'University name found but not in all caps',
          undefined,
          'Change "University of California San Diego" to "UNIVERSITY OF CALIFORNIA SAN DIEGO" (all capitals) at the top of the title page.'
        );
      }
      return makeResult('TITLE-001', 'University Name in All Caps', 'critical', false, false,
        '"UNIVERSITY OF CALIFORNIA SAN DIEGO" not found on title page',
        undefined,
        'Add "UNIVERSITY OF CALIFORNIA SAN DIEGO" in all capital letters at the top of the title page.'
      );
    },
  },
  {
    id: 'TITLE-002',
    category: 'title-page',
    name: 'Title Uses Words, Not Symbols',
    description: 'The dissertation title should use words rather than symbols, formulas, or Greek letters',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (!doc.titlePage.detected) {
        return warn('TITLE-002', 'Title Uses Words, Not Symbols', 'major',
          'Title page not detected — cannot check title content');
      }
      // Look for Greek letters or special math symbols
      const titleParas = doc.paragraphs.slice(
        doc.titlePage.paragraphIndices[0] || 0,
        (doc.titlePage.paragraphIndices[0] || 0) + 10
      );
      const hasSymbols = titleParas.some(p =>
        /[αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ]/.test(p.text) ||
        /[∫∑∏∂∇∞√∝∈∉∋∩∪⊂⊃⊆⊇≠≤≥≈∼∝]/.test(p.text)
      );
      if (hasSymbols) {
        return makeResult('TITLE-002', 'Title Uses Words, Not Symbols', 'major', false, false,
          'Title may contain Greek letters or mathematical symbols',
          undefined,
          'GEPA recommends spelling out Greek letters and formulas in plain text in the title (e.g., "alpha" instead of "α"). Contact GEPA if your title requires special characters.'
        );
      }
      return makeResult('TITLE-002', 'Title Uses Words, Not Symbols', 'major', false, true,
        'No problematic symbols detected in title');
    },
  },
  {
    id: 'TITLE-003',
    category: 'title-page',
    name: '"in" Lowercase on Own Line',
    description: 'The word "in" should appear lowercase on its own line between the degree text and degree name',
    severity: 'minor',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (doc.titlePage.hasInLine) {
        return makeResult('TITLE-003', '"in" Lowercase on Own Line', 'minor', false, true,
          '"in" appears on its own line');
      }
      return warn('TITLE-003', '"in" Lowercase on Own Line', 'minor',
        'Could not verify "in" appears on its own line',
        'On the title page, "in" should appear lowercase on its own line between "A dissertation/thesis submitted in partial satisfaction of the requirements for the degree of" text block and the degree name.'
      );
    },
  },
  {
    id: 'TITLE-004',
    category: 'title-page',
    name: '"by" Lowercase on Own Line',
    description: 'The word "by" should appear lowercase on its own line before the author name',
    severity: 'minor',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (doc.titlePage.hasbyLine) {
        return makeResult('TITLE-004', '"by" Lowercase on Own Line', 'minor', false, true,
          '"by" appears on its own line');
      }
      return warn('TITLE-004', '"by" Lowercase on Own Line', 'minor',
        'Could not verify "by" appears on its own line',
        'On the title page, "by" should appear lowercase on its own dedicated line, immediately before the student\'s name.'
      );
    },
  },
  {
    id: 'TITLE-005',
    category: 'title-page',
    name: 'Committee Chair Listed First',
    description: 'The committee chair must be listed first with the title "Professor" or "Chair" designation',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (!doc.titlePage.committeeDetected) {
        return warn('TITLE-005', 'Committee Chair Listed First', 'major',
          'Committee section not detected on title page',
          'The title page must include a "Committee in Charge" section. The first member listed must be the committee chair.'
        );
      }
      if (doc.titlePage.committeeChairFirst) {
        return makeResult('TITLE-005', 'Committee Chair Listed First', 'major', false, true,
          'Committee chair appears first');
      }
      return makeResult('TITLE-005', 'Committee Chair Listed First', 'major', false, false,
        'Committee chair may not be listed first',
        undefined,
        'Reorder the "Committee in Charge" section so the chair is listed first (with "Professor" designation), followed by other members in alphabetical order.'
      );
    },
  },
  {
    id: 'TITLE-006',
    category: 'title-page',
    name: 'Committee Members Alphabetized',
    description: 'Committee members (after the chair) must be listed alphabetically by last name',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (!doc.titlePage.committeeDetected) {
        return warn('TITLE-006', 'Committee Members Alphabetized', 'major',
          'Committee section not detected — cannot verify alphabetical order');
      }
      if (doc.titlePage.committeeMembersAlphabetized !== false) {
        return makeResult('TITLE-006', 'Committee Members Alphabetized', 'major', false, true,
          'Committee members appear to be in alphabetical order (after chair)');
      }
      return makeResult('TITLE-006', 'Committee Members Alphabetized', 'major', false, false,
        'Committee members may not be alphabetized',
        undefined,
        'After the chair, list all other committee members alphabetically by last name.'
      );
    },
  },
  {
    id: 'TITLE-007',
    category: 'title-page',
    name: 'Committee List Indented 0.5"',
    description: 'The committee member names must be indented 0.5" from the "Committee in Charge" label',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (!doc.titlePage.committeeDetected) {
        return warn('TITLE-007', 'Committee List Indented 0.5"', 'major',
          'Committee section not detected — cannot verify indentation');
      }
      if (doc.titlePage.committeeIndented) {
        return makeResult('TITLE-007', 'Committee List Indented 0.5"', 'major', false, true,
          'Committee members are indented 0.5"');
      }
      return makeResult('TITLE-007', 'Committee List Indented 0.5"', 'major', false, false,
        'Committee member names may not be indented',
        undefined,
        'Select all committee member names under "Committee in Charge" and set left indentation to 0.5" via Home → Paragraph → Indentation.'
      );
    },
  },
  {
    id: 'TITLE-008',
    category: 'title-page',
    name: 'Committee List Single-Spaced',
    description: 'Committee member names must be single-spaced',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (!doc.titlePage.committeeDetected) {
        return warn('TITLE-008', 'Committee List Single-Spaced', 'major',
          'Committee section not detected — cannot verify spacing');
      }
      if (doc.titlePage.committeeSingleSpaced) {
        return makeResult('TITLE-008', 'Committee List Single-Spaced', 'major', false, true,
          'Committee members are single-spaced');
      }
      return makeResult('TITLE-008', 'Committee List Single-Spaced', 'major', false, false,
        'Committee member names may not be single-spaced',
        undefined,
        'Select committee member names and set line spacing to Single via Home → Paragraph → Line Spacing.'
      );
    },
  },
  {
    id: 'TITLE-009',
    category: 'title-page',
    name: 'Degree Year Matches Conferral Year',
    description: 'The year on the title page should match the expected graduation conferral year',
    severity: 'minor',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      return warn('TITLE-009', 'Degree Year Matches Conferral Year', 'minor',
        'Manually verify the year on your title page matches your graduation quarter\'s conferral year',
        'The year at the bottom of the title page must be the year in which your degree will be conferred. Verify this with GEPA if uncertain.'
      );
    },
  },
];

export default titlePageRules;
