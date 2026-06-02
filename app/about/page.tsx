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

const PAGE_MAX_WIDTH = 1170;

const PIPELINE_STEPS = [
  {
    title: '1. You upload a Word CV',
    body: 'The app accepts a .docx CV, checks that the file is valid and under the size limit, and reads the text from the Word document. The original uploaded CV file is removed after the text has been read.',
  },
  {
    title: '2. The CV is split into smaller review tasks',
    body: 'Large faculty CVs can be too much to handle all at once, so the app divides the BioBib into 20 smaller parts. Different parts look for employment, education, service, grants, teaching, presentations, publications, abstracts, patents, and other BioBib sections.',
  },
  {
    title: '3. UCSD TritonAI reviews each part',
    body: 'The app sends each smaller part through UCSD TritonAI using model routing matched to the section type. Higher-fidelity sections use the cloud model first, while more mechanical sections can use an on-prem model with cloud fallback.',
  },
  {
    title: '4. Progress is tracked while the work runs',
    body: 'Each task saves its result as it finishes. The progress screen checks those saved results, shows which parts are still running, complete, or failed, and can resume a saved job after a refresh or accidental tab close.',
  },
  {
    title: '5. The app assembles the BioBib',
    body: 'After the smaller parts finish, the app combines the results, removes common duplicates, keeps many non-employment roles out of employment history, renumbers publication lists, and creates a new BioBib Word document.',
  },
  {
    title: '6. You download the draft',
    body: 'When processing is complete, the app shows a download button for the generated BioBib .docx. If a section could not be completed, the app can still return a partial draft with the completed sections and notes about what needs review.',
  },
];

const SLICE_GROUPS = [
  {
    label: 'Section I',
    items: [
      'Name, department, title, employment history, education, and areas of specialization.',
    ],
  },
  {
    label: 'Section II',
    items: [
      'University service, public service, memberships, awards, and honors.',
      'Teaching and student instructional activities, including advisees and postdocs when listed.',
      'Current and past contracts and grants.',
      'Professional activities, consulting, reviewer activity, and external reviews.',
      'Invited presentations, grouped by date range so long CVs can finish reliably.',
      'Diversity contributions, outreach, clinical activities, and other activities.',
    ],
  },
  {
    label: 'Section III',
    items: [
      'Peer-reviewed journal articles, grouped by date range.',
      'Review and invited articles, books, and book chapters.',
      'Refereed and other conference proceedings.',
      'Conference abstracts, grouped by date range.',
      'Popular works, additional research products, the faculty member\'s own thesis, patents, and work in progress.',
    ],
  },
];

const RELEASE_NOTES = [
  {
    releasedAt: 'June 2, 2026, 12:48 PM PDT',
    title: 'Recovery Navigation Update',
    changes: [
      'Changed saved conversion recovery so returning to the home page no longer automatically forces a previous job to resume.',
      'Added a visible recovery prompt with resume and dismiss actions for saved in-progress conversions.',
      'Kept explicit recovery links available for users who want to reopen a running conversion directly.',
    ],
  },
  {
    releasedAt: 'May 26, 2026, 9:34 PM PDT',
    title: 'Conversion Recovery Update',
    changes: [
      'Added saved conversion recovery so an active BioBib job can resume after a page refresh, accidental tab close, or copied recovery link.',
      'Added recovery links to the progress screen so users can return to a running conversion without losing access to the generated draft.',
      'Improved completed-result recovery so a finished BioBib remains reachable from the browser until the user starts over.',
    ],
  },
  {
    releasedAt: 'May 24, 2026, 8:18 PM PDT',
    title: 'Model Routing and Resilience Update',
    changes: [
      'Added section-aware model routing so review tasks can use cloud or on-prem UCSD TritonAI models based on the type of BioBib content being extracted.',
      'Added fallback handling across model providers so eligible sections can continue when a preferred model is temporarily unavailable or over budget.',
      'Improved on-prem fallback handling for longer BioBib sections by narrowing review context to the requested date window when appropriate.',
      'Improved resilience for on-prem review attempts with a retry path for transient empty or truncated responses.',
      'Updated the application description to reflect routed UCSD TritonAI review rather than a single fixed review model.',
    ],
  },
  {
    releasedAt: 'May 24, 2026, 5:18 PM PDT',
    title: 'BioBib Formatting and Bibliography Fidelity Update',
    changes: [
      'Updated generated Word documents to use Arial typography throughout the BioBib draft.',
      'Aligned major BioBib section labels, subsection labels, and Education columns more closely with UCSD BioBib formatting conventions while preserving semantic Word headings.',
      'Improved student instructional activity formatting with grouped subheaders and restarted numbering within each group.',
      'Cleaned source numbering from student instructional entries so generated lists use BioBib numbering only.',
      'Improved presentation formatting so national/international presentations and other invited presentations number independently within their own subsections.',
      'Enhanced bibliography organization with clearer Section III labels, always-present empty sections where expected, and better placement of likely submitted or in-progress work.',
      'Refined bibliography subheading styling so publication category labels are not italicized.',
      'Improved preservation of chemical and scientific notation from Word CVs by carrying source subscript and superscript formatting into generated bibliography entries when available.',
      'Improved final status handling so the app keeps waiting briefly if the generated result is still becoming available.',
    ],
  },
  {
    releasedAt: 'May 15, 2026, 12:09 PM PDT',
    title: 'BioBib Output Quality and Regression Guard Update',
    changes: [
      'Improved final Word output so internal extraction metadata stays out of user-facing bibliography entries.',
      'Added clearer review text in tables when source CV details are unavailable, reducing silent blank cells in generated documents.',
      'Improved invited-presentation section placement so conference and society meeting presentations are separated from institutional invited talks.',
      'Added regression checks for generated-document quality, including metadata leakage, duplicate publication labels, unavailable table values, and presentation section placement.',
    ],
  },
  {
    releasedAt: 'May 15, 2026, 11:39 AM PDT',
    title: 'Application Reliability and Accessible Output Update',
    changes: [
      'Moved BioBib section review to GPT 5.5 through UCSD TritonAI so long CVs have more room for structured extraction.',
      'Improved large-CV handling by splitting long publication, abstract, and presentation lists into smaller saved tasks with visible section progress.',
      'Added partial-result handling so completed sections can still be returned when an individual review task fails.',
      'Expanded final merge cleanup for duplicate reduction, publication renumbering, and better separation of employment history from fellowships, visiting titles, senate offices, and service roles.',
      'Enhanced generated Word documents with semantic title and heading styles, document metadata, an English language setting, and repeatable table header rows for better navigation and assistive technology support.',
      'Validated the production workflow end to end, including upload, section extraction, final status, download, DOCX validity, and generated-document accessibility markers.',
    ],
  },
];

