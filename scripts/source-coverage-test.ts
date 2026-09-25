import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sourceRecords, recordsForSlice, batchSourceRecords, isBibliographyRecord } from '../lib/pipeline/source-records';
import { validateCoveredResult, CoverageError, combineCoveredParts } from '../lib/pipeline/coverage';
import { sourceIdentifierChecks } from './source-acceptance';
import { mergeSlices, callSliceWithSignal } from '../lib/pipeline/converter';

const text = 'Peer-reviewed Methods Papers\n\n1. Example A (2024). An important protocol. PMID 12345678\n\nFeatured in a journal highlight.\n\n2. Example B (2023). Another method. DOI: 10.1234/example.\n\nInvited Lectures at Institutions\n\nExample talk, May 20, 1995.';
const records = sourceRecords(text);
const citations = records.filter(isBibliographyRecord);
function response(ids: string[], field = 'peerReviewedJournals') {
  return { sections: { [field]: ids.map(() => ({ citation: 'Model rewrote this', type: 'journal' })) },
    sources: { [field]: ids.map(id => [id]) }, excluded: [] };
}

test('complete citation and trailing annotation survive year-based selection', () => {
  assert.equal(citations.length, 2);
  assert.match(citations[0].text, /Featured in a journal highlight/);
  const selected = recordsForSlice(text, 'III_journals_late');
  assert(selected.some(record => record.id === citations[0].id));
  assert(!selected.some(record => record.text.includes('Example talk')));
  assert.deepEqual(sourceRecords(text), records);
});

test('batch boundaries respect records and input bounds without clipping', () => {
  const batches = batchSourceRecords(citations, 1, 300);
  assert.deepEqual(batches.flat(), citations);
  assert.equal(batches.length, 2);
  assert.throws(() => batchSourceRecords([{ ...citations[0], text: 'x'.repeat(64001) }]), /safe extraction size/);
});

test('code reconstructs original citation and provenance instead of model paraphrase', () => {
  const result = validateCoveredResult(response(citations.map(record => record.id)), citations, ['peerReviewedJournals']);
  assert.match(result.sections.peerReviewedJournals![0].citation, /PMID 12345678 Featured in/);
  assert(!JSON.stringify(result.sections).includes('Model rewrote'));
  assert.deepEqual(result.sections.peerReviewedJournals![0].sourceIds, [citations[0].id]);
});

test('missing dispositions retain validated work for targeted repair', () => {
  try {
    validateCoveredResult(response([citations[0].id]), citations, ['peerReviewedJournals']);
    assert.fail('Expected coverage failure');
  } catch (error) {
    assert(error instanceof CoverageError);
    assert.deepEqual(error.unresolvedIds, [citations[1].id]);
    assert.equal(error.partial!.sections.peerReviewedJournals!.length, 1);
  }
});

test('unknown IDs and contradictory exclusions fail closed', () => {
  assert.throws(() => validateCoveredResult(response(['invented']), citations, ['peerReviewedJournals']), /Unknown/);
  const raw = { ...response([citations[0].id]), excluded: [{ id: citations[0].id, reason: 'Skipped' }] };
  assert.throws(() => validateCoveredResult(raw, citations, ['peerReviewedJournals']), /contradictory/);
});

test('malformed records cannot disappear during sanitization', () => {
  assert.throws(() => validateCoveredResult({ sections: { awards: [null] }, sources: { awards: [[citations[0].id]] }, excluded: [] }, [citations[0]], ['awards']), /discarded/);
});

test('merge refuses silent bibliography loss and carries coverage through deduplication', () => {
  const part = validateCoveredResult(response(citations.map(record => record.id)), citations, ['peerReviewedJournals']);
  part.coverage!.required = citations.map(record => record.id);
  const merged = mergeSlices([part, part]);
  assert.equal(merged.sections.peerReviewedJournals.length, 2);
  assert.deepEqual(merged.metadata.extractionCoverage, { required: 2, preserved: 2, sourceRecords: 2 });
  part.sections.peerReviewedJournals!.pop();
  assert.throws(() => mergeSlices([part]), /coverage incomplete/);
});

