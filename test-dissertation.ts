import { readDocxFiles } from './lib/docx/reader';
import { parseDocument } from './lib/pipeline/parser';
import { validateDocument } from './lib/pipeline/validator';
import { applyAutoFixes } from './lib/pipeline/fixer';
import { saveDocx } from './lib/docx/writer';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Test with one of the dissertation documents
const testFile = './Copy of Cheng_Li_PhD dissertation.docx';

if (!existsSync(testFile)) {
  console.error(`Test file not found: ${testFile}`);
  process.exit(1);
}

console.log(`Testing dissertation formatter with: ${testFile}`);

// Read the document
const fileBuffer = readFileSync(testFile);
console.log(`Loaded file: ${fileBuffer.length} bytes`);

try {
  // Read DOCX files
  const docxFiles = readDocxFiles(fileBuffer);
  console.log('✓ DOCX files read successfully');
  
  // Parse document
  const parsedDoc = parseDocument(docxFiles);
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
  const outputBuffer = saveDocx(fixedDoc);
  const outputFile = testFile.replace('.docx', '-fixed.docx');
  require('fs').writeFileSync(outputFile, outputBuffer);
  console.log(`✓ Fixed document saved to: ${outputFile} (${outputBuffer.length} bytes)`);
  
  // Validate the fixed document to see improvements
  const fixedDocxFiles = readDocxFiles(outputBuffer);
  const fixedParsedDoc = parseDocument(fixedDocxFiles);
  const fixedValidation = validateDocument(fixedParsedDoc);
  
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