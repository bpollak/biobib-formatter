import { readDocxFiles } from './lib/docx/reader';
import { parseDocument } from './lib/pipeline/parser';
import { validateDocument } from './lib/pipeline/validator';
import { applyAutoFixes } from './lib/pipeline/fixer';
import { loadDocx, saveDocx } from './lib/docx/writer';
import { DocumentMetadata } from './types';
import { existsSync, readFileSync } from 'fs';

const testFile = './Copy of Cheng_Li_PhD dissertation.docx';

if (!existsSync(testFile)) {
  console.error(`Test file not found: ${testFile}`);
  process.exit(1);
}

console.log(`Testing dissertation formatter with: ${testFile}`);

// Read the document
const fileBuffer = readFileSync(testFile);
console.log(`Loaded file: ${fileBuffer.length} bytes`);

(async () => {
  try {
    // Read DOCX files
    const docxFiles = await readDocxFiles(fileBuffer);
    console.log('✓ DOCX files read successfully');
    
    // Parse document - need metadata
    const metadata: DocumentMetadata = {
      type: 'dissertation', // assuming dissertation
      // other fields optional?
    };
    const parsedDoc = await parseDocument(fileBuffer, metadata);
    console.log(`✓ Document parsed: ${parsedDoc.sections.length} sections, ${parsedDoc.paragraphs.length} paragraphs`);
    
    // Validate document
    const validationResults = validateDocument(parsedDoc);
    console.log(`✓ Validation completed:`);
    console.log(`  - Passed: ${validationResults.filter(r => r.passed).length}`);
    console.log(`  - Failed: ${validationResults.filter(r => !r.passed).length}`);
    console.log(`  - Warnings: ${validationResults.filter(r => r.warning).length}`);
    console.log(`  - Skipped: ${validationResults.filter(r => r.skipped).length}`);
    
    // Show some reference-related rule results
    const refRules = validationResults.filter(r => 
      r.ruleId && (r.ruleId.startsWith('REF-') || r.ruleId.includes('reference')));
    if (refRules.length > 0) {
      console.log(`\nReference-related rules:`);
      refRules.forEach(rule => {
        console.log(`  ${rule.ruleId}: ${rule.passed ? '✓ PASS' : '✗ FAIL'} - ${rule.message}`);
      });
    } else {
      console.log('\nNo reference-specific rules found in validation results');
    }
    
    // Apply auto-fixes
    console.log('\nApplying auto-fixes...');
    const fixedDoc = applyAutoFixes(parsedDoc, validationResults);
    console.log('✓ Auto-fixes applied');
    
    // Save fixed document
    // We need to load the original docx again to get the zip and then save the fixed XML
    const { zip, documentXml, stylesXml } = await loadDocx(fileBuffer);
    // Apply the fixed document XML (we assume applyAutoFixes returns a DocumentModel with the same structure?)
    // Actually, applyAutoFixes returns a DocumentModel, but we need to convert that back to XML.
    // This is a gap: we don't have a function to convert DocumentModel back to XML.
    // Let's check the fixer and writer to see if there's a way.
    // For now, we'll skip the save and just report on the validation improvement.
    // We'll instead validate the fixedDoc and see if the rules improve.
    
    // Validate the fixed document to see improvements
    const fixedValidation = validateDocument(fixedDoc);
    
    console.log(`\nValidation after fixes:`);
    console.log(`  - Passed: ${fixedValidation.filter(r => r.passed).length}`);
    console.log(`  - Failed: ${fixedValidation.filter(r => !r.passed).length}`);
    console.log(`  - Warnings: ${fixedValidation.filter(r => r.warning).length}`);
    console.log(`  - Skipped: ${fixedValidation.filter(r => r.skipped).length}`);
    
    // Calculate improvement
    const originalFailed = validationResults.filter(r => !r.passed).length;
    const fixedFailed = fixedValidation.filter(r => !r.passed).length;
    const improvement = originalFailed - fixedFailed;
    console.log(`\nImprovement: ${improvement} fewer failed rules`);
    
    if (improvement > 0) {
      console.log('🎉 SUCCESS: Auto-fixes improved document compliance!');
    } else if (improvement === 0) {
      console.log('⚠️  No improvement in failed rules count (may still have fixed specific issues)');
    } else {
      console.log('❌ Regression: More failed rules after fixes');
    }
    
  } catch (error) {
    console.error('❌ Error during testing:', error);
    process.exit(1);
  }
})();