test('later empty metadata cannot overwrite identity from an earlier batch', () => {
  const first = { sections: {}, metadata: { name: 'Example, Faculty', title: 'Professor', department: 'Science', processedAt: 'now' } };
  const second = { sections: {}, metadata: { name: '', title: '', department: '', processedAt: 'later' } };
  assert.equal(combineCoveredParts([first, second]).metadata!.name, 'Example, Faculty');
});

test('syntactically valid but truncated JSON triggers repair instead of success', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: JSON.stringify(response(citations.map(record => record.id))) } }] }), { status: 200 });
  };
  try {
    await assert.rejects(callSliceWithSignal({ rawText: text }, 'III_journals_late', { onPremApiKey: 'test-placeholder' }, AbortSignal.timeout(5000)), /Incomplete model response/);
    assert(calls > 1);
  } finally { globalThis.fetch = original; }
});

test('distinct source citations cannot be collapsed into a single output record', () => {
  assert.throws(() => validateCoveredResult({ sections: { peerReviewedJournals: [{ type: 'journal', citation: '' }] },
    sources: { peerReviewedJournals: [citations.map(record => record.id)] }, excluded: [] }, citations, ['peerReviewedJournals']), /separate output entries/);
});

test('targeted repair sends only missing evidence and keeps completed records', async () => {
  const original = globalThis.fetch;
  const requests: string[][] = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options!.body as string);
    const prompt: string = body.messages[1].content;
    const provided = JSON.parse(prompt.split('not another record):\n')[1].split('\n\nUse this')[0]) as typeof records;
    requests.push(provided.map(record => record.id));
    const chosen = requests.length === 1 ? [citations[0].id] : [citations[1].id];
    const raw = { ...response(chosen), excluded: provided.filter(record => record.heading).map(record => ({ id: record.id, reason: 'Heading only' })) };
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw) } }] }), { status: 200 });
  };
  try {
    const result = await callSliceWithSignal({ rawText: text }, 'III_journals_late', { onPremApiKey: 'test-placeholder' }, AbortSignal.timeout(5000));
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1], [citations[1].id]);
    assert.equal(result.sections.peerReviewedJournals!.length, 2);
  } finally { globalThis.fetch = original; }
});


test('independent source checks fail if a DOI or PMID disappears', () => {
  const checks = sourceIdentifierChecks(text, { specialization: 'Scientific research', peerReviewedJournals: [{ citation: 'PMID 12345678' }] });
  assert.equal(checks[0].pass, true);
  assert.equal(checks[1].pass, false);
});

test('PDF-style page headers never become citation continuation text', () => {
  const source = 'Journal Articles\n\nExample A (2024). Long citation without final punctuation\n\nFACULTY EXAMPLE             6\n\nMAY 2024\n\nExample B (2023). A different complete article.';
  const inventory = sourceRecords(source);
  const first = inventory.find(record => record.text.startsWith('Example A'))!;
  assert(!first.text.includes('FACULTY EXAMPLE'));
  assert(inventory.find(record => record.text === 'MAY 2024')!.heading);
  assert.equal(inventory.filter(isBibliographyRecord).length, 2);
});

test('an alphabetic DOI suffix cannot swallow the following initials-first citation', () => {
  const source = 'Peer-Reviewed Publications\n\nA.B. Example and C.D. Author, A first paper (2020), doi: 10.1234/firstX\n\nE.F. Researcher, A different paper (2021), doi: 10.1234/secondY\n\nG.H. Scientist, A third paper (2022), doi: 10.1234/thirdZ';
  const inventory = sourceRecords(source).filter(isBibliographyRecord);
  assert.equal(inventory.length, 3);
  assert(!inventory[0].text.includes('Researcher'));
});

