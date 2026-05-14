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

const PIPELINE_STEPS = [
  {
    title: '1. Upload and parse',
    body: 'The browser uploads a .docx CV directly to managed object storage, then POSTs the file URL to /api/upload. The server validates the file, reads it through the authenticated storage SDK, parses the Word document into text, writes cv.txt and manifest.json under jobs/<jobId>/, deletes the original uploaded source file, and returns HTTP 202 with a jobId.',
  },
  {
    title: '2. Parallel AI extraction',
    body: 'The upload route dispatches 20 independent slice workers. Each worker reads the same parsed CV text and asks LiteLLM for only one bounded BioBib subset, returning strict JSON. This keeps large CVs inside serverless function limits and avoids one giant model response.',
  },
  {
    title: '3. Blob-backed job state',
    body: 'Each slice writes either slice-<key>.json or slice-<key>.error under the job prefix. The status route derives progress from those append-only artifacts instead of mutating a central record.',
  },
  {
    title: '4. Finalize and generate DOCX',
    body: 'When all slices are terminal, /api/finalize acquires a Blob-backed lock, merges successful slices, deduplicates common repeated arrays, filters known nonemployment appointment artifacts, renumbers publication categories, writes result.json and biobib.docx, then records complete, failed_partial, or failed status.',
  },
  {
    title: '5. Poll and download',
    body: 'The client polls /api/status/<jobId> every few seconds. When the job completes, /api/download/<jobId> streams the generated BioBib .docx back from managed object storage.',
  },
];

const SLICE_GROUPS = [
  {
    label: 'Section I',
    items: [
      'meta_and_I: name, department, title, employment, education, specialization',
    ],
  },
  {
    label: 'Section II',
    items: [
      'II_service: university service, public service, memberships, awards',
      'II_teaching: teaching and student instructional activities',
      'II_grants: current and past contracts/grants',
      'II_external: professional activities, consulting, reviewer activity, external reviews',
      'II_presentations_pre_2000 / 2000_2010 / 2011_2020 / post_2020: date-bounded invited presentations',
      'II_diversity_other: diversity contributions, outreach, clinical activities, other activities',
    ],
  },
  {
    label: 'Section III',
    items: [
      'III_journals_pre_2000 / 2000_2010 / late: date-bounded peer-reviewed journal articles',
      'III_other_a: review/invited articles, books, book chapters',
      'III_other_proc: refereed and other conference proceedings',
      'III_abstracts_pre_2000 / 2000_2010 / 2011_2020 / post_2020: date-bounded abstracts',
      'III_popular_products: popular works, additional products, the faculty member\'s own thesis, patents, work in progress',
    ],
  },
];

const OUTPUT_RULES = [
  'Preserves citation text from the CV instead of reformatting citations.',
  'Splits large journal, abstract, and presentation lists by year range to reduce model truncation.',
  'Keeps optional publication metadata sparse unless the CV explicitly provides it.',
  'Deduplicates merged Section II arrays and grants after all slices finish.',
  'Filters obvious nonemployment appointment artifacts from Section I employment, such as fellowships, visiting titles, senate offices, and committee/chair service roles.',
  'Renders a UCSD BioBib-style Word document with Section I tables, Section II subsection headings, contracts/grants tables, Section III bibliography subsections, theses, patents, and work-in-progress handling.',
  'Produces a gap list for fields the workers identify as missing or needing confirmation.',
];

const CURRENT_LIMITATIONS = [
  'The system can only extract facts present in the uploaded CV text. It does not reliably reconstruct missing month-level dates, professor step history, or legacy BioBib-only entries when those details are absent from the CV.',
  'The generated BioBib is a draft. Faculty or department staff should review classifications, dates, new-since-last-review markers, and any gap warnings before submission.',
  'The source upload file is deleted after parsing, but job artifacts needed for polling and download are written to managed object storage under jobs/<jobId>/. The current codebase does not implement automatic job cleanup.',
  'If one or more workers fail or time out after other slices succeed, the app can finalize a failed_partial BioBib using the completed sections rather than losing all work.',
];

const FAQ_ITEMS = [
  {
    q: 'What file formats are accepted?',
    a: 'Only .docx files are accepted. The parser reads the Word document and converts it to plain text before any AI extraction runs.',
  },
  {
    q: 'How many AI workers run?',
    a: 'The current pipeline runs 20 slice workers. They cover Section I, six Section II extraction groups, and thirteen Section III bibliography/product groups.',
  },
  {
    q: 'Why is the pipeline split into so many slices?',
    a: 'Large faculty CVs can produce very large bibliography and presentation outputs. Smaller bounded workers reduce model truncation, fit serverless function limits, and allow the app to keep useful completed sections if one worker fails.',
  },
  {
    q: 'What happens if a worker fails?',
    a: 'The failed worker writes a slice error. If at least one slice completed, finalize can still produce a partial BioBib and mark the job failed_partial. If all slices fail or finalize fails, the job is marked failed.',
  },
  {
    q: 'Does the app preserve the uploaded CV?',
    a: 'The uploaded source blob is deleted after the server parses it into text. The parsed text, slice JSON, final result JSON, status JSON, and generated BioBib are stored under the job prefix so polling and download can work.',
  },
  {
    q: 'Does this replace academic personnel review?',
    a: 'No. It generates a draft BioBib and gap list. Final review, correction, and submission still follow normal department, division, and Academic Personnel processes.',
  },
];

export default function AboutPage() {
  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Box sx={{ mb: 5 }}>
        <Typography variant="h4" fontWeight={700} sx={{ color: '#182B49' }} gutterBottom>
          About the BioBib Formatter
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 760 }}>
          The BioBib Formatter converts a faculty CV in Word format into a draft UCSD Academic
          Biography and Bibliography document. The current codebase uses an asynchronous,
          storage-backed, 20-worker AI pipeline so large CVs can complete within serverless
          limits and still produce a usable document if isolated sections need manual correction.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
          <Chip label=".docx input only" size="small" />
          <Chip label="20 extraction slices" size="small" color="primary" />
          <Chip label="Storage-backed job state" size="small" />
          <Chip label="DOCX output" size="small" color="success" />
        </Box>
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
          Extraction Slices
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
          Current Output Behavior
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
          Known Boundaries
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
