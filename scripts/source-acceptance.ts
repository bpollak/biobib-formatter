/** Independent identifier checks do not rely on the pipeline's record segmentation. */
export function sourceIdentifierChecks(source: string, sections: Record<string, unknown>, profile?: string): { name: string; pass: boolean; detail: string }[] {
  const citations = Object.values(sections).filter(Array.isArray).flatMap(items => items.flatMap(item =>
    item && typeof item === 'object' && 'citation' in item && typeof item.citation === 'string'
      ? [[item.citation, 'contributionNote' in item && typeof item.contributionNote === 'string' ? item.contributionNote : ''].filter(Boolean).join(' ')] : []));
  const output = citations.join('\n');
  const pmids = [...new Set([...source.matchAll(/\bPMID\s*:?\s*(\d{7,9})\b/gi)].map(match => match[1]))];
  const normalize = (value: string) => value.toLowerCase().replace(/[.,;:)]+$/, '');
  const dois = [...new Set([...source.matchAll(/\b10\.\d{4,9}\/[^\s<>"]+/gi)].map(match => normalize(match[0])))];
  const outputDois = new Set([...output.matchAll(/\b10\.\d{4,9}\/[^\s<>"]+/gi)].map(match => normalize(match[0])));
  const missingPmids = pmids.filter(id => !output.includes(id));
  const missingDois = dois.filter(id => !outputDois.has(id));
  const checks = [
    { name: 'All source PMID identifiers survive in the bibliography', pass: !missingPmids.length, detail: `${pmids.length - missingPmids.length}/${pmids.length}; missing: ${missingPmids.join(', ') || 'none'}` },
    { name: 'All source DOI identifiers survive in the bibliography', pass: !missingDois.length, detail: `${dois.length - missingDois.length}/${dois.length}; missing: ${missingDois.join(', ') || 'none'}` },
  ];
  if (profile === 'nieh') {
    // This acceptance CV's numbered conference bibliography is the documented
    // abstract set. Verify every source citation independently of the parser,
    // rather than treating a matching total or a cloud response as ground truth.
    const block = source.match(/conference\s+presentations\s*\n([\s\S]*?)(?=\n\s*technical service to organizations)/i)?.[1];
    const expected = (block ?? '').split(/\n\s*\n/).map(value => value.trim()).filter(value => /^\(?\d+[.)]\s*/.test(value));
    const normalizeCitation = (value: string) => value.replace(/^\(?\d+[.)]\s*/, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const abstracts = (Array.isArray(sections.abstracts) ? sections.abstracts : []).map(item =>
      item && typeof item === 'object' && 'citation' in item ? normalizeCitation(String(item.citation)) : '');
    const used = new Set<number>();
    let retained = 0;
    for (const citation of expected) {
      const index = abstracts.findIndex((output, index) => !used.has(index) && output.includes(normalizeCitation(citation)));
      if (index !== -1) { used.add(index); retained++; }
    }
    checks.push({ name: 'Every numbered source conference citation survives as a separate abstract', pass: expected.length > 0 && retained === expected.length, detail: `${retained}/${expected.length} source citations retained` });
  }
  return checks;
}