test('identity and specialization sources count as covered scalar evidence', () => {
  const record = { ...citations[0], text: 'Example, Faculty; scientific research', context: '' };
  const raw = { metadata: { name: 'Example, Faculty' }, sections: { specialization: 'scientific research' }, sources: { metadata: [record.id], specialization: [record.id] }, excluded: [] };
  const result = validateCoveredResult(raw, [record], ['employment', 'education', 'specialization']);
  assert.deepEqual(result.coverage!.included, [record.id]);
  assert.equal(result.metadata!.name, 'Example, Faculty');
  assert.throws(() => validateCoveredResult({ ...raw, sources: { specialization: [record.id] } }, [record], ['employment', 'specialization']), /source ID for metadata/);
});

test('nested student records cannot disappear during sanitization', () => {
  const raw = { sections: { studentInstructionalGroups: [{ heading: 'Doctoral Students', entries: ['Student A', null] }] }, sources: { studentInstructionalGroups: [[citations[0].id]] }, excluded: [] };
  assert.throws(() => validateCoveredResult(raw, [citations[0]], ['studentInstructionalGroups']), /discarded/);
});

test('empty output arrays need no invented source references', () => {
  const result = validateCoveredResult({ sections: { teaching: [] }, sources: {}, excluded: [{ id: citations[0].id, reason: 'A paper, not teaching' }] }, [citations[0]], ['teaching']);
  assert.equal(result.coverage!.excluded.length, 1);
});

test('self-contained source attribution supports grouped students without parallel arrays', () => {
  const raw = { sections: { studentInstructionalGroups: [{ heading: 'Doctoral Students', entries: ['Student A', 'Student B'], sourceIds: citations.map(record => record.id) }] }, excluded: [] };
  const result = validateCoveredResult(raw, citations, ['studentInstructionalGroups']);
  assert.equal(result.sections.studentInstructionalGroups![0].entries.length, 2);
  assert.deepEqual(result.coverage!.included, citations.map(record => record.id));
});

test('self-contained publication references still copy source and reject unknown IDs', () => {
  const raw = { sections: { peerReviewedJournals: [{ citation: '', type: 'journal', sourceIds: [citations[0].id] }] }, excluded: [] };
  const result = validateCoveredResult(raw, [citations[0]], ['peerReviewedJournals']);
  assert.match(result.sections.peerReviewedJournals![0].citation, /12345678/);
  raw.sections.peerReviewedJournals[0].sourceIds = ['invented'];
  assert.throws(() => validateCoveredResult(raw, [citations[0]], ['peerReviewedJournals']), /Unknown/);
});

test('an omitted empty exclusion list is safe only when every source is covered', () => {
  const raw = { sections: { peerReviewedJournals: [{ type: 'journal', sourceIds: [citations[0].id] }] } };
  assert.equal(validateCoveredResult(raw, [citations[0]], ['peerReviewedJournals']).coverage!.included.length, 1);
  assert.throws(() => validateCoveredResult(raw, citations, ['peerReviewedJournals']), /Missing source dispositions/);
});

test('empty section containers may be omitted only with explicit source dispositions', () => {
  const result = validateCoveredResult({ excluded: citations.map(record => ({ id: record.id, reason: 'Outside this teaching slice' })) }, citations, ['teaching']);
  assert.deepEqual(result.sections, {});
  assert.throws(() => validateCoveredResult({}, citations, ['teaching']), /Missing source dispositions/);
});

test('meeting-associated journal volumes stay in journals without rewriting the citation', () => {
  const citations = ['Example, A. A paper. Faraday Disc. Chem. Soc. 84, 25-37 (1987).', 'Example, B. Another paper. Discussions of the Faraday Society, No. 108, 115-130 (1998).', 'Example, C. A paper. Faraday Discussions 217, 203-219 (2019).'];
  const result = mergeSlices([{ sections: { refereedProceedings: citations.map((citation, index) => ({ number: index + 1, citation, type: 'proceedings' })) } }]);
  assert.equal(result.sections.refereedProceedings.length, 0);
  assert.deepEqual(result.sections.peerReviewedJournals.map(entry => entry.citation), citations);
});

