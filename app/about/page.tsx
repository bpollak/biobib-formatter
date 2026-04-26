'use client';

import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const FAQ_ITEMS = [
  {
    q: 'What file formats are accepted?',
    a: 'Only .docx files (Microsoft Word) up to 50MB. LaTeX and PDF support is planned for a future release.',
  },
  {
    q: 'Will this change my content?',
    a: 'No. The tool only checks and corrects formatting (margins, fonts, spacing, indentation). Your text, figures, tables, and references are never modified.',
  },
  {
    q: 'What does "auto-fixed" mean?',
    a: 'Some rules can be corrected automatically — for example, incorrect margins, wrong font, missing indentation, or double-spacing. When a rule is auto-fixed, the corrected .docx file you download will have the fix applied. Rules marked with a ✦ wrench icon are auto-fixable.',
  },
  {
    q: 'Can this replace the GEPA formatting review?',
    a: 'Not yet. This is a pre-check tool to help you catch and fix issues before your official GEPA submission. Final review is still done by GEPA advisors.',
  },
  {
    q: 'Is my document stored securely?',
    a: 'Documents are securely uploaded to temporary cloud storage for processing. The original file is deleted immediately after processing, and the corrected file is provided through a time-limited secure download during your current browser session. Nothing is permanently stored on our servers.',
  },
  {
    q: 'What about accessibility (WCAG 2.1)?',
    a: 'Basic accessibility checks are included: alt text on images, table header markup, heading hierarchy, document language, and color contrast. Full WCAG 2.1 Level AA validation is planned for a future release.',
  },
  {
    q: 'What if the tool flags something incorrectly?',
    a: 'Some rules (especially pagination, committee detection, and optional sections) require manual verification and are marked as warnings rather than failures. Always cross-reference with the official GEPA Preparation and Submission Manual.',
  },
];

type Rule = {
  id: string;
  name: string;
  description: string;
  autoFixable: boolean;
  severity: 'critical' | 'major' | 'minor';
};

type Category = {
  name: string;
  intro: string;
  rules: Rule[];
};

