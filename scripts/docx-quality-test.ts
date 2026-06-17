import JSZip from 'jszip';
import { generateBioBibDocx } from '../lib/docx/writer';
import { LITELLM_MODEL, LITELLM_ON_PREM_MODEL } from '../lib/constants';
import { mergeSlices, modelCandidatesForSlice, PartialResult } from '../lib/pipeline/converter';
import { ConversionResult, PublicationEntry } from '../lib/types';

interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

const checks: Check[] = [];

function record(name: string, pass: boolean, detail?: string) {
  checks.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const highFidelityRoute = modelCandidatesForSlice('III_journals_late', { cloud: true, onPrem: true });
  const mechanicalRoute = modelCandidatesForSlice('II_presentations_post_2020', { cloud: true, onPrem: true });
  const onPremOnlyRoute = modelCandidatesForSlice('meta_and_I', { cloud: false, onPrem: true });

  record(
    'High-fidelity bibliography slices prefer cloud with on-prem fallback',
    highFidelityRoute[0]?.provider === 'cloud' &&
      highFidelityRoute[0]?.model === LITELLM_MODEL &&
      highFidelityRoute[1]?.provider === 'onPrem' &&
      highFidelityRoute[1]?.model === LITELLM_ON_PREM_MODEL,
  );
  record(
    'Mechanical extraction slices prefer on-prem with cloud fallback',
    mechanicalRoute[0]?.provider === 'onPrem' &&
      mechanicalRoute[0]?.model === LITELLM_ON_PREM_MODEL &&
      mechanicalRoute[1]?.provider === 'cloud',
  );
  record(
    'On-prem fallback route has larger completion budget than cloud route',
    (mechanicalRoute[0]?.maxTokens ?? 0) > (mechanicalRoute[1]?.maxTokens ?? 0),
  );
  record(
    'Model routing omits unavailable providers',
    onPremOnlyRoute.length === 1 && onPremOnlyRoute[0]?.provider === 'onPrem',
  );

  const merged = mergeSlices([buildPartialResult()]);

  record(
    'Conference-style invited presentation is moved to national/international presentations',
    merged.sections.presentations.some(item => item.includes('Gordon Research Conference')),
  );
  record(
    'Institutional seminar remains in other invited presentations',
    merged.sections.invitedPresentations.some(item => item.includes('Department of Chemistry Seminar')),
  );
  record(
    'Structural gaps are added for reviewable blank table fields',
    merged.gaps.some(g => g.field === 'Employment location') &&
      merged.gaps.some(g => g.field === 'Attendance dates') &&
      merged.gaps.some(g => g.field === 'School location') &&
      merged.gaps.some(g => g.field === 'Role and co-PI/share'),
  );

  record(
    'Likely submitted or in-review primary work moves to Work in Progress',
    merged.sections.workInProgress.some(item => /under review/i.test(item.citation)) &&
      !merged.sections.peerReviewedJournals.some(item => /under review/i.test(item.citation)),
  );

  record(
    'Honorific appointment-like entries are retained as honors and awards',
    merged.sections.awards.some(item => item.includes('Visiting Scientist') && item.includes('Sandia')),
  );
  record(
    'Potential duplicate Section II placements are flagged for review',
    (merged.reviewNotes ?? []).some(note =>
      note.topic === 'Potential duplicate placement' &&
      note.instruction.includes('Opponent for Ph.D. Defense'),
    ),
  );
  record(
    'Other Publications are reclassified into proceedings and popular works when patterns are clear',
    merged.sections.refereedProceedings.some(item => item.citation.includes('Proceedings, Example Conference')) &&
      merged.sections.popularWorks.some(item => item.citation.includes('Review of Advances in Chemical Physics')) &&
      !merged.sections.otherArticles.some(item => item.citation.includes('Proceedings, Example Conference')) &&
      !merged.sections.otherProceedings.some(item => item.citation.includes('Proceedings, Example Conference')),
  );
  record(
    'Dated Section II records are sorted oldest first by initial date',
    orderedText(merged.sections.awards.join('\n'), [
      'Phi Beta Kappa',
      'David and Lucile Packard Fellow in Science and Engineering',
      'Camille Dreyfus Teacher-Scholar',
    ]) &&
      orderedText(merged.sections.memberships.join('\n'), [
        'Sigma Xi research grant',
        'Fellow of the Royal Entomological Society',
        'Elected President, North American Section',
      ]) &&
      orderedText(merged.sections.professionalActivities.join('\n'), [
        'Opponent for Ph.D. Defense',
        'Panelist and grant reviewer for the Foundation for Food and Agriculture Research',
        'Service on a National Science Foundation Integrative Organismal Systems',
      ]),
  );
  record(
    'Date-first Section II strings move dates to the end',
    merged.sections.invitedPresentations.some(item =>
      item === 'Nieh JC. Invited talk. The role of pheromones in the food location communication system of Melipona panamica. Seminar. University of Utrecht, Netherlands (May 20, 1995)',
    ) &&
      merged.sections.presentations.some(item =>
        item === 'Nieh JC. Invited talk. The emergent properties of superorganism signaling: inhibitory signals shape honey bee foraging in a changing and dangerous world. Seminar. Xishuangbanna Tropical Botanical Garden, Chinese Academy of Science, Xishuangbanna, China. (Sept 23, 2014)',
      ),
  );
  record(
    'Grant rows are sorted by sparse initial period dates',
    orderedText(merged.sections.grants.map(grant => `${grant.title} ${grant.period}`).join('\n'), [
      'Doctoral Dissertation Improvement Grant 2005',
      'NAPPC Honey Bee Health Grant 2010-2012',
      'Dynamics and Energetics 2024-2027',
    ]),
  );
  record(
    'Abstracts drop source ordering placeholders and sort chronologically',
    orderedText(merged.sections.abstracts.map(item => item.citation).join('\n'), [
      'Nieh J (1996) A stingless bee',
      'Nieh J (1998) Multiple communication channels',
      'Eiri D and Nieh JC (2010)',
    ]) &&
      merged.sections.abstracts.every(item => !/^\(\d+\)|^\d+[.)]/.test(item.citation)),
  );

  const buffer = await generateBioBibDocx(buildConversionResult(merged), buildRichTextParagraphs());
  const parts = await docxParts(buffer);
  const xml = parts.documentXml;
  const text = docxXmlToText(xml);
  const allXml = [parts.documentXml, ...parts.footerXml].join('\n');

  record('DOCX does not expose source-number metadata', !/\bsource\s+no\.?\b/i.test(text));
  record('DOCX does not expose BioBib section metadata', !/\bBioBib section:/i.test(text));
  record('DOCX does not expose review-material metadata', !/\breview material:/i.test(text));
  record('DOCX does not render duplicate article labels', !/\bARTICLE\s+ARTICLE\b/i.test(text));
  record('DOCX replaces blank table cells with explicit review text', (text.match(/Not listed/g) ?? []).length >= 5);
  record('DOCX removes contribution notes already present in the citation', countOccurrences(text, 'Featured in Virtual Journal') === 1);
  record('DOCX declares Arial run fonts', /w:rFonts\b[^>]*w:ascii="Arial"/.test(xml));
  record(
    'Requested Section I and II headings are underlined semantic headings',
    paragraphHasStyleAndUnderline(xml, 'Section I: Employment History and Education', 'Heading1') &&
      paragraphHasStyleAndUnderline(xml, 'Section II: Professional Data', 'Heading1') &&
      paragraphHasStyleAndUnderline(xml, '(a) University Service', 'Heading2'),
  );
  record(
    'Education table headers use requested order',
    orderedText(text, [
      'Dates of attendance',
      'School, college, university, or hospital',
      'Location',
      'Major subject or field',
      'Degrees or certificates',
      'Date received',
    ]),
  );
  record(
    'Presentation subsections restart numbering at 1',
    /Presentations at National and International Meetings\s+1\.\s+Nieh JC\. Invited talk[\s\S]*2\.\s+Gordon Research Conference[\s\S]*Other Invited Presentations\s+1\.\s+Nieh JC\. Invited talk[\s\S]*2\.\s+Example H2O\+ presentation[\s\S]*3\.\s+Department of Chemistry Seminar/.test(text),
  );
  record(
    'Student instructional activities render grouped numbered lists without repeated group labels',
    /Former Ph\.D\. Students\s+1\.\s+Alice Example[\s\S]*2\.\s+Brian Example/.test(text) &&
      countOccurrences(text, 'Former Ph.D. Students') === 1 &&
      !/\b1\.\s+1\.\s+Alice Example/.test(text),
  );
  record(
    'Section III headings match requested labels',
    text.includes('Section III – Bibliography') &&
      text.includes('A. Primary Published Work or Creative Work:') &&
      text.includes('I. Refereed Journal Articles') &&
      text.includes('II. Review and Invited Articles') &&
      text.includes('III. Books and Book Chapters') &&
      text.includes('IV. Refereed Conference Proceedings') &&
      text.includes('V. Other Articles') &&
      text.includes('B. Other Work') &&
      text.includes('II. Abstracts') &&
      !text.includes('II. Abstracts of Non-Refereed Conference Proceedings'),
  );
  record(
    'Section III bibliography subheaders are not italicized',
    paragraphHasStyleWithoutItalics(xml, 'I. Refereed Journal Articles', 'Heading3') &&
      paragraphHasStyleWithoutItalics(xml, 'II. Review and Invited Articles', 'Heading3'),
  );
  record(
    'Other Articles and Work in Progress sections are present when empty or sparse',
    text.includes('V. Other Articles') && text.includes('C. Work in Progress'),
  );
  record(
    'Bibliography preserves representative subscript and superscript runs',
    /w:vertAlign w:val="subscript"/.test(xml) && /w:vertAlign w:val="superscript"/.test(xml),
  );
  record(
    'Section II presentations preserve representative subscript and superscript runs',
    paragraphXmlContaining(xml, 'Example H2O+ presentation')?.includes('w:vertAlign w:val="subscript"') === true &&
      paragraphXmlContaining(xml, 'Example H2O+ presentation')?.includes('w:vertAlign w:val="superscript"') === true,
  );
  record(
    'DOCX includes centered footer page number field',
    parts.footerXml.length > 0 && /<w:instrText[^>]*>PAGE<\/w:instrText>|<w:fldChar/.test(allXml),
  );
  record(
    'DOCX includes final document link and signature placeholders',
    text.includes('Document link:') && text.includes('Signature:') && text.includes('Date:'),
  );
  record(
    'DOCX appends a review summary listing manual completion items',
    text.includes('Conversion Review Summary') &&
      text.includes('Manual Completion Items') &&
      text.includes('delete this page before submitting') &&
      ((merged.reviewNotes?.length ?? 0) === 0 || text.includes('Placement and Duplication Review Notes')),
  );
  record('Review period line absent for all-years documents', !text.includes('Review period (Section II activities):'));
  record(
    'DOCX records optional review-period date and renders divider marker',
    text.includes('New since last review date: 2020-01-01') &&
      text.includes('New since last review') &&
      /New since last review[\s\S]*\*1\.\s+A\. Scholar/.test(text),
  );

  const periodBuffer = await generateBioBibDocx(buildConversionResult(merged), buildRichTextParagraphs(), { sinceYear: 2020 });
  const periodText = docxXmlToText((await docxParts(periodBuffer)).documentXml);
  record(
    'Review period line rendered when sinceYear is set',
    periodText.includes('Review period (Section II activities):') && periodText.includes('2020 – present'),
  );

  const failed = checks.filter(check => !check.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length) process.exit(1);
}

