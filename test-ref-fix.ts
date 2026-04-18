import { readDocxFiles } from './lib/docx/reader';
import { parseDocument } from './lib/pipeline/parser';
import * as fixer from './lib/pipeline/fixer';
import { validateDocument } from './lib/pipeline/validator';
import { existsSync, readFileSync, writeFileSync } from 'fs';

const testFile = './Copy of Nies_Laurie- Rough Draft Dissertation Formatted 5-9.docx';

if (!existsSync(testFile)) {
  console.error(`Test file not found: ${testFile}`);
  process.exit(1);
}

console.log(`Testing reference spacing fixes with: ${testFile}`);

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
    
    // Validate BEFORE fixes
    console.log('\n=== VALIDATION BEFORE FIXES ===');
    const resultsBefore = await validateDocument(parsedDoc);
    const failedBefore = resultsBefore.filter(r => !r.passed);
    console.log(`Total rules: ${resultsBefore.length}`);
    console.log(`Failed rules: ${failedBefore.length}`);
    
    // Show reference-related failures
    const refFailuresBefore = failedBefore.filter(r => r.ruleId.startsWith('REF-'));
    console.log(`Reference rule failures: ${refFailuresBefore.length}`);
    if (refFailuresBefore.length > 0) {
      console.log('  Reference rule failures:');
      refFailuresBefore.forEach(failure => {
        console.log(`    ${failure.ruleId}: ${failure.message}`);
      });
    }
    
    // Apply auto-fixes
    console.log('\n=== APPLYING AUTO-FIXES ===');
    const { correctedBuffer, changes } = await fixer.applyAutoFixes(fileBuffer, parsedDoc);
    console.log(`✓ Auto-fixes applied, ${changes.length} changes recorded`);
    
    // Log the changes related to reference spacing
    const refChanges = changes.filter(c => c.ruleId.startsWith('REF-'));
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
    
    // Validate AFTER fixes
    console.log('\n=== VALIDATION AFTER FIXES ===');
    const resultsAfter = await validateDocument(fixedParsedDoc);
    const failedAfter = resultsAfter.filter(r => !r.passed);
    console.log(`Total rules: ${resultsAfter.length}`);
    console.log(`Failed rules: ${failedAfter.length}`);
    
    // Show reference-related failures after fix
    const refFailuresAfter = failedAfter.filter(r => r.ruleId.startsWith('REF-'));
    console.log(`Reference rule failures: ${refFailuresAfter.length}`);
    if (refFailuresAfter.length > 0) {
      console.log('  Reference rule failures:');
      refFailuresAfter.forEach(failure => {
        console.log(`    ${failure.ruleId}: ${failure.message}`);
      });
    }
    
    // Calculate improvement
    const refImprovement = refFailuresBefore.length - refFailuresAfter.length;
    console.log(`\nReference rule improvement: ${refImprovement} fewer failures`);
    
    // Save the fixed document for inspection
    const outputFile = './test-reference-fixed.docx';
    writeFileSync(outputFile, correctedBuffer);
    console.log(`\nFixed document saved to: ${outputFile}`);
    
    // Show specific REF-002 and REF-003 status
    const ref002Before = resultsBefore.find(r => r.ruleId === 'REF-002');
    const ref002After = resultsAfter.find(r => r.ruleId === 'REF-002');
    const ref003Before = resultsBefore.find(r => r.ruleId === 'REF-003');
    const ref003After = resultsAfter.find(r => r.ruleId === 'REF-003');
    
    console.log('\n=== SPECIFIC REFERENCE RULE STATUS ===');
    console.log('REF-002 (References Single-Spaced Within Entries):');
    console.log(`  Before: ${ref002Before ? (ref002Before.passed ? 'PASS' : 'FAIL') : 'NOT FOUND'} - ${ref002Before ? ref002Before.message : 'N/A'}`);
    console.log(`  After:  ${ref002After ? (ref002After.passed ? 'PASS' : 'FAIL') : 'NOT FOUND'} - ${ref002After ? ref002After.message : 'N/A'}`);
    
    console.log('REF-003 (Double-Space Between Reference Entries):');
    console.log(`  Before: ${ref003Before ? (ref003Before.passed ? 'PASS' : 'FAIL') : 'NOT FOUND'} - ${ref003Before ? ref003Before.message : 'N/A'}`);
    console.log(`  After:  ${ref003After ? (ref003After.passed ? 'PASS' : 'FAIL') : 'NOT FOUND'} - ${ref003After ? ref003After.message : 'N/A'}`);
    
  } catch (error) {
    console.error('❌ Error during testing:', error);
    process.exit(1);
  }
})();