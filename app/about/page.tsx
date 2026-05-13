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
import ArticleIcon from '@mui/icons-material/Article';

const BIOBIB_SECTIONS = [
  {
    label: 'Section I — Employment History and Education',
    color: 'primary' as const,
    rules: [
      'List all employment chronologically from your first academic (or otherwise relevant) position to the present.',
      'Include all University of California employment, even if listed elsewhere.',
      'Account for all time periods, including part-time appointments and gaps in employment.',
      'Education: list each institution, dates of attendance, location, major field, degree or certificate, and date received.',
      'Indicate areas of sub-specialization, board certification, and any special licenses or permits.',
    ],
  },
  {
    label: 'Section II — Professional Data',
    color: 'secondary' as const,
    rules: [
      'All nine categories must be addressed. If a category does not apply, write "None" or "Not applicable."',
      'List all activities with dates. Maintain chronological order.',
      'If maintaining ongoing cumulative lists, insert a horizontal line to indicate what is new since your last review.',
    ],
    subcategories: [
      { name: '1. University Service', detail: 'Include departmental, college, Academic Senate, campus-wide, and UC systemwide service.' },
      { name: '2. Public Service', detail: 'Non-university service related to your academic role.' },
      { name: '3. Professional Activities', detail: 'Society memberships, editorial board roles, conference organizing, peer review service.' },
      { name: '4. Awards and Honors', detail: 'List all awards with dates received.' },
      { name: '5. Teaching', detail: 'Courses taught, graduate students supervised (name, degree, graduation year), postdoctoral researchers mentored.' },
      { name: '6. Research Support', detail: 'Current and past grants: title, funder, total amount, period, and your role (PI, co-PI, etc.).' },
      { name: '7. Outreach / Public Engagement', detail: 'Media appearances, public lectures, K-12 programs, community engagement.' },
      { name: '8. Clinical Activities', detail: 'If applicable to your appointment.' },
      { name: '9. Other Activities', detail: 'Anything not covered above that is relevant to your academic work.' },
    ],
  },
  {
    label: 'Section III — Bibliography',
    color: 'success' as const,
    rules: [
      'All citations must be numbered and listed in chronological order.',
      'Use a citation format appropriate for your discipline and acceptable to your division or school.',
      'Insert a horizontal line within each subsection to separate new material from previously credited material.',
      'Mark citations with an asterisk (*) if the published work will be submitted with the review file.',
      'Do not include items that have been submitted but not yet accepted for publication.',
    ],
    subcategories: [
      {
        name: 'A. Primary Published or Creative Work',
        detail: 'Original peer-reviewed work in the open literature, or documented creative endeavors (performances, artistic works). May include items "in press" or formally "accepted" — indicate this clearly in the citation.',
        children: [
          'I-a. Refereed Journal Articles — Do not include conference abstracts here.',
          'I-b. Review and Invited Articles',
          'I-c. Books — List books and book chapters as separate subcategories. Do not include encyclopedia entries here.',
          'I-d. Book Chapters',
          'I-e. Refereed Conference Proceedings — Include acceptance rate if available.',
        ],
      },
      {
        name: 'B. Other Work',
        detail: 'Published or creative works that demonstrate scholarly activity but are not primary peer-reviewed work. Materials need not be submitted with the file.',
        children: [
          'Other Conference Proceedings — Papers from conferences with program committee review.',
          'Abstracts — Published in conference abstract books.',
          'Popular Works — Op-eds, book reviews, encyclopedia entries, magazine articles.',
          'Additional Products — Patents, software, databases, websites, hardware, research leading to policy or legislation.',
        ],
      },
      {
        name: 'C. Work in Progress',
        detail: 'Optional. Include only items for which actual material will be submitted with the review file (e.g., draft chapters, documentation of progress on a major work). Primarily for assistant professor appraisals; discouraged for other actions.',
        children: [],
      },
    ],
  },
];

