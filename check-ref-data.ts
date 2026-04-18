import { readDocxFiles } from './lib/docx/reader';
import { parseDocument } from './lib/pipeline/parser';
import { existsSync, readFileSync } from 'fs';

const testFile = './Copy of Nies_Laurie- Rough Draft Dissertation Formatted 5-9.docx';

if (!existsSync(testFile)) {
  console.error(`Test file not found: ${testFile}`);
  process.exit(1);
}

console.log(`Checking reference data in: ${testFile}`);

// Read the document
const fileBuffer = readFileSync(testFile);
console.log(`Loaded file: ${fileBuffer.length} bytes`);

(async () => {
  try {
    // Read DOCX files
    const docxFiles = await readDocxFiles(fileBuffer);
    console.log('✓ DOCX files read successfully');
    
    // Parse document
    const metadata = {
      type: 'dissertation',
      degreeType: 'doctoral',
      fileName: testFile,
      fileSize: fileBuffer.length
    };
    const parsedDoc = await parseDocument(fileBuffer, metadata);
    console.log(`✓ Document parsed: ${parsedDoc.sections.length} sections, ${parsedDoc.paragraphs.length} paragraphs`);
    console.log(`  Reference entries found: ${parsedDoc.references.length}`);
    
    // Check lineSpacing and spaceAfter
    let lineSpacingOver360 = 0;
    let spaceAfterUnder200 = 0;
    let lineSpacingUndefined = 0;
    let spaceAfterUndefined = 0;
    
    console.log(`\nFirst 10 references:`);
    for (let i = 0; i < Math.min(10, parsedDoc.references.length); i++) {
      const ref = parsedDoc.references[i];
      const ls = ref.lineSpacing ?? undefined;
      const sa = ref.spaceAfter ?? undefined;
      console.log(`  [${i}] lineSpacing: ${ls === undefined ? 'undefined' : ls}, spaceAfter: ${sa === undefined ? 'undefined' : sa}`);
      if (ls !== undefined && ls > 360) lineSpacingOver360++;
      if (sa !== undefined && sa < 200) spaceAfterUnder200++;
      if (ls === undefined) lineSpacingUndefined++;
      if (sa === undefined) spaceAfterUndefined++;
    }
    
    // Count over all
    for (const ref of parsedDoc.references) {
      const ls = ref.lineSpacing;
      const sa = ref.spaceAfter;
      if (ls !== undefined && ls > 360) lineSpacingOver360++;
      if (sa !== undefined && sa < 200) spaceAfterUnder200++;
      if (ls === undefined) lineSpacingUndefined++;
      if (sa === undefined) spaceAfterUndefined++;
    }
    
    console.log(`\nCounts:`);
    console.log(`  lineSpacing > 360: ${lineSpacingOver360}`);
    console.log(`  spaceAfter < 200: ${spaceAfterUnder200}`);
    console.log(`  lineSpacing undefined: ${lineSpacingUndefined}`);
    console.log(`  spaceAfter undefined: ${spaceAfterUndefined}`);
    
    // Also check the constants
    console.log(`\nConstants:`);
    console.log(`  LINE_SPACING_SINGLE: 240`);
    console.log(`  LINE_SPACING_SINGLE * 1.5: ${240 * 1.5}`);
    console.log(`  Threshold for spaceAfter: 200`);
    
  } catch (error) {
    console.error('❌ Error during checking:', error);
    process.exit(1);
  }
})();