const OUTPUT_RULES = [
  'Keeps citation text as close as possible to the way it appears in the CV.',
  'Uses routed UCSD TritonAI models for the section review work.',
  'Breaks long journal, abstract, and presentation lists into smaller date ranges so large CVs are more likely to finish.',
  'Avoids adding extra publication details unless the CV clearly provides them.',
  'Removes many duplicate entries after the sections are combined.',
  'Tries to keep fellowships, visiting titles, senate offices, and service roles out of Section I employment when they are not true employment history.',
  'Creates a Word document with BioBib-style Section I tables, Section II subsections, grant tables, and Section III bibliography subsections.',
  'Creates a list of items that may need manual review or confirmation.',
];

const CURRENT_LIMITATIONS = [
  'The app can only use information it can read from the uploaded CV. It cannot reliably recreate details that are missing from the CV, such as exact month-level dates, professor step history, or entries that only appear in an older BioBib.',
  'The generated BioBib is a draft. Faculty or department staff should review section placement, dates, new-since-last-review markers, and any gap warnings before submission.',
  'The original uploaded CV file is removed after the app reads it. Some temporary working files are kept so the progress page and download button can work. They are not cleaned up automatically yet.',
  'If one part fails after other parts succeed, the app can still return a partial BioBib using the completed sections instead of losing the whole conversion.',
];

const FAQ_ITEMS = [
  {
    q: 'What file formats are accepted?',
    a: 'Only .docx files are accepted. The app reads the Word document and converts it to text before filling out the BioBib draft.',
  },
  {
    q: 'Why does conversion take a few minutes?',
    a: 'The app breaks the CV into 20 smaller BioBib parts and reviews several parts at the same time through UCSD TritonAI. This helps large CVs finish more reliably, especially when there are many publications or presentations.',
  },
  {
    q: 'What AI model does it use?',
    a: 'The current version uses routed UCSD TritonAI review. Higher-fidelity sections use the cloud model first, while eligible mechanical extraction sections can use an on-prem model with cloud fallback.',
  },
  {
    q: 'What does the app fill in?',
    a: 'It drafts employment, education, university service, memberships, awards, teaching and student activity, grants, professional activity, presentations, publications, abstracts, patents, and related BioBib sections when those details are available in the CV.',
  },
  {
    q: 'What happens if one section fails?',
    a: 'If most of the work completes but one section fails, the app can still create a partial draft. The result will show that some content needs review instead of discarding all completed work.',
  },
  {
    q: 'What happens if I refresh or close the page?',
    a: 'After a conversion job starts, the app saves a recovery link in the browser and address bar. Reopening that link resumes progress or returns to the finished draft when the job is complete. Returning to the home page without the recovery link shows a resume-or-dismiss prompt instead of forcing the old job to reopen.',
  },
  {
    q: 'Does the app preserve the uploaded CV?',
    a: 'The original uploaded CV file is removed after the app reads it. Some temporary working files are kept for progress tracking and download, including the text read from the CV, the section results, status information, and the generated BioBib.',
  },
  {
    q: 'Does this replace academic personnel review?',
    a: 'No. It generates a draft BioBib and gap list. Final review, correction, and submission still follow normal department, division, and Academic Personnel processes.',
  },
];

