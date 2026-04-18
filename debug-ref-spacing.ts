import { readDocxFiles } from './lib/docx/reader';
import { parseDocument } from './lib/pipeline/parser';
import * as fixer from './lib/pipeline/fixer';
import { existsSync, readFileSync } from 'fs';

const testFile = './Copy of Nies_Laurie- Rough Draft Dissertation Formatted 5-9.docx';

if (!existsSync(testFile)) {
  console.error(`Test file not found: ${testFile}`);
  process.exit(1);
}

console.log(`Debugging reference spacing with: ${testFile}`);

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
    
    // Show first 5 references before fix
    console.log('\nFirst 5 references BEFORE fix:');
    for (let i = 0; i < Math.min(5, parsedDoc.references.length); i++) {
      const ref = parsedDoc.references[i];
      console.log(`  [${i}] lineSpacing: ${ref.lineSpacing ?? 'undefined'}, spaceAfter: ${ref.spaceAfter ?? 'undefined'}`);
      console.log(`      Text: ${ref.text.substring(0, 80)}${ref.text.length > 80 ? '...' : ''}`);
    }
    
    // Apply auto-fixes
    console.log('\nApplying auto-fixes...');
    const { correctedBuffer, changes } = await fixer.applyAutoFixes(fileBuffer, parsedDoc);
    console.log(`✓ Auto-fixes applied, ${changes.length} changes recorded`);
    
    // Log the changes related to reference spacing
    const refChanges = changes.filter(c => c.ruleId === 'REF-002' || c.ruleId === 'REF-003');
    if (refChanges.length > 0) {
      console.log(`  Reference spacing changes:`);
      refChanges.forEach(c => {
        console.log(`    ${c.ruleId}: ${c.description}`);
      });
    } else {
      console.log(`  No reference spacing changes recorded.`);
    }
    
    // Parse the fixed document
    const fixedParsedDoc = await parseDocument(correctedBuffer, metadata);
    console.log(`\n✓ Fixed document parsed: ${fixedParsedDoc.sections.length} sections, ${fixedParsedDoc.paragraphs.length} paragraphs`);
    console.log(`  Reference entries found: ${fixedParsedDoc.references.length}`);
    
    // Show first 5 references after fix
    console.log('\nFirst 5 references AFTER fix:');
    for (let i = 0; i < Math.min(5, fixedParsedDoc.references.length); i++) {
      const ref = fixedParsedDoc.references[i];
      console.log(`  [${i}] lineSpacing: ${ref.lineSpacing ?? 'undefined'}, spaceAfter: ${ref.spaceAfter ?? 'undefined'}`);
      console.log(`      Text: ${ref.text.substring(0, 80)}${ref.text.length > 80 ? '...' : ''}`);
    }
    
    // Check if any reference entries have lineSpacing changed to 240 (single) or spaceAfter changed to 240 (12pt)
    let lineSpacingFixed = 0;
    let spaceAfterFixed = 0;
    for (const ref of fixedParsedDoc.references) {
      if (ref.lineSpacing === 240) lineSpacingFixed++;
      if (ref.spaceAfter === 240) spaceAfterFixed++;
    }
    console.log(`\nReferences with lineSpacing === 240 (single): ${lineSpacingFixed}/${fixedParsedDoc.references.length}`);
    console.log(`References with spaceAfter === 240 (12pt): ${spaceAfterFixed}/${fixedParsedDoc.references.length}`);
    
  } catch (error) {
    console.error('❌ Error during debugging:', error);
    process.exit(1);
  }
})();