const FAQ_ITEMS = [
  {
    q: 'What file formats are accepted?',
    a: 'Only .docx files (Microsoft Word). Your CV must be in Word format for the conversion to work correctly.',
  },
  {
    q: 'Will this change my CV?',
    a: 'No. Your original CV is not modified. The tool reads your CV and generates a new BioBib document. Your CV file is processed in memory and discarded immediately — nothing is stored.',
  },
  {
    q: 'What gets filled in automatically?',
    a: 'Employment history, education, awards, grants, university service, professional activities, and publications are all extracted and mapped automatically. The tool classifies publications into the correct BioBib subsections (peer-reviewed journals, books, proceedings, etc.) and preserves your citation format exactly.',
  },
  {
    q: 'What will I still need to fill in manually?',
    a: 'The gap report at the end of each conversion tells you exactly what is missing and what to add. Common gaps include: graduate students supervised (name, degree, year), outreach activities not mentioned in the CV, and Work in Progress (Section III-C), which is always manual.',
  },
  {
    q: 'Does it handle the "new since last review" horizontal line?',
    a: 'Not automatically — you will need to add the horizontal dividing line in your Word document to separate new material from previously credited work. The gap report will remind you of this requirement.',
  },
  {
    q: 'Can this replace the Academic Personnel review?',
    a: 'No. This tool generates a draft BioBib to save you time. Final review and submission follow your department\'s and division\'s normal academic review process.',
  },
  {
    q: 'Is my document stored?',
    a: 'No. Your CV is processed entirely in memory and discarded immediately after conversion. The generated BioBib is held temporarily in your browser session for download and is not stored on any server.',
  },
  {
    q: 'What BioBib instructions does this follow?',
    a: 'This tool follows the official UCSD Instructions for Completing the Academic Biography and Bibliography Form (April 2015), available from Academic Personnel Services.',
  },
];