test('conflicting source classifications produce one citation and a visible review note', () => {
  const record = { number: 1, citation: 'Example A (2024). A published record.', type: 'other' as const, sourceIds: ['s1'] };
  const result = mergeSlices([{ sections: { popularWorks: [record], otherArticles: [record] } }]);
  assert.equal(result.sections.popularWorks.length + result.sections.otherArticles.length, 1);
  assert(result.reviewNotes!.some(note => note.topic === 'Publication placement'));
});

test('source acceptance checks catch missing or coalesced abstracts without a cloud baseline', () => {
  const first = 'Example A (2024). A conference abstract.';
  const second = 'Example B (2023). Another conference abstract.';
  const source = `conference PRESENTATIONS\n\n(2) ${first}\n\n(1) ${second}\n\nTECHNICAL SERVICE TO ORGANIZATIONS`;
  const check = (abstracts: { citation: string }[]) => sourceIdentifierChecks(source, { abstracts }, 'nieh').at(-1)!;
  assert.equal(check([{ citation: first }, { citation: second }]).pass, true);
  assert.equal(check([{ citation: first }]).pass, false);
  assert.equal(check([{ citation: `${first} ${second}` }]).pass, false);
});

test('misplaced response annotations are relocated without losing notes or source coverage', () => {
  const gap = { section: 'II', field: 'teaching', instruction: 'Confirm course dates', severity: 'recommended' };
  const note = { section: 'II', topic: 'Teaching', instruction: 'Confirm this placement' };
  const raw = { sections: { teaching: [{ text: 'Example course', sourceIds: [citations[0].id] }], gaps: [gap], reviewNotes: [note] }, gaps: [{ ...gap, instruction: 'Confirm course title' }] };
  const result = validateCoveredResult(raw, [citations[0]], ['teaching']);
  assert.equal(result.gaps!.length, 2);
  assert.deepEqual(result.reviewNotes, [note]);
  assert.deepEqual(result.coverage!.included, [citations[0].id]);
  assert.throws(() => validateCoveredResult({ ...raw, sections: { ...raw.sections, gaps: 'invalid' } }, [citations[0]], ['teaching']), /Invalid gaps/);
});

test('faculty thesis evidence in education reaches the bibliography with its full continued title', () => {
  const source = 'Education\n\nPh.D., Example University, 2020\n\nThesis Title: A long scientific title\n\n  continued on a second line\n\nAppointments\n\nProfessor, Example University, 2021';
  const inventory = sourceRecords(source);
  const thesis = inventory.find(record => record.text.startsWith('Thesis Title:'))!;
  assert.match(thesis.text, /continued on a second line/);
  assert(!thesis.text.includes('Professor'));
  assert(isBibliographyRecord(thesis));
  assert(recordsForSlice(source, 'III_popular_products').some(record => record.id === thesis.id));
});

test('numbered subsections retain their parent category and do not turn student advising into faculty honors', () => {
  const source = '7   Publications\n\n7.1 Peer-Reviewed\n\nExample A (2024). A published paper.\n\n11   Academic Service\n\n11.2 Student Advising\n\n11.2.4 Honors Thesis Advisor\n\nStudent Example (2023)\n\n11.3 Reviewer for Journals, Grants, and Conferences\n\nJournal Example';
  const inventory = sourceRecords(source);
  assert.match(inventory.find(record => record.text.startsWith('Example A'))!.context, /Publications.*Peer-Reviewed/);
  assert(recordsForSlice(source, 'II_teaching').some(record => record.text === 'Student Example (2023)'));
  assert(recordsForSlice(source, 'II_external').some(record => record.text === 'Journal Example'));
});

