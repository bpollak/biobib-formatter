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
    a: 'Only .docx files (Microsoft Word). LaTeX and PDF support is planned for a future release.',
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
    q: 'Is my document stored?',
    a: 'Documents are processed in memory and automatically deleted after your session ends. Nothing is permanently stored on our servers.',
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
      { id: 'MARGIN-001', name: 'Left Margin ≥ 1"', description: 'Left margin must be at least 1 inch throughout the document.', autoFixable: true, severity: 'critical' },
      { id: 'MARGIN-002', name: 'Right Margin ≥ 1"', description: 'Right margin must be at least 1 inch throughout the document.', autoFixable: true, severity: 'critical' },
      { id: 'MARGIN-003', name: 'Top Margin ≥ 1"', description: 'Top margin must be at least 1 inch throughout the document.', autoFixable: true, severity: 'critical' },
      { id: 'MARGIN-004', name: 'Bottom Margin ≥ 1"', description: 'Bottom margin must be at least 1 inch throughout the document.', autoFixable: true, severity: 'critical' },
      { id: 'MARGIN-005', name: 'Page Numbers 0.5" from Bottom', description: 'Footer distance must be 0.5" to correctly position page numbers from the bottom edge.', autoFixable: true, severity: 'major' },
      { id: 'MARGIN-006', name: 'Abstract Top Margin 2.5"', description: 'The abstract page requires a 2.5" top margin (set via a section break in Word).', autoFixable: false, severity: 'major' },
    ],
  },
  {
    name: 'Fonts',
    intro: 'All text must use an approved font in an approved size. Only black text is permitted — no colored text or hyperlinks.',
    rules: [
      { id: 'FONT-001', name: 'Approved Font Family', description: 'All text must use Arial, Century Gothic, Helvetica, or Times New Roman.', autoFixable: true, severity: 'critical' },
      { id: 'FONT-002', name: 'Font Size 10–12pt', description: 'Body text must be between 10pt and 12pt. Footnotes and captions minimum 10pt.', autoFixable: false, severity: 'critical' },
      { id: 'FONT-003', name: 'Consistent Font Throughout', description: 'Body text must use a single consistent font family throughout the document.', autoFixable: false, severity: 'major' },
      { id: 'FONT-004', name: 'Consistent Font Size', description: 'Body text must use a single consistent font size throughout the document.', autoFixable: false, severity: 'major' },
      { id: 'FONT-005', name: 'All Text Black', description: 'All text must be black — no colored text is permitted (including highlighted or shaded text).', autoFixable: true, severity: 'critical' },
      { id: 'FONT-006', name: 'No Colored Hyperlinks', description: 'Hyperlinks must use black text, not the default blue color.', autoFixable: false, severity: 'major' },
    ],
  },
  {
    name: 'Spacing',
    intro: 'Body text must be double-spaced with first-line indentation. Block quotes and footnotes have specific spacing requirements.',
    rules: [
      { id: 'SPACE-001', name: 'Body Text Double-Spaced', description: 'All body text paragraphs must use double line spacing (2.0).', autoFixable: true, severity: 'critical' },
      { id: 'SPACE-002', name: 'Block Quotes Single-Spaced', description: 'Block quotations (6+ lines) must be single-spaced.', autoFixable: false, severity: 'major' },
      { id: 'SPACE-003', name: 'Block Quotes Indented 0.5" Both Sides', description: 'Block quotations must be indented 0.5" from both the left and right margins.', autoFixable: false, severity: 'major' },
      { id: 'SPACE-004', name: 'Footnotes May Be Single-Spaced', description: 'Footnote text is permitted to be single-spaced (verified, not required).', autoFixable: false, severity: 'minor' },
      { id: 'SPACE-005', name: 'Figure/Table Captions May Be Single-Spaced', description: 'Captions for figures and tables are permitted to be single-spaced.', autoFixable: false, severity: 'minor' },
    ],
  },
  {
    name: 'Indentation',
    intro: 'All body text paragraphs must use first-line indentation. Block (flush-left) paragraph style is not permitted.',
    rules: [
      { id: 'INDENT-001', name: 'First Line Indent 0.5"', description: 'Every body text paragraph must have a 0.5" (720 twip) first-line indent.', autoFixable: true, severity: 'critical' },
      { id: 'INDENT-002', name: 'No Block-Style Paragraphs', description: 'Paragraphs must not use block style (flush-left with extra space between paragraphs).', autoFixable: false, severity: 'major' },
    ],
  },
  {
    name: 'Pagination',
    intro: 'Preliminary pages use lowercase Roman numerals starting at iii. Body pages use Arabic numerals starting at 1. Page numbers must be centered at the bottom.',
    rules: [
      { id: 'PAGE-001', name: 'Title Page Not Numbered', description: 'The title page is page i but the number is not displayed.', autoFixable: false, severity: 'critical' },
      { id: 'PAGE-002', name: 'Copyright Page Not Numbered', description: 'The blank/copyright page is page ii but the number is not displayed.', autoFixable: false, severity: 'critical' },
      { id: 'PAGE-003', name: 'Approval Page Numbered iii', description: 'The approval page must always display the Roman numeral "iii".', autoFixable: false, severity: 'critical' },
      { id: 'PAGE-004', name: 'Preliminary Pages Use Roman Numerals', description: 'All preliminary pages (iii onward) must use lowercase Roman numerals.', autoFixable: false, severity: 'critical' },
      { id: 'PAGE-005', name: 'Body Pages Start at Arabic 1', description: 'The first page of the main body must be page 1, using Arabic numerals.', autoFixable: false, severity: 'critical' },
      { id: 'PAGE-006', name: 'Page Numbers Centered at Bottom', description: 'All page numbers must be centered at the bottom of the page.', autoFixable: false, severity: 'major' },
      { id: 'PAGE-007', name: 'No Missing Page Numbers', description: 'Manual verification: no pages in the sequence should be missing a number.', autoFixable: false, severity: 'major' },
      { id: 'PAGE-008', name: 'No Duplicate Page Numbers', description: 'Manual verification: no page number should appear more than once.', autoFixable: false, severity: 'major' },
      { id: 'PAGE-009', name: 'No Blank Numbered Pages', description: 'Manual verification: blank pages should not display a page number.', autoFixable: false, severity: 'major' },
    ],
  },
  {
    name: 'Page Order',
    intro: 'The document must follow GEPA\'s required sequence of sections. Required sections are checked for presence; optional sections are verified for correct placement when present.',
    rules: [
      { id: 'ORDER-001', name: 'Title Page is First', description: 'The title page must be the first page of the document.', autoFixable: false, severity: 'critical' },
      { id: 'ORDER-002', name: 'Blank/Copyright Page Second', description: 'The blank or copyright page must immediately follow the title page.', autoFixable: false, severity: 'critical' },
      { id: 'ORDER-003', name: 'Approval Page Third', description: 'The approval page must be page iii, immediately after the copyright page.', autoFixable: false, severity: 'critical' },
      { id: 'ORDER-004', name: 'Optional Prelim Pages Correctly Placed', description: 'Dedication, epigraph, and preface (if present) must appear in the correct position in the preliminary section.', autoFixable: false, severity: 'major' },
      { id: 'ORDER-005', name: 'Table of Contents Present', description: 'A Table of Contents is required and must appear in the preliminary section.', autoFixable: false, severity: 'critical' },
      { id: 'ORDER-006', name: 'Acknowledgements Present', description: 'An Acknowledgements section is required for all dissertations and theses.', autoFixable: false, severity: 'major' },
      { id: 'ORDER-007', name: 'Vita Present (Doctoral)', description: 'A Vita (biographical sketch) is required for doctoral dissertations.', autoFixable: false, severity: 'critical' },
      { id: 'ORDER-008', name: 'Abstract Present and Correctly Placed', description: 'The Abstract must be present and placed in the correct position after preliminary pages.', autoFixable: false, severity: 'critical' },
      { id: 'ORDER-009', name: 'Body Follows Abstract', description: 'The main body chapters must follow immediately after the abstract.', autoFixable: false, severity: 'critical' },
      { id: 'ORDER-010', name: 'References at End', description: 'The References/Bibliography section must be the final section of the document (or each chapter).', autoFixable: false, severity: 'major' },
      { id: 'ORDER-011', name: 'Appendices Before References', description: 'If appendices are present, they must appear before the References section.', autoFixable: false, severity: 'major' },
      { id: 'ORDER-012', name: 'List of Figures/Tables Present if Applicable', description: 'If the document contains figures or tables, a List of Figures and/or List of Tables must be present.', autoFixable: false, severity: 'major' },
    ],
  },
  {
    name: 'Title Page',
    intro: 'The title page must follow the exact GEPA format, including university name in all caps, committee listing, and correct degree information.',
    rules: [
      { id: 'TITLE-001', name: 'University Name in All Caps', description: '"UNIVERSITY OF CALIFORNIA SAN DIEGO" must appear in all capital letters.', autoFixable: true, severity: 'critical' },
      { id: 'TITLE-002', name: 'Title Uses Words, Not Symbols', description: 'Dissertation title must not contain symbols, formulas, subscripts, superscripts, or Greek letters.', autoFixable: false, severity: 'major' },
      { id: 'TITLE-003', name: 'Committee Chair Listed First', description: 'The committee chair must be listed first in the committee section, with "Chair" designation.', autoFixable: false, severity: 'major' },
      { id: 'TITLE-004', name: 'Committee Members Alphabetized', description: 'After the chair, remaining committee members must be listed alphabetically.', autoFixable: false, severity: 'major' },
      { id: 'TITLE-005', name: 'Committee List Indented 0.5"', description: 'Committee member names must be indented 0.5" from the "Committee in Charge" heading.', autoFixable: false, severity: 'major' },
      { id: 'TITLE-006', name: 'Committee List Single-Spaced', description: 'The committee list must be single-spaced.', autoFixable: false, severity: 'minor' },
      { id: 'TITLE-007', name: 'Degree Year Matches Conferral Year', description: 'The year on the title page must match the quarter of degree conferral.', autoFixable: false, severity: 'major' },
    ],
  },
  {
    name: 'Approval Page',
    intro: 'The approval page (always page iii) must follow the GEPA template and include signature lines for all committee members.',
    rules: [
      { id: 'APPROVAL-001', name: 'Approval Page Present', description: 'The Dissertation/Thesis Approval page must be present.', autoFixable: false, severity: 'critical' },
      { id: 'APPROVAL-002', name: 'Approval Page Is Page iii', description: 'The approval page must always be page iii regardless of other content.', autoFixable: false, severity: 'critical' },
      { id: 'APPROVAL-003', name: 'Approval Page Uses GEPA Template', description: 'The approval page must follow the official GEPA-provided template format.', autoFixable: false, severity: 'critical' },
      { id: 'APPROVAL-004', name: 'Committee Signatures Present', description: 'All committee members must have signature lines on the approval page.', autoFixable: false, severity: 'critical' },
    ],
  },
  {
    name: 'Abstract',
    intro: 'The abstract has strict word limits based on degree type, and requires a 2.5" top margin and specific formatting.',
    rules: [
      { id: 'ABSTRACT-001', name: 'Abstract Word Count ≤ 350 (Doctoral)', description: 'Doctoral dissertation abstracts must not exceed 350 words.', autoFixable: false, severity: 'critical' },
      { id: 'ABSTRACT-002', name: "Abstract Word Count ≤ 250 (Master's)", description: "Master's thesis abstracts must not exceed 250 words.", autoFixable: false, severity: 'critical' },
      { id: 'ABSTRACT-003', name: 'Abstract Top Margin 2.5"', description: 'The abstract page must have a 2.5" top margin, set via a section break.', autoFixable: false, severity: 'major' },
      { id: 'ABSTRACT-004', name: 'Abstract Double-Spaced', description: 'The abstract body text must be double-spaced with 0.5" paragraph indentation.', autoFixable: true, severity: 'major' },
    ],
  },
  {
    name: 'Figures & Tables',
    intro: 'All figures and tables must have captions in the correct position. Multi-page items have additional requirements.',
    rules: [
      { id: 'FIG-001', name: 'All Figures Have Captions', description: 'Every figure must have a caption.', autoFixable: false, severity: 'critical' },
      { id: 'FIG-002', name: 'Figure Captions Below Figure', description: 'Figure captions must appear immediately below the figure.', autoFixable: false, severity: 'major' },
      { id: 'FIG-003', name: 'All Tables Have Captions', description: 'Every table must have a caption.', autoFixable: false, severity: 'critical' },
      { id: 'FIG-004', name: 'Table Captions Above Table', description: 'Table captions must appear immediately above the table.', autoFixable: false, severity: 'major' },
      { id: 'FIG-005', name: 'Consistent Caption Formatting', description: 'All captions must use consistent style, font, and size throughout.', autoFixable: false, severity: 'major' },
      { id: 'FIG-006', name: 'Full-Page Items Have Facing Captions', description: 'If a figure or table fills an entire page, its caption must appear on the facing (opposite) page.', autoFixable: false, severity: 'major' },
      { id: 'FIG-007', name: 'Multi-Page Tables Repeat Headers', description: 'If a table spans multiple pages, the header row must repeat on each page.', autoFixable: false, severity: 'major' },
      { id: 'FIG-008', name: 'Multi-Page Continuation Captions', description: 'Tables spanning multiple pages must add ", Continued" to the repeated caption.', autoFixable: false, severity: 'major' },
    ],
  },
  {
    name: 'References & Bibliography',
    intro: 'References must follow a consistent citation style with specific spacing. All authors must be fully listed — "et al." is not permitted in bibliographies.',
    rules: [
      { id: 'REF-001', name: 'References Section Exists', description: 'The document must contain a References or Bibliography section.', autoFixable: false, severity: 'critical' },
      { id: 'REF-002', name: 'References Single-Spaced Within Entries', description: 'Individual reference entries must be single-spaced internally.', autoFixable: false, severity: 'major' },
      { id: 'REF-003', name: 'Double-Space Between Reference Entries', description: 'There must be a blank line between each reference entry.', autoFixable: false, severity: 'major' },
      { id: 'REF-004', name: 'No "et al." in Bibliography', description: '"et al." abbreviation is not permitted in the bibliography — all authors must be listed.', autoFixable: false, severity: 'major' },
      { id: 'REF-005', name: 'All Authors Listed', description: 'Author names must not be abbreviated — every author must be listed in full.', autoFixable: false, severity: 'major' },
      { id: 'REF-006', name: 'Consistent Reference Formatting', description: 'All references must follow a consistent citation style (APA, MLA, Chicago, etc.) throughout.', autoFixable: false, severity: 'major' },
    ],
  },
  {
    name: 'Text Formatting & Headings',
    intro: 'Headings must use Word heading styles and must not use italic formatting. All text must be black.',
    rules: [
      { id: 'TEXT-001', name: 'No Italics in Headings', description: 'Headings must not use italic formatting (unless the document follows MLA style).', autoFixable: true, severity: 'major' },
      { id: 'TEXT-002', name: 'No Colored Text', description: 'All text must be black — any non-black color will be flagged.', autoFixable: true, severity: 'critical' },
      { id: 'TEXT-003', name: 'No Colored Hyperlinks', description: 'Hyperlinks must use black text, not default blue or other colors.', autoFixable: false, severity: 'major' },
    ],
  },
  {
    name: 'Accessibility',
    intro: 'Documents submitted to GEPA must meet basic accessibility standards to ensure they can be used with screen readers and assistive technologies.',
    rules: [
      { id: 'A11Y-001', name: 'Heading Styles Used', description: 'Headings must use Word\'s built-in Heading styles, not just bold or enlarged text.', autoFixable: false, severity: 'major' },
      { id: 'A11Y-002', name: 'Images Have Alt Text', description: 'All images and figures must have descriptive alternative text for screen readers.', autoFixable: false, severity: 'major' },
      { id: 'A11Y-003', name: 'Table Headers Marked', description: 'Tables must have header rows properly marked using Word\'s table header row feature.', autoFixable: false, severity: 'major' },
      { id: 'A11Y-004', name: 'Color Contrast Sufficient', description: 'Text and background color contrast must meet the WCAG 4.5:1 minimum ratio.', autoFixable: false, severity: 'major' },
      { id: 'A11Y-005', name: 'Document Language Set', description: 'The document language must be explicitly set to English (or the applicable language) in Word.', autoFixable: false, severity: 'minor' },
      { id: 'A11Y-006', name: 'Logical Heading Hierarchy', description: 'Headings must follow a logical sequence without skipping more than one level.', autoFixable: false, severity: 'minor' },
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