export default function AboutPage() {
  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      {/* Header */}
      <Box sx={{ mb: 5 }}>
        <Typography variant="h4" fontWeight={700} sx={{ color: '#182B49' }} gutterBottom>
          About the BioBib Formatter
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 700 }}>
          The BioBib Formatter is a UCSD tool that reads your faculty CV (.docx) and converts it
          to the UCSD Academic Biography and Bibliography (BioBib) format required for academic
          review files. It maps your CV content to each BioBib section automatically and generates
          a gap report for anything that requires manual completion.
        </Typography>
      </Box>

      <Divider sx={{ mb: 5 }} />

      {/* BioBib Structure */}
      <Box sx={{ mb: 5 }}>
        <Typography variant="h5" fontWeight={600} sx={{ color: '#182B49', mb: 3 }}>
          BioBib Form Structure &amp; Rules
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          The UCSD Academic Biography and Bibliography form has three sections. Every academic
          review file requires a current, complete BioBib. The rules below reflect the official
          April 2015 instructions from Academic Personnel Services.
        </Typography>

        {BIOBIB_SECTIONS.map((section, si) => (
          <Box key={si} sx={{ mb: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <ArticleIcon sx={{ color: '#00629B' }} />
              <Typography variant="h6" fontWeight={600} sx={{ color: '#182B49' }}>
                {section.label}
              </Typography>
            </Box>

            {/* Top-level rules */}
            <Box component="ul" sx={{ pl: 3, mb: 2, mt: 0 }}>
              {section.rules.map((rule, ri) => (
                <Box component="li" key={ri} sx={{ mb: 0.75 }}>
                  <Typography variant="body2">{rule}</Typography>
                </Box>
              ))}
            </Box>

            {/* Subcategories */}
            {'subcategories' in section && section.subcategories && (
              <Box sx={{ pl: 2 }}>
                {(section.subcategories as Array<{ name: string; detail: string; children?: string[] }>).map((sub, subI) => (
                  <Box key={subI} sx={{ mb: 2, pl: 2, borderLeft: '3px solid #C69214' }}>
                    <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                      {sub.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: sub.children && sub.children.length > 0 ? 1 : 0 }}>
                      {sub.detail}
                    </Typography>
                    {sub.children && sub.children.length > 0 && (
                      <Box component="ul" sx={{ pl: 2.5, mt: 0.5, mb: 0 }}>
                        {sub.children.map((child, ci) => (
                          <Box component="li" key={ci} sx={{ mb: 0.5 }}>
                            <Typography variant="body2" color="text.secondary">{child}</Typography>
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Box>
                ))}
              </Box>
            )}

            {si < BIOBIB_SECTIONS.length - 1 && <Divider sx={{ mt: 3 }} />}
          </Box>
        ))}
      </Box>

      <Divider sx={{ mb: 5 }} />

      {/* What the tool does and doesn't do */}
      <Box sx={{ mb: 5 }}>
        <Typography variant="h5" fontWeight={600} sx={{ color: '#182B49', mb: 2 }}>
          What This Tool Does
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 3 }}>
          <Box sx={{ flex: 1, p: 3, bgcolor: '#f0f7f0', borderRadius: 2, border: '1px solid #c8e6c9' }}>
            <Typography variant="subtitle2" fontWeight={700} color="success.dark" gutterBottom>
              ✓ Filled automatically
            </Typography>
            {[
              'Section I — Employment history from CV Appointments',
              'Section I — Education',
              'Section II — University service entries',
              'Section II — Awards and honors',
              'Section II — Research grants (current + past)',
              'Section II — Professional activities',
              'Section III — All publication subsections (journals, books, proceedings, abstracts)',
              'Publication classification by type',
              'Citation text preserved exactly from your CV',
            ].map((item, i) => (
              <Typography key={i} variant="body2" sx={{ mb: 0.5 }}>• {item}</Typography>
            ))}
          </Box>
          <Box sx={{ flex: 1, p: 3, bgcolor: '#fff8f0', borderRadius: 2, border: '1px solid #ffe0b2' }}>
            <Typography variant="subtitle2" fontWeight={700} color="warning.dark" gutterBottom>
              ⚠ May need manual completion
            </Typography>
            {[
              'Graduate students supervised (name, degree, year)',
              'Postdoctoral researchers mentored',
              'Outreach / public engagement (often absent from CVs)',
              'Clinical activities (if applicable)',
              'Horizontal line separating new from prior work in bibliography',
              'Work in Progress (Section III-C) — always manual',
              'Personal Data section (submitted separately to hiring authority)',
            ].map((item, i) => (
              <Typography key={i} variant="body2" sx={{ mb: 0.5 }}>• {item}</Typography>
            ))}
          </Box>
        </Box>
      </Box>

      <Divider sx={{ mb: 5 }} />

      {/* FAQ */}
      <Box sx={{ mb: 5 }}>
        <Typography variant="h5" fontWeight={600} sx={{ color: '#182B49', mb: 3 }}>
          Frequently Asked Questions
        </Typography>
        {FAQ_ITEMS.map((item, i) => (
          <Accordion key={i} disableGutters elevation={0} sx={{ border: '1px solid #e0e0e0', mb: 1, '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={600}>{item.q}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary">{item.a}</Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>

      <Divider sx={{ mb: 4 }} />

      {/* Reference links */}
      <Box>
        <Typography variant="h6" fontWeight={600} sx={{ color: '#182B49', mb: 1.5 }}>
          Official References
        </Typography>
        <Typography variant="body2" sx={{ mb: 0.75 }}>
          <a href="https://academicaffairs.ucsd.edu/_files/aps/forms/word/BioBib-instructions.docx" style={{ color: '#006A96' }}>
            UCSD BioBib Instructions (.docx) — Academic Personnel Services
          </a>
        </Typography>
        <Typography variant="body2" sx={{ mb: 0.75 }}>
          <a href="https://aps.ucsd.edu/tools/forms.html#appointment-for" style={{ color: '#006A96' }}>
            Academic Personnel Services — Forms &amp; Templates
          </a>
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Questions? Contact Academic Personnel Services at{' '}
          <a href="mailto:aps@ucsd.edu" style={{ color: '#006A96' }}>aps@ucsd.edu</a>.
        </Typography>
      </Box>
    </Container>
  );
}
