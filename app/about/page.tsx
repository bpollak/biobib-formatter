'use client';

import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const FAQ_ITEMS = [
  {
    q: 'What file formats are accepted?',
    a: 'Only .docx files. LaTeX and PDF support is coming in a future release.',
  },
  {
    q: 'What formatting rules does this check?',
    a: 'Over 60 rules from the GEPA Preparation and Submission Manual, including margins, fonts, spacing, pagination, title page format, abstract requirements, and more.',
  },
  {
    q: 'Will this change my content?',
    a: 'No. The tool only checks and corrects formatting (margins, fonts, spacing, indentation). Your text, figures, and references are never modified.',
  },
  {
    q: 'Can this replace the GEPA formatting review?',
    a: 'Not yet. This is a pre-check tool to help you catch and fix issues before your official GEPA submission. Final review is still done by GEPA advisors.',
  },
  {
    q: 'Is my document stored?',
    a: 'Documents are processed in memory and automatically deleted after your session. Nothing is permanently stored.',
  },
  {
    q: 'What about accessibility (WCAG 2.1)?',
    a: 'Basic accessibility checks are included. Full WCAG 2.1 Level AA validation is planned for a future release.',
  },
];

const CATEGORIES = [
  {
    name: 'Margins',
    rules: [
      'Minimum 1" margins on all sides (top, bottom, left, right)',
      'Page numbers centered 0.5" from bottom edge',
      'Figures, charts, graphs, and appendices must also respect margin requirements',
    ],
  },
  {
    name: 'Fonts',
    rules: [
      'Approved fonts: Arial, Century Gothic, Helvetica, or Times New Roman',
      'Font size: 10pt, 11pt, or 12pt — consistent throughout',
      'Footnotes and captions: minimum 10pt',
      'All text must be black — no colored text or links',
      'Italics may be used for emphasis but NOT for headings (unless MLA format)',
    ],
  },
  {
    name: 'Spacing',
    rules: [
      'Body text double-spaced',
      'First line of each paragraph indented 0.5"',
      'Block quotes (6+ lines): single-spaced, indented 0.5" from both left and right margins',
      'Footnotes, figure/table text, and captions may be single-spaced',
    ],
  },
  {
    name: 'Pagination',
    rules: [
      'Title page: not numbered (counts as page i)',
      'Blank/copyright page: not numbered (counts as page ii)',
      'Approval page: always numbered "iii"',
      'Preliminary pages: lowercase Roman numerals (iii, iv, v, vi...)',
      'Body and back matter: Arabic numerals starting at "1"',
      'No missing, blank, or duplicate page numbers',
    ],
  },
  {
    name: 'Page Order',
    rules: [
      'Validates the correct sequence: Title Page → Blank/Copyright → Approval Page (iii) → Dedication (optional) → Epigraph (optional) → Table of Contents → Lists (if applicable) → Preface (optional) → Acknowledgements → Vita (required for doctoral) → Abstract → Main Body → Appendices → References/Bibliography',
    ],
  },
  {
    name: 'Title Page',
    rules: [
      '"UNIVERSITY OF CALIFORNIA SAN DIEGO" in all capital letters',
      'Title: specific, descriptive, no symbols/formulas/Greek letters',
      '"in" lowercase on its own line',
      '"by" lowercase on its own line',
      'Committee members listed: chair first, then alphabetized, indented 0.5" from "Committee in Charge"',
      'Degree year matches quarter of conferral',
    ],
  },
  {
    name: 'Abstract',
    rules: [
      'Doctoral dissertations: maximum 350 words',
      'Master\'s theses: maximum 250 words',
      'Top margin: 2.5"',
      'Double-spaced, paragraphs indented 0.5"',
    ],
  },
  {
    name: 'Figures & Tables',
    rules: [
      'All figures and tables must have captions',
      'Figure captions: below the figure',
      'Table captions: above the table',
      'Consistent caption formatting throughout',
      'Multi-page figures/tables: caption repeated with ", Continued"',
      'Facing caption pages must precede the figure/table',
    ],
  },
  {
    name: 'References & Bibliography',
    rules: [
      'Single-spaced with double space between entries',
      'All authors must be listed — no "et al." in bibliography',
      'Format consistent throughout, following the student\'s discipline',
      'Must be the last entry in each chapter or in the dissertation/thesis',
    ],
  },
  {
    name: 'Headings',
    rules: [
      'Consistent header formatting throughout',
      'No italics in headings (unless MLA style)',
      'Preliminary page headers must match the formatting used on sample pages',
    ],
  },
  {
    name: 'Paragraph Formatting',
    rules: [
      'Block style paragraphs NOT allowed — all paragraphs must be indented',
      '0.5" indent on first line of each paragraph',
    ],
  },
  {
    name: 'Accessibility (Basic)',
    rules: [
      'Alt-text present on images and figures',
      'Heading structure is logical and hierarchical',
      'Note: Full WCAG 2.1 Level AA validation planned for future release',
    ],
  },
];

export default function AboutPage() {
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
          <Typography variant="body1" sx={{ mb: 4, maxWidth: 780, color: '#444', lineHeight: 1.75 }}>
            This tool automatically validates your doctoral dissertation or master&apos;s thesis against
            the UC San Diego GEPA formatting requirements outlined in the &ldquo;Preparation and Submission
            Manual for Doctoral Dissertations and Master&apos;s Theses.&rdquo; It checks over 60 rules across
            13 categories, auto-corrects what it can, and provides specific guidance for anything that
            needs manual attention.
          </Typography>

          <Divider sx={{ mb: 4 }} />

          {/* Categories */}
          {CATEGORIES.map((category, index) => (
            <Box key={category.name} sx={{ mb: 4 }}>
              <Typography
                variant="h2"
                sx={{
                  color: '#00629b',
                  mb: 1.5,
                }}
              >
                {category.name}
              </Typography>
              <Box
                component="ul"
                sx={{
                  m: 0,
                  pl: 3,
                  '& li': {
                    mb: 0.75,
                  },
                }}
              >
                {category.rules.map((rule) => (
                  <Box
                    component="li"
                    key={rule}
                    sx={{
                      fontFamily: '"Roboto", "Helvetica Neue", Arial, sans-serif',
                      fontSize: '0.975rem',
                      color: '#333',
                      lineHeight: 1.65,
                    }}
                  >
                    {rule}
                  </Box>
                ))}
              </Box>
              {index < CATEGORIES.length - 1 && (
                <Divider sx={{ mt: 3 }} />
              )}
            </Box>
          ))}
          <Divider sx={{ mt: 4, mb: 4 }} />

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