const CATEGORIES: Category[] = [
  {
    name: 'Margins',
    intro: 'All pages must have minimum 1" margins on all sides. Page numbers must be positioned 0.5" from the bottom edge.',
    rules: [
      { id: 'MARGIN-001', name: 'Left Margin ≥ 1"', description: 'Left margin must be at least 1 inch', autoFixable: true, severity: 'critical' },
      { id: 'MARGIN-002', name: 'Right Margin ≥ 1"', description: 'Right margin must be at least 1 inch', autoFixable: true, severity: 'critical' },
      { id: 'MARGIN-003', name: 'Top Margin ≥ 1"', description: 'Top margin must be at least 1 inch', autoFixable: true, severity: 'critical' },
      { id: 'MARGIN-004', name: 'Bottom Margin ≥ 1"', description: 'Bottom margin must be at least 1 inch', autoFixable: true, severity: 'critical' },
      { id: 'MARGIN-005', name: 'Page Numbers 0.5" from Bottom', description: 'Footer margin should be 0.5" to position page numbers correctly', autoFixable: true, severity: 'major' },
      { id: 'MARGIN-006', name: 'Abstract Top Margin 2.5"', description: 'The abstract page must have a 2.5" top margin (separate from body margins)', autoFixable: false, severity: 'major' },
    ],
  },
  {
    name: 'Fonts',
    intro: 'All text must use an approved font in an approved size. Only black text is permitted — no colored text or hyperlinks.',
    rules: [
      { id: 'FONT-001', name: 'Approved Font Family', description: 'All text must use an approved font: Arial, Century Gothic, Helvetica, or Times New Roman', autoFixable: true, severity: 'critical' },
      { id: 'FONT-002', name: 'Font Size 10–12pt', description: 'Body text must be between 10pt and 12pt', autoFixable: false, severity: 'critical' },
      { id: 'FONT-003', name: 'Consistent Font Throughout', description: 'Body text should use a single consistent font family', autoFixable: false, severity: 'major' },
      { id: 'FONT-004', name: 'Consistent Font Size', description: 'Body text should use a single consistent font size', autoFixable: false, severity: 'major' },
      { id: 'FONT-005', name: 'All Text Black', description: 'All text must be black — no colored text allowed', autoFixable: true, severity: 'critical' },
      { id: 'FONT-006', name: 'No Colored Hyperlinks', description: 'Hyperlinks must not use colored text — should be black like body text', autoFixable: false, severity: 'major' },
    ],
  },
  {
    name: 'Spacing',
    intro: 'Body text must be double-spaced with first-line indentation. Block quotes and footnotes have specific spacing requirements.',
    rules: [
      { id: 'SPACE-001', name: 'Body Text Double-Spaced', description: 'All body text must be double-spaced', autoFixable: true, severity: 'critical' },
      { id: 'SPACE-002', name: 'Block Quotes Single-Spaced', description: 'Long quotations (block quotes) should be single-spaced', autoFixable: false, severity: 'major' },
      { id: 'SPACE-003', name: 'Block Quotes Indented 0.5" Both Sides', description: 'Block quotes must be indented 0.5" on both left and right', autoFixable: false, severity: 'major' },
    ],
  },
  {
    name: 'Indentation',
    intro: 'All body text paragraphs must use first-line indentation. Block (flush-left) paragraph style is not permitted.',
    rules: [
      { id: 'INDENT-001', name: 'First Line Indent 0.5"', description: 'Body text paragraphs must have a 0.5" first-line indent', autoFixable: true, severity: 'critical' },
      { id: 'INDENT-002', name: 'No Block-Style Paragraphs', description: 'Body text should not use block paragraph style (no indent + extra space between paragraphs)', autoFixable: false, severity: 'major' },
    ],
  },
  {
    name: 'Pagination',
    intro: 'Preliminary pages use lowercase Roman numerals starting at iii. Body pages use Arabic numerals starting at 1. Page numbers must be centered at the bottom.',
    rules: [
      { id: 'PAGE-001', name: 'Title Page Not Numbered', description: 'Title page counts as page i but must not show a page number', autoFixable: true, severity: 'critical' },
      { id: 'PAGE-002', name: 'Copyright Page Not Numbered', description: 'Blank/copyright page counts as page ii but must not show a number', autoFixable: true, severity: 'critical' },
      { id: 'PAGE-003', name: 'Approval Page Numbered iii', description: 'The approval page must always be numbered "iii"', autoFixable: true, severity: 'critical' },
      { id: 'PAGE-004', name: 'Preliminary Pages Use Roman Numerals', description: 'All preliminary pages must use lowercase Roman numerals (iii, iv, v...)', autoFixable: true, severity: 'critical' },
      { id: 'PAGE-005', name: 'Body Pages Start at Arabic 1', description: 'The first page of the body chapter must be numbered 1 in Arabic numerals', autoFixable: true, severity: 'critical' },
      { id: 'PAGE-006', name: 'Page Numbers Centered at Bottom', description: 'Page numbers must be centered at the bottom of each page', autoFixable: true, severity: 'major' },
      { id: 'PAGE-007', name: 'No Missing Page Numbers', description: 'No page numbers should be missing in the sequence', autoFixable: false, severity: 'critical' },
      { id: 'PAGE-008', name: 'No Duplicate Page Numbers', description: 'No page numbers should be duplicated', autoFixable: false, severity: 'critical' },
      { id: 'PAGE-009', name: 'No Blank Numbered Pages', description: 'Every numbered page must contain content', autoFixable: false, severity: 'major' },
    ],
  },
  {
    name: 'Page Order',
    intro: 'The document must follow GEPA\'s required sequence of sections. Required sections are checked for presence; optional sections are verified for correct placement when present.',
    rules: [
      { id: 'ORDER-001', name: 'Title Page is First', description: 'The title page must be the very first page of the document', autoFixable: false, severity: 'critical' },
      { id: 'ORDER-002', name: 'Blank/Copyright Page Second', description: 'Second page must be blank or contain a copyright notice', autoFixable: false, severity: 'critical' },
      { id: 'ORDER-003', name: 'Approval Page Third', description: 'The Dissertation/Thesis Approval page must be page iii', autoFixable: false, severity: 'critical' },
      { id: 'ORDER-004', name: 'Optional Prelim Pages Correctly Placed', description: 'Dedication, epigraph, preface (if present) must appear after the approval page and before the TOC', autoFixable: false, severity: 'major' },
      { id: 'ORDER-005', name: 'Table of Contents Present', description: 'A Table of Contents is required', autoFixable: false, severity: 'critical' },
      { id: 'ORDER-006', name: 'Acknowledgements Present', description: 'An Acknowledgements section is required', autoFixable: false, severity: 'critical' },
      { id: 'ORDER-007', name: 'Vita Present (Doctoral)', description: 'A Vita section is required for doctoral dissertations', autoFixable: false, severity: 'critical' },
      { id: 'ORDER-008', name: 'Abstract Present and Correctly Placed', description: 'An Abstract section is required and must be in the correct location', autoFixable: false, severity: 'critical' },
      { id: 'ORDER-009', name: 'Body Follows Abstract', description: 'Main body chapters must immediately follow the abstract', autoFixable: false, severity: 'critical' },
      { id: 'ORDER-010', name: 'References at End', description: 'References/Bibliography must be the last section of the document', autoFixable: false, severity: 'critical' },
      { id: 'ORDER-011', name: 'Appendices Before References', description: 'If appendices exist, they must precede the References section', autoFixable: false, severity: 'major' },
      { id: 'ORDER-012', name: 'List of Figures/Tables Present if Applicable', description: 'If the document contains figures or tables, a List of Figures/Tables must be in the preliminary pages', autoFixable: false, severity: 'major' },
    ],
  },
  {
    name: 'Title Page',
    intro: 'The title page must follow the exact GEPA format, including university name in all caps, committee listing, and correct degree information.',
    rules: [
      { id: 'TITLE-001', name: 'University Name in All Caps', description: '"UNIVERSITY OF CALIFORNIA SAN DIEGO" must appear in all capital letters', autoFixable: false, severity: 'critical' },
      { id: 'TITLE-002', name: 'Title Uses Words, Not Symbols', description: 'The dissertation title should use words rather than symbols, formulas, or Greek letters', autoFixable: false, severity: 'major' },
      { id: 'TITLE-003', name: '"in" Lowercase on Own Line', description: 'The word "in" should appear lowercase on its own line between the degree text and degree name', autoFixable: false, severity: 'minor' },
      { id: 'TITLE-004', name: '"by" Lowercase on Own Line', description: 'The word "by" should appear lowercase on its own line before the author name', autoFixable: false, severity: 'minor' },
      { id: 'TITLE-005', name: 'Committee Chair Listed First', description: 'The committee chair must be listed first with the title "Professor" or "Chair" designation', autoFixable: false, severity: 'major' },
      { id: 'TITLE-006', name: 'Committee Members Alphabetized', description: 'Committee members (after the chair) must be listed alphabetically by last name', autoFixable: false, severity: 'major' },
      { id: 'TITLE-007', name: 'Committee List Indented 0.5"', description: 'The committee member names must be indented 0.5" from the "Committee in Charge" label', autoFixable: false, severity: 'major' },
      { id: 'TITLE-008', name: 'Committee List Single-Spaced', description: 'Committee member names must be single-spaced', autoFixable: false, severity: 'major' },
      { id: 'TITLE-009', name: 'Degree Year Matches Conferral Year', description: 'The year on the title page should match the expected graduation conferral year', autoFixable: false, severity: 'minor' },
    ],
  },
  {
    name: 'Approval Page',
    intro: 'The approval page (always page iii) must follow the GEPA template and include signature lines for all committee members.',
    rules: [
      { id: 'APPROVAL-001', name: 'Approval Page Present', description: 'The Dissertation/Thesis Approval page must be present', autoFixable: false, severity: 'critical' },
      { id: 'APPROVAL-002', name: 'Approval Page Is Page iii', description: 'The approval page must always be page iii', autoFixable: false, severity: 'critical' },
      { id: 'APPROVAL-003', name: 'Approval Page Uses GEPA Template', description: 'The approval page must follow the GEPA-provided template format', autoFixable: false, severity: 'critical' },
      { id: 'APPROVAL-004', name: 'Committee Signatures Present', description: 'All committee members must have signature lines on the approval page', autoFixable: false, severity: 'critical' },
    ],
  },
  {
    name: 'Abstract',
    intro: 'The abstract has strict word limits based on degree type, and requires a 2.5" top margin and specific formatting.',
    rules: [
      { id: 'ABSTRACT-001', name: 'Abstract Word Count ≤ 350 (Doctoral)', description: 'Doctoral dissertation abstracts must not exceed 350 words', autoFixable: false, severity: 'critical' },
      { id: 'ABSTRACT-002', name: 'Abstract Word Count ≤ 250 (Master\'s)', description: 'Master\'s thesis abstracts must not exceed 250 words', autoFixable: false, severity: 'critical' },
      { id: 'ABSTRACT-003', name: 'Abstract Top Margin 2.5"', description: 'The abstract page must have a 2.5" top margin', autoFixable: false, severity: 'major' },
      { id: 'ABSTRACT-004', name: 'Abstract Double-Spaced', description: 'Abstract body text must be double-spaced', autoFixable: true, severity: 'major' },
    ],
  },
  {
    name: 'Figures & Tables',
    intro: 'All figures and tables must have captions in the correct position. Multi-page items have additional requirements.',
    rules: [
      { id: 'FIG-001', name: 'All Figures Have Captions', description: 'Every figure must have a caption', autoFixable: false, severity: 'critical' },
      { id: 'FIG-002', name: 'Figure Captions Below Figure', description: 'Figure captions must appear immediately below the figure', autoFixable: false, severity: 'major' },
      { id: 'FIG-003', name: 'All Tables Have Captions', description: 'Every table must have a caption', autoFixable: false, severity: 'critical' },
      { id: 'FIG-004', name: 'Table Captions Above Table', description: 'Table captions must appear immediately above the table', autoFixable: false, severity: 'major' },
      { id: 'FIG-005', name: 'Consistent Caption Formatting', description: 'All captions should use consistent style, font, and size', autoFixable: false, severity: 'major' },
      { id: 'FIG-006', name: 'Full-Page Items Have Facing Captions', description: 'If a figure or table fills an entire page, the caption must appear on the facing page', autoFixable: false, severity: 'major' },
      { id: 'FIG-007', name: 'Multi-Page Tables Repeat Headers', description: 'If a table spans multiple pages, the header row must repeat on each page', autoFixable: false, severity: 'major' },
      { id: 'FIG-008', name: 'Multi-Page Tables Have Continuation Captions', description: 'Tables that span multiple pages should have ", Continued" added to repeated captions', autoFixable: false, severity: 'major' },
    ],
  },
  {
    name: 'References & Bibliography',
    intro: 'References must follow a consistent citation style with specific spacing. All authors must be fully listed — "et al." is not permitted in bibliographies.',
    rules: [
      { id: 'REF-001', name: 'References Section Exists', description: 'A References or Bibliography section must be present', autoFixable: false, severity: 'critical' },
      { id: 'REF-002', name: 'References Single-Spaced Within Entries', description: 'Each reference entry must be single-spaced internally', autoFixable: false, severity: 'major' },
      { id: 'REF-003', name: 'Double-Space Between Reference Entries', description: 'There must be a double-space (one blank line) between each reference entry', autoFixable: true, severity: 'major' },
      { id: 'REF-004', name: 'No "et al." in Bibliography', description: '"et al." abbreviation is not permitted in the References/Bibliography section — all authors must be listed', autoFixable: false, severity: 'critical' },
      { id: 'REF-005', name: 'All Authors Listed', description: 'All authors must be listed in each bibliography entry — no abbreviations', autoFixable: false, severity: 'critical' },
      { id: 'REF-006', name: 'Consistent Reference Formatting', description: 'All reference entries should follow a consistent citation style', autoFixable: false, severity: 'major' },
    ],
  },
  {
    name: 'Text Formatting & Headings',
    intro: 'Headings must use Word heading styles and must not use italic formatting. All text must be black.',
    rules: [
      { id: 'TEXT-001', name: 'No Italics in Headings', description: 'Headings must not use italic formatting (unless document follows MLA style)', autoFixable: true, severity: 'major' },
      { id: 'TEXT-002', name: 'No Colored Text', description: 'All text in the document must be black — no colored text allowed', autoFixable: false, severity: 'critical' },
      { id: 'TEXT-003', name: 'No Colored Hyperlinks', description: 'Hyperlinks must use black text, not the default blue color', autoFixable: false, severity: 'major' },
    ],
  },
  {
    name: 'Accessibility',
    intro: 'Documents submitted to GEPA must meet basic accessibility standards to ensure they can be used with screen readers and assistive technologies.',
    rules: [
      { id: 'A11Y-001', name: 'Heading Styles Used', description: 'Headings must use proper Heading styles (not just bold or enlarged text)', autoFixable: false, severity: 'major' },
      { id: 'A11Y-002', name: 'Images Have Alt Text', description: 'All images must have descriptive alternative text for screen readers', autoFixable: true, severity: 'major' },
      { id: 'A11Y-003', name: 'Table Headers Marked', description: 'Tables must have header rows properly marked for accessibility', autoFixable: true, severity: 'major' },
      { id: 'A11Y-004', name: 'Color Contrast Sufficient', description: 'Text and background color contrast must meet WCAG 4.5:1 ratio minimum', autoFixable: false, severity: 'major' },
      { id: 'A11Y-005', name: 'Document Language Set', description: 'The document language must be explicitly set to English (or applicable language)', autoFixable: true, severity: 'minor' },
      { id: 'A11Y-006', name: 'Logical Heading Hierarchy', description: 'Headings must follow a logical sequence without skipping levels (H1 → H2 → H3, not H1 → H3)', autoFixable: false, severity: 'minor' },
      { id: 'A11Y-007', name: 'Reading Order / Tab Order', description: 'Floating text boxes and positioned objects must have alt text or be marked decorative', autoFixable: false, severity: 'minor' },
      { id: 'A11Y-008', name: 'Bookmarks for Navigation', description: 'Document should have bookmarks or named destinations to aid screen reader navigation', autoFixable: false, severity: 'minor' },
      { id: 'A11Y-009', name: 'No Flashing Content', description: 'Document must not contain animated GIFs or flashing content that could trigger seizures', autoFixable: false, severity: 'major' },
      { id: 'A11Y-010', name: 'Color Not Sole Indicator', description: 'Color must not be the only visual means of conveying information', autoFixable: false, severity: 'minor' },
    ],
  },
];

const severityColor = (s: string) => {
  if (s === 'critical') return '#C62828';
  if (s === 'major') return '#E65100';
  return '#1565C0';
};

const severityLabel = (s: string) => {
  if (s === 'critical') return 'Critical';
  if (s === 'major') return 'Major';
  return 'Minor';
};

export default function AboutPage() {
  const totalRules = CATEGORIES.reduce((sum, c) => sum + c.rules.length, 0);
  const autoFixableCount = CATEGORIES.reduce((sum, c) => sum + c.rules.filter(r => r.autoFixable).length, 0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />

      <Box component="main" sx={{ flex: 1 }}>
        <Container sx={{ py: 5, maxWidth: '1170px !important' }}>

          {/* Page Title */}
          <Typography variant="h1" sx={{ color: '#182B49', mb: 2 }}>
            About the Dissertation Formatting Agent
          </Typography>

          {/* Intro */}
          <Typography variant="body1" sx={{ mb: 3, maxWidth: 780, color: '#444', lineHeight: 1.75 }}>
            This tool automatically validates your doctoral dissertation or master&apos;s thesis against
            the UC San Diego GEPA formatting requirements outlined in the &ldquo;Preparation and Submission
            Manual for Doctoral Dissertations and Master&apos;s Theses.&rdquo; It checks <strong>{totalRules} rules</strong> across{' '}
            <strong>{CATEGORIES.length} categories</strong> and auto-corrects <strong>{autoFixableCount} rules</strong> where possible.
          </Typography>

          {/* Legend */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <AutoFixHighIcon sx={{ fontSize: 16, color: '#00629b' }} />
              <Typography variant="body2" color="text.secondary">Auto-fixable — corrected automatically in your downloaded file</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#C62828' }} />
              <Typography variant="body2" color="text.secondary">Critical</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#E65100' }} />
              <Typography variant="body2" color="text.secondary">Major</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#1565C0' }} />
              <Typography variant="body2" color="text.secondary">Minor</Typography>
            </Box>
          </Box>

          <Divider sx={{ mb: 4 }} />

          {/* Rule Categories */}
          {CATEGORIES.map((category, catIdx) => (
            <Box key={category.name} sx={{ mb: 5 }}>
              <Typography variant="h2" sx={{ color: '#182B49', mb: 0.75 }}>
                {category.name}
              </Typography>
              <Typography variant="body2" sx={{ color: '#666', mb: 2.5, maxWidth: 720, lineHeight: 1.65 }}>
                {category.intro}
              </Typography>

              {/* Rule table */}
              <Box sx={{ border: '1px solid #E0E7EF', borderRadius: 2, overflow: 'hidden' }}>
                {category.rules.map((rule, ruleIdx) => (
                  <Box
                    key={rule.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 2,
                      px: 2.5,
                      py: 1.75,
                      borderBottom: ruleIdx < category.rules.length - 1 ? '1px solid #F0F4F8' : 'none',
                      backgroundColor: ruleIdx % 2 === 0 ? '#ffffff' : '#FAFBFC',
                      '&:hover': { backgroundColor: '#EEF5FB' },
                      transition: 'background-color 0.15s',
                    }}
                  >
                    {/* Rule ID */}
                    <Box sx={{ minWidth: 105, pt: 0.1 }}>
                      <Typography
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.78rem',
                          color: '#00629b',
                          fontWeight: 600,
                          letterSpacing: '0.3px',
                        }}
                      >
                        {rule.id}
                      </Typography>
                    </Box>

                    {/* Rule name + description */}
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                        <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', color: '#182B49' }}>
                          {rule.name}
                        </Typography>
                        {rule.autoFixable && (
                          <AutoFixHighIcon
                            sx={{ fontSize: 15, color: '#00629b' }}
                            titleAccess="Auto-fixable"
                          />
                        )}
                      </Box>
                      <Typography sx={{ fontSize: '0.85rem', color: '#555', lineHeight: 1.5 }}>
                        {rule.description}
                      </Typography>
                    </Box>

                    {/* Severity badge */}
                    <Box sx={{ pt: 0.2 }}>
                      <Chip
                        label={severityLabel(rule.severity)}
                        size="small"
                        sx={{
                          backgroundColor: severityColor(rule.severity) + '18',
                          color: severityColor(rule.severity),
                          fontWeight: 600,
                          fontSize: '0.7rem',
                          height: 22,
                          border: `1px solid ${severityColor(rule.severity)}40`,
                        }}
                      />
                    </Box>
                  </Box>
                ))}
              </Box>

              {catIdx < CATEGORIES.length - 1 && <Divider sx={{ mt: 4 }} />}
            </Box>
          ))}

          <Divider sx={{ mt: 2, mb: 4 }} />

          {/* FAQ Section */}
          <Typography variant="h2" sx={{ color: '#182B49', mb: 3 }}>
            Frequently Asked Questions
          </Typography>
          {FAQ_ITEMS.map(({ q, a }) => (
            <Accordion
              key={q}
              disableGutters
              elevation={0}
              sx={{
                border: '1px solid #E0E7EF',
                borderRadius: '8px !important',
                mb: 1.5,
                '&:before': { display: 'none' },
                '&.Mui-expanded': { borderColor: '#00629b' },
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon sx={{ color: '#00629b' }} />}
                sx={{
                  px: 3,
                  py: 1,
                  '& .MuiAccordionSummary-content': { my: 1.5 },
                  '&.Mui-expanded': { backgroundColor: '#EEF5FB' },
                  borderRadius: '8px',
                }}
              >
                <Typography sx={{ fontWeight: 600, color: '#182B49' }}>{q}</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 3, pb: 2.5 }}>
                <Typography variant="body2" color="text.secondary">
                  {a}
                </Typography>
              </AccordionDetails>
            </Accordion>
          ))}

        </Container>
      </Box>

      <Footer />
    </Box>
  );
}
