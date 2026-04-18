import { readDocxFiles } from './lib/docx/reader';
import { parseDocument } from './lib/pipeline/parser';
import { validateDocument } from './lib/pipeline/validator';
import { applyAutoFixes } from './lib/pipeline/fixer';
import { existsSync, readFileSync } from 'fs';

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
    
    // Validate document
    const validationResults = validateDocument(parsedDoc);
    console.log(`\n✓ Initial validation:`);
    console.log(`  - Passed: ${validationResults.filter(r => r.passed).length}`);
    console.log(`  - Failed: ${validationResults.filter(r => !r.passed).length}`);
    console.log(`  - Warnings: ${validationResults.filter(r => r.warning).length}`);
    console.log(`  - Skipped: ${validationResults.filter(r => r.skipped).length}`);
    
    // Focus on reference rules
    const refRules = validationResults.filter(r => 
      r.ruleId && (r.ruleId.startsWith('REF-') || r.ruleId.includes('reference')));
    console.log(`\nReference rules:`);
    refRules.forEach(rule => {
      console.log(`  ${rule.ruleId}: ${rule.passed ? '✓ PASS' : '✗ FAIL'} - ${rule.message}`);
    });
    
    // Apply auto-fixes
    console.log('\nApplying auto-fixes...');
    const { correctedBuffer, changes } = await applyAutoFixes(fileBuffer, parsedDoc);
    console.log(`✓ Auto-fixes applied, ${changes.length} changes recorded`);
    
    // Parse the fixed document to validate
    const fixedParsedDoc = await parseDocument(correctedBuffer, metadata);
    const fixedValidation = validateDocument(fixedParsedDoc);
    console.log(`\nValidation after fixes:`);
    console.log(`  - Passed: ${fixedValidation.filter(r => r.passed).length}`);
    console.log(`  - Failed: ${fixedValidation.filter(r => !r.passed).length}`);
    console.log(`  - Warnings: ${fixedValidation.filter(r => r.warning).length}`);
    console.log(`  - Skipped: ${fixedValidation.filter(r => r.skipped).length}`);
    
    // Focus on reference rules after fixes
    const fixedRefRules = fixedValidation.filter(r => 
      r.ruleId && (r.ruleId.startsWith('REF-') || r.ruleId.includes('reference')));
    console.log(`\nReference rules after fixes:`);
    fixedRefRules.forEach(rule => {
      console.log(`  ${rule.ruleId}: ${rule.passed ? '✓ PASS' : '✗ FAIL'} - ${rule.message}`);
    });
    
    // Calculate improvement for reference rules only
    const originalRefFailed = refRules.filter(r => !r.passed).length;
    const fixedRefFailed = fixedRefRules.filter(r => !r.passed).length;
    const refImprovement = originalRefFailed - fixedRefFailed;
    console.log(`\nReference rules improvement: ${refImprovement} fewer failed reference rules`);
    
    // Overall improvement
    const originalFailed = validationResults.filter(r => !r.passed).length;
    const fixedFailed = fixedValidation.filter(r => !r.passed).length;
    const overallImprovement = originalFailed - fixedFailed;
    console.log(`Overall improvement: ${overallImprovement} fewer failed rules`);
    
    if (refImprovement > 0) {
      console.log('🎉 SUCCESS: Reference spacing auto-fixes improved compliance!');
    } else if (refImprovement === 0) {
      console.log('⚠️  No improvement in reference rules (they may already be passing or fixes didn\'t apply)');
    } else {
      console.log('❌ Regression: More reference rules failed after fixes');
    }
    
  } catch (error) {
    console.error('❌ Error during testing:', error);
    process.exit(1);
  }
})();