export default function AboutPage() {
  return (
    <Container maxWidth={false} sx={{ maxWidth: PAGE_MAX_WIDTH, py: 6 }}>
      <Box sx={{ mb: 5 }}>
        <Typography variant="h4" fontWeight={700} sx={{ color: '#182B49' }} gutterBottom>
          Turn a faculty CV into a BioBib
        </Typography>
        <Typography variant="body1" color="text.secondary">
          The BioBib Formatter turns a faculty CV in Word format into a draft UCSD Academic
          Biography and Bibliography document. It breaks the CV into smaller pieces, reviews
          those pieces with UCSD TritonAI, combines the results, and creates a
          downloadable Word file.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
          <Chip label="Word CV input" size="small" />
          <Chip label="20 review parts" size="small" color="primary" />
          <Chip label="TritonAI review" size="small" />
          <Chip label="Progress tracking" size="small" />
          <Chip label="Word BioBib output" size="small" color="success" />
        </Box>
      </Box>

      <Divider sx={{ mb: 5 }} />

      <Box sx={{ mb: 5 }}>
        <Typography variant="h5" fontWeight={600} sx={{ color: '#182B49', mb: 3 }}>
          Release Notes
        </Typography>
        {RELEASE_NOTES.map((release) => (
          <Box key={release.releasedAt} sx={{ mb: 3, pl: 2, borderLeft: '3px solid #C69214' }}>
            <Typography variant="body1" fontWeight={700} sx={{ mb: 0.5 }}>
              {release.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Released {release.releasedAt}
            </Typography>
            <Box component="ul" sx={{ pl: 3, mt: 1.25, mb: 0 }}>
              {release.changes.map((change) => (
                <Box component="li" key={change} sx={{ mb: 0.75 }}>
                  <Typography variant="body2" color="text.secondary">
                    {change}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>

      <Divider sx={{ mb: 5 }} />

      <Box sx={{ mb: 5 }}>
        <Typography variant="h5" fontWeight={600} sx={{ color: '#182B49', mb: 3 }}>
          What Happens During Conversion
        </Typography>
        {PIPELINE_STEPS.map((step) => (
          <Box key={step.title} sx={{ mb: 2.5, pl: 2, borderLeft: '3px solid #00629B' }}>
            <Typography variant="body1" fontWeight={700} sx={{ mb: 0.5 }}>
              {step.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {step.body}
            </Typography>
          </Box>
        ))}
      </Box>

      <Divider sx={{ mb: 5 }} />

      <Box sx={{ mb: 5 }}>
        <Typography variant="h5" fontWeight={600} sx={{ color: '#182B49', mb: 3 }}>
          What the App Looks For
        </Typography>
        {SLICE_GROUPS.map((group) => (
          <Box key={group.label} sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.25 }}>
              <ArticleIcon sx={{ color: '#00629B' }} />
              <Typography variant="h6" fontWeight={600} sx={{ color: '#182B49' }}>
                {group.label}
              </Typography>
            </Box>
            <Box component="ul" sx={{ pl: 3, mt: 0, mb: 0 }}>
              {group.items.map((item) => (
                <Box component="li" key={item} sx={{ mb: 0.75 }}>
                  <Typography variant="body2">{item}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>

      <Divider sx={{ mb: 5 }} />

      <Box sx={{ mb: 5 }}>
        <Typography variant="h5" fontWeight={600} sx={{ color: '#182B49', mb: 2 }}>
          What the Draft Does
        </Typography>
        <Box component="ul" sx={{ pl: 3, mt: 0 }}>
          {OUTPUT_RULES.map((rule) => (
            <Box component="li" key={rule} sx={{ mb: 0.75 }}>
              <Typography variant="body2">{rule}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Divider sx={{ mb: 5 }} />

      <Box sx={{ mb: 5 }}>
        <Typography variant="h5" fontWeight={600} sx={{ color: '#182B49', mb: 2 }}>
          What Still Needs Review
        </Typography>
        <Box component="ul" sx={{ pl: 3, mt: 0 }}>
          {CURRENT_LIMITATIONS.map((item) => (
            <Box component="li" key={item} sx={{ mb: 0.75 }}>
              <Typography variant="body2" color="text.secondary">{item}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Divider sx={{ mb: 5 }} />

      <Box sx={{ mb: 5 }}>
        <Typography variant="h5" fontWeight={600} sx={{ color: '#182B49', mb: 3 }}>
          Frequently Asked Questions
        </Typography>
        {FAQ_ITEMS.map((item) => (
          <Accordion
            key={item.q}
            disableGutters
            elevation={0}
            sx={{ border: '1px solid #e0e0e0', mb: 1, '&:before': { display: 'none' } }}
          >
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
      </Box>
    </Container>
  );
}