function buildPartialResult(): PartialResult {
  return {
    metadata: {
      name: 'Test, Faculty',
      department: 'Department of Chemistry and Biochemistry',
      title: 'Professor',
      processedAt: new Date().toISOString(),
    },
    sections: {
      employment: [
        {
          from: '1999',
          to: 'present',
          institution: 'University of California San Diego',
          location: '',
          rank: 'Professor',
        },
        {
          from: '2000',
          to: '2000',
          institution: 'Combustion Research Facility, Sandia Natl Laboratory',
          location: 'Livermore, CA',
          rank: 'Visiting Scientist',
        },
      ],
      education: [
        {
          school: 'University of California, Berkeley',
          datesFrom: '',
          datesTo: '',
          location: '',
          major: 'Physical Chemistry',
          degree: 'Ph.D.',
          dateReceived: '1989',
        },
      ],
      universityService: [
        {
          description: '2024-2025 Reviewed grants for the UC San Diego Strategic Plan Refresh Convene and Influence Award.',
          dates: '',
          category: 'departmental',
        },
        {
          description: '2018 Panelist and grant reviewer for the UC MEXUS-CONACYT postdoctoral fellowship and collaborative grant competition.',
          dates: '',
          category: 'departmental',
        },
      ],
      memberships: [
        '2023 Elected President, North American Section of the International Union for the Study of Social Insects.',
        '2017 Elected Fellow of the Royal Entomological Society, United Kingdom.',
        '1993 Sigma Xi research grant, Cornell University, New York, USA.',
      ],
      awards: [
        'Camille Dreyfus Teacher-Scholar 1996-2001',
        'David and Lucile Packard Fellow in Science and Engineering 1994-1999',
        'Phi Beta Kappa 1989',
      ],
      grants: [
        {
          title: 'NAPPC Honey Bee Health Grant',
          funder: 'North American Pollinator Protection Campaign',
          amount: '',
          totalAward: '',
          period: '2010-2012',
          status: 'past',
          role: 'PI',
          coPIsShare: '',
        },
        {
          title: 'Dynamics and Energetics',
          funder: 'National Science Foundation',
          amount: '',
          totalAward: '',
          period: '2024-2027',
          status: 'current',
          role: '',
          coPIsShare: '',
        },
        {
          title: 'Doctoral Dissertation Improvement Grant',
          funder: 'National Science Foundation',
          amount: '',
          totalAward: '',
          period: '2005',
          status: 'past',
          role: 'PI',
          coPIsShare: '',
        },
      ],
      presentations: [],
      invitedPresentations: [
        '71. Sept 23, 2014 Nieh JC. Invited talk. The emergent properties of superorganism signaling: inhibitory signals shape honey bee foraging in a changing and dangerous world. Seminar. Xishuangbanna Tropical Botanical Garden, Chinese Academy of Science, Xishuangbanna, China.',
        '1. May 20, 1995 Nieh JC. Invited talk. The role of pheromones in the food location communication system of Melipona panamica. Seminar. University of Utrecht, Netherlands',
        'Gordon Research Conference on Molecular Beams, 2024.',
        'Example H2O+ presentation, Department of Chemistry Seminar, 2025.',
        'Department of Chemistry Seminar, Example University, 2025.',
      ],
      professionalActivities: [
        '2025 Service on a National Science Foundation Integrative Organismal Systems (IOS) Grant review panel.',
        'Opponent for Ph.D. Defense of Karoline Wiesner, Department of Physics, University of Uppsala, Uppsala, Sweden January 24, 2004',
        '2017 Panelist and grant reviewer for the Foundation for Food and Agriculture Research (FFAR) for the Pollinator Health Special Initiative.',
      ],
      diversityContributions: [
        '2023 Chair of the search committee for the School of Biological Sciences Director of Diversity Initiatives staff position.',
        '2008-2014 School of Biological Sciences Diversity Committee member.',
      ],
      studentInstructionalGroups: [
        {
          heading: 'Former Ph.D. Students',
          entries: [
            '2. Former Ph.D. Students: Brian Example, B.S. 2016; Ph.D. 2021.',
            '1. Alice Example, B.S. 2014; Ph.D. 2019.',
          ],
        },
        {
          heading: 'Ph.D. Thesis Committees - Member',
          entries: [
            'Opponent for Ph.D. Defense of Karoline Wiesner, Department of Physics, University of Uppsala, Uppsala, Sweden January 24, 2004',
          ],
        },
      ],
      peerReviewedJournals: [
        publication({
          citation: 'A. Scholar, "Example result," Journal 1, 1-2 (2025). Featured in Virtual Journal.',
          articleKind: 'COVER ARTICLE' as PublicationEntry['articleKind'],
          contributionNote: 'Featured in Virtual Journal.',
          originalNumber: '123',
          bioBibSection: 'A.I.a',
          reviewMaterialUrl: 'https://example.invalid/review',
        }),
        publication({
          citation: 'B. Chemist, "Vibrationally excited H2O+ dynamics," Journal of Chemical Physics 10, 11-12 (2026).',
          type: 'journal',
        }),
        publication({
          citation: 'C. Research, "Submitted discovery," Journal of Chemical Physics, under review.',
          type: 'journal',
        }),
      ],
      otherArticles: [
        publication({
          citation: 'R.E. Continetti, Example article, Proceedings, Example Conference, pp. 1-2 (2002).',
          type: 'other',
        }),
        publication({
          citation: 'R.E. Continetti, Review of Advances in Chemical Physics, Vol. 128, Ed. S.A. Rice, John Wiley, in J. Am. Chem. Soc. 126, 7728-7729 (2004).',
          type: 'other',
        }),
      ],
      otherProceedings: [
        publication({
          citation: 'R.E. Continetti, Example article, Proceedings, Example Conference, pp. 1-2 (2002).',
          type: 'proceedings',
        }),
      ],
      abstracts: [
        publication({
          citation: '(21) Eiri D and Nieh JC (2010) Picky eater syndrome: the pesticide imidacloprid alters honey bee (Apis mellifera) sucrose response threshold and potentially, colony health. Entomological Society of America, San Diego, California, USA.',
          type: 'abstract',
        }),
        publication({
          citation: 'Nieh J (1998) Multiple communication channels: examples from two eusocial bees. Fifth International Congress of Neuroethology Abstracts.',
          type: 'abstract',
        }),
        publication({
          citation: '(20) Eiri D and Nieh JC (2010) Picky eaters and poor navigators: the pesticide imidacloprid alters honey bee (Apis mellifera) sucrose response thresholds and search distance estimation. 10th Annual North American Pollinator Protection Campaign Conference, Washington D.C., USA.',
          type: 'abstract',
        }),
        publication({
          citation: 'Nieh J (1996) A stingless bee, Melipona panamica, may use sounds to communicate the location of a food source. 10th International Insect Sound and Vibration Meeting Abstracts. Woods Hole, Massachusetts.',
          type: 'abstract',
        }),
      ],
    },
    gaps: [],
  };
}