test('prose mentioning education is not a heading and colloquia stop bibliography context', () => {
  const source = 'MAJOR ACCOMPLISHMENTS\n\nEducation Sciences, Speech and Language Sciences and Data Analytics in Political Science.\n\nCONFERENCE PROCEEDINGS AND REPORTS\n\nExample A (2020). A proceeding.\n\nCOLLOQUIA AND PRESENTATIONS\n\nExample talk, Example University, 2021.';
  const inventory = sourceRecords(source);
  assert.equal(inventory.find(record => record.text.startsWith('Education Sciences'))!.heading, false);
  assert(!isBibliographyRecord(inventory.find(record => record.text.startsWith('Example talk'))!));
  assert(recordsForSlice(source, 'II_presentations_post_2020').some(record => record.text.startsWith('Example talk')));
});

test('a numbered faculty dissertation title remains source evidence rather than a discarded heading', () => {
  const source = '13     Doctoral Dissertation: A study of complex\n\n    scientific phenomena\n\n13.1 Overview\n\nAn overview of the research.';
  const inventory = sourceRecords(source);
  const thesis = inventory[0];
  assert.equal(thesis.heading, false);
  assert.match(thesis.text, /scientific phenomena/);
  assert(isBibliographyRecord(thesis));
  assert(recordsForSlice(source, 'III_popular_products').some(record => record.id === thesis.id));
});

test('book reviews and numbered conference citations are required bibliography evidence', () => {
  const source = 'BOOK REVIEWS & EDITORIALS (Invited)\n\n(1) Example A (2024). Book review. DOI 10.1234/review.\n\nConference Presentations\n\n(2) Example B (2023). Invited conference contribution. Example Conference.';
  const required = sourceRecords(source).filter(isBibliographyRecord);
  assert.equal(required.length, 2);
  assert(recordsForSlice(source, 'III_other_a').some(record => record.text.includes('10.1234/review')));
});

test('presentation wording and full leading dates are copied from source rather than reformatted by GLM', () => {
  const record = { ...citations[0], text: 'Sept 23, 2014\tExample A. An invited seminar. Example University.', context: 'Invited Talks' };
  const result = validateCoveredResult({ sections: { invitedPresentations: [{ text: 'Shortened talk (2014)', sourceIds: [record.id] }] } }, [record], ['invitedPresentations']);
  assert.deepEqual(result.sections.invitedPresentations, ['Example A. An invited seminar. Example University. Sept 23, 2014']);
});

test('source identifier checks include contribution notes rendered in the bibliography', () => {
  const checks = sourceIdentifierChecks('Paper (2024). PMID 12345678', { peerReviewedJournals: [{ citation: 'Paper (2024).', contributionNote: 'Senior author PMID 12345678' }] });
  assert(checks.every(check => check.pass));
});

test('page furniture is excluded while citation continuations reconnect across the page break', () => {
  const source = 'Publications\n\nExample, A. (2024). A paper.\n\n2\n\n  DOI: 10.1234/retained\n\nExample, B. (2023). Another complete published paper.';
  const inventory = sourceRecords(source);
  const first = inventory.find(record => record.text.startsWith('Example, A.'))!;
  assert.match(first.text, /DOI: 10.1234\/retained/);
  assert(!first.text.includes('\n2'));
  assert.equal(inventory.filter(isBibliographyRecord).length, 2);
});

test('education table labels retain degrees, honors, and faculty thesis context', () => {
  const source = 'Faculty Example\n\nEducation\tB.A., Example University, 2000\n\nGraduated with Honors\n\nPh.D., Example University, 2005\n\nThesis Title: A complete scientific dissertation title\n\nAppointments';
  const inventory = sourceRecords(source);
  assert(isBibliographyRecord(inventory.find(record => record.text.startsWith('Thesis Title:'))!));
  assert(recordsForSlice(source, 'II_memberships_awards').some(record => record.text === 'Graduated with Honors'));
});

