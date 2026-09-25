/** Inspect rendered cells rather than assuming every CV has missing values. */
export function inspectTableValues(documentXml: string): { pass: boolean; cells: number; blanks: number } {
  let cells = 0;
  let blanks = 0;
  for (const table of documentXml.matchAll(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g)) {
    for (const row of table[0].matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)) {
      if (/<w:tblHeader\b/.test(row[0])) continue;
      const values = [...row[0].matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)].map(cell =>
        [...cell[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
          .map(text => text[1]).join('').trim(),
      );
      // Review dividers intentionally leave the cells after their label empty.
      if (values[0] === 'New since last review' && values.slice(1).every(value => !value)) continue;
      cells += values.length;
      blanks += values.filter(value => !value || /^[-–—]+$/.test(value)).length;
    }
  }
  return { pass: cells > 0 && blanks === 0, cells, blanks };
}