function publication(overrides: Partial<PublicationEntry>): PublicationEntry {
  return {
    number: 1,
    citation: '',
    type: 'journal',
    ...overrides,
  } as PublicationEntry;
}

function buildConversionResult(merged: ConversionResult): ConversionResult {
  return {
    ...merged,
    metadata: {
      ...merged.metadata,
      reviewPeriodStart: '2020-01-01',
    },
    sections: {
      ...merged.sections,
      specialization: 'Chemical dynamics.',
    },
  };
}

function buildRichTextParagraphs() {
  return [
    {
      text: 'B. Chemist, "Vibrationally excited H2O+ dynamics," Journal of Chemical Physics 10, 11-12 (2026).',
      runs: [
        { text: '2. B. Chemist, "Vibrationally excited H' },
        { text: '2', verticalAlign: 'subscript' as const },
        { text: 'O' },
        { text: '+', verticalAlign: 'superscript' as const },
        { text: ' dynamics," Journal of Chemical Physics 10, 11-12 (2026).' },
      ],
    },
    {
      text: 'Example H2O+ presentation, Department of Chemistry Seminar, 2025.',
      runs: [
        { text: 'Example H' },
        { text: '2', verticalAlign: 'subscript' as const },
        { text: 'O' },
        { text: '+', verticalAlign: 'superscript' as const },
        { text: ' presentation, Department of Chemistry Seminar, 2025.' },
      ],
    },
  ];
}