test('source-backed deduplication keeps the fuller citation and its identifier-bearing contribution note', () => {
  const citation = 'Example A (2024). A source-backed journal paper.';
  const annotated = `${citation} **Senior author PMID 12345678`;
  const result = mergeSlices([{ sections: { peerReviewedJournals: [
    { number: 1, type: 'journal', citation, sourceIds: ['s1'] },
    { number: 2, type: 'journal', citation: annotated, sourceIds: ['s2'], contributionNote: 'Senior author' },
  ] } }]);
  assert.equal(result.sections.peerReviewedJournals.length, 1);
  assert.equal(result.sections.peerReviewedJournals[0].citation, annotated);
  assert.deepEqual(result.sections.peerReviewedJournals[0].sourceIds, ['s1', 's2']);
});

test('nested exclusion lists are normalized but contradictions and unknown IDs still fail', () => {
  const raw = { sections: { teaching: [], excluded: [{ id: citations[0].id, reason: 'A publication, not teaching' }] } };
  assert.equal(validateCoveredResult(raw, [citations[0]], ['teaching']).coverage!.excluded.length, 1);
  assert.throws(() => validateCoveredResult({ sections: { ...raw.sections, teaching: [{ text: 'A class', sourceIds: [citations[0].id] }] } }, [citations[0]], ['teaching']), /contradictory/);
  assert.throws(() => validateCoveredResult({ sections: { teaching: [], excluded: [{ id: 'unknown', reason: 'Heading' }] } }, [citations[0]], ['teaching']), /Invalid/);
});

test('strict response schema fixes nesting, enums, citation copying, and the source-ID vocabulary', async () => {
  const { buildResponseSchema } = await import('../lib/pipeline/response-schema');
  const schema = buildResponseSchema({ sections: { teaching: [{ text: '', sourceIds: [] }], peerReviewedJournals: [{ citation: '', type: 'journal', sourceIds: [] }] }, excluded: [{ id: '', reason: '' }], gaps: [{ severity: 'required|recommended|optional' }] }, ['s1', 's2']);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties!.sections.additionalProperties, false);
  assert(!('excluded' in schema.properties!.sections.properties!));
  assert.deepEqual(schema.properties!.sections.properties!.teaching.items!.properties!.sourceIds.items!.enum, ['s1', 's2']);
  assert.deepEqual(schema.properties!.excluded.items!.properties!.id.enum, ['s1', 's2']);
  assert.equal(schema.properties!.sections.properties!.peerReviewedJournals.items!.properties!.citation.const, '');
  assert.deepEqual(schema.properties!.gaps.items!.properties!.severity.enum, ['required', 'recommended', 'optional']);
});

test('published proceedings retain their publication category when an abstract slice also returns them', () => {
  const paper = { number: 1, citation: 'Example A, A full paper, Proceedings, International Conference, pp. 101-112 (2024).', type: 'abstract' as const, sourceIds: ['s1'] };
  const abstract = { number: 2, citation: 'Example B (2024). A conference contribution. Proceedings of the University Research Conference.', type: 'abstract' as const, sourceIds: ['s2'] };
  const result = mergeSlices([{ sections: { abstracts: [paper, abstract], otherProceedings: [{ ...paper, type: 'proceedings' }] } }]);
  assert.equal(result.sections.refereedProceedings.length, 1);
  assert.deepEqual(result.sections.abstracts.map(item => item.citation), [abstract.citation]);
});

test('review-period labels do not create duplicate honors or collapse different award years', () => {
  const result = mergeSlices([{ sections: { awards: ['Distinguished Chair in Physical Chemistry (2026) [New since 2020-01-01]', 'NEW: Distinguished Chair in Physical Chemistry (2026 – tenure)', 'Distinguished Chair in Physical Chemistry (2016)'] } }]);
  assert.equal(result.sections.awards.length, 2);
});

test('editor lists and translation notes stay with their chapter citation across page breaks', () => {
  const source = 'Journal Articles and Book Chapters\n\nExample, A., & Author, B. (2000). A chapter title. In C.\n\n    Editor, J. Second, & R. Third (Eds.), A Collected Volume (pp. 1-20). City: Press.\n\nFACULTY EXAMPLE             10\n\nMAY 2022\n\nFrench translation: Example, A. & Author, B. (2005) Un chapitre. In C. Editeur (Eds.) Un volume. Paris: Presse.\n\nExample, A. (1999). A different complete article. Journal, 1, 2-3.';
  const inventory = sourceRecords(source).filter(isBibliographyRecord);
  assert.equal(inventory.length, 2);
  assert.match(inventory[0].text, /In C\.\nEditor, J\. Second[\s\S]*\nFrench translation: /);
  assert(!inventory[0].text.includes('FACULTY EXAMPLE'));
});

test('singular review-article headings own their records instead of inheriting the research-paper context', () => {
  const source = 'Peer-reviewed Research Papers\n\n(5) Example A (2012) A research article. Journal, 1, 2-3.\n\nPEER-REVIEWED REVIEW article\n\n(4) Example B (2010) A synthesis of prior work. Trends Journal, 25, 354-361.\n\ninvited PEER-REVIEWED REVIEW article\n\n(1) Example C (2008) An invited review. Review Journal, 3, 1-9.';
  const inventory = sourceRecords(source);
  const [research, review, invited] = inventory.filter(isBibliographyRecord);
  assert.equal(research.context, 'Peer-reviewed Research Papers');
  assert.equal(review.context, 'PEER-REVIEWED REVIEW article');
  assert.equal(invited.context, 'invited PEER-REVIEWED REVIEW article');
  assert(recordsForSlice(source, 'III_other_a').some(record => record.id === review.id));
});

test('a bibliography record every task declined is kept from source with a placement note', () => {
  const [kept, declined] = citations;
  const exclusion = { sections: { peerReviewedJournals: [{ citation: '', type: 'journal', sourceIds: [kept.id] }] },
    excluded: [{ id: declined.id, reason: 'Belongs to another task' }] };
  const journals = validateCoveredResult(exclusion, citations, ['peerReviewedJournals']);
  const other = validateCoveredResult({ sections: {}, excluded: citations.map(record => ({ id: record.id, reason: 'Belongs to the journal task' })) }, citations, ['otherArticles']);
  assert.match(other.coverage!.excluded[1].text!, /^Example B \(2023\)\. Another method\./);
  journals.coverage!.required = citations.map(record => record.id);
  const merged = mergeSlices([journals, other]);
  assert.deepEqual(merged.sections.otherArticles.map(entry => entry.sourceIds), [[declined.id]]);
  assert.equal(merged.sections.otherArticles[0].citation, other.coverage!.excluded[1].text);
  assert((merged.reviewNotes ?? []).some(note => note.instruction.includes('Another method')));
  assert.deepEqual(merged.metadata.extractionCoverage!.preserved, 2);
  // A record no task accounted for is still an incomplete document.
  delete journals.coverage!.excluded[0].text;
  assert.throws(() => mergeSlices([journals]), /coverage incomplete/);
});

test('a DOI wrapped after a period stays with its citation and access note', () => {
  const source = 'Peer-Reviewed Publications\n\n  • J. Example, W. Author. A study of pauses. Journal of Examples Num. 79, 2020. https://doi.org/10.1016/j.wocn.\n\n    2019.100953\n\n       – Please email me for a PDF copy.\n\n  • A. Second, W. Author. Another study. Journal of Examples 12, 2021.';
  const inventory = sourceRecords(source).filter(isBibliographyRecord);
  assert.equal(inventory.length, 2);
  assert.match(inventory[0].text, /j\.wocn\.\n2019\.100953\n– Please email/);
});