async function docxParts(buffer: Buffer): Promise<{ documentXml: string; footerXml: string[] }> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) throw new Error('word/document.xml missing from generated DOCX');
  const footerXml = await Promise.all(
    Object.keys(zip.files)
      .filter(name => /^word\/footer\d+\.xml$/.test(name))
      .map(async name => zip.file(name)?.async('string') ?? ''),
  );
  return { documentXml, footerXml };
}

function docxXmlToText(documentXml: string): string {
  return documentXml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+\n/g, '\n')
    .trim();
}

function paragraphHasStyleAndUnderline(xml: string, text: string, style: string): boolean {
  const paragraph = paragraphXmlContaining(xml, text);
  return !!paragraph && paragraph.includes(`w:pStyle w:val="${style}"`) && paragraph.includes('w:u w:val="single"');
}

function paragraphHasStyleWithoutItalics(xml: string, text: string, style: string): boolean {
  const paragraph = paragraphXmlContaining(xml, text);
  return !!paragraph && paragraph.includes(`w:pStyle w:val="${style}"`) && !paragraph.includes('<w:i/>');
}

function paragraphXmlContaining(xml: string, text: string): string | undefined {
  return (xml.match(/<w:p[\s\S]*?<\/w:p>/g) ?? []).find(paragraph =>
    docxXmlToText(paragraph).includes(text),
  );
}

function orderedText(text: string, parts: string[]): boolean {
  let cursor = -1;
  for (const part of parts) {
    const next = text.indexOf(part, cursor + 1);
    if (next === -1) return false;
    cursor = next;
  }
  return true;
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
