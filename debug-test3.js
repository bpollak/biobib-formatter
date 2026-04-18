import { readDocxFiles } from './lib/docx/reader.js';
import { parseDocument } from './lib/pipeline/parser.js';
import { validateDocument } from './lib/pipeline/validator.js';
import { applyAutoFixes } from './lib/pipeline/fixer.js';
import { saveDocx } from './lib/docx/writer.js';
import { readFileSync } from 'fs';
import { writeFileSync } from 'fs';

async function test() {
  try {
    // Load the test document
    const buffer = readFileSync('./test-doc.docx');
    const files = await readDocxFiles(buffer);
    
    // Parse document
    const metadata = { 
      type: 'dissertation', 
      degreeType: 'doctoral', 
      fileName: 'test-doc.docx', 
      fileSize: buffer.length 
    };
    const doc = await parseDocument(buffer, metadata);
    
    // Validate
    let results = validateDocument(doc);
    console.log(`Initial validation: ${results.length} rules checked`);
    
    let failures = results.filter(r => r.status === 'fail');
    console.log(`Initial failures: ${failures.length}`);
    if (failures.length > 0) {
      console.log('First 3 failures:', failures.slice(0, 3).map(f => `${f.ruleId}: ${f.message}`));
    }
    
    // Apply auto-fixes
    const { fixedZip, fixedDocumentXml, fixedStylesXml, changes, fixedResults } = 
      await applyAutoFixes({ zip: files.zip, documentXml: files.documentXml, stylesXml: files.stylesXml });
    
    console.log(`\nApplied ${changes.length} auto-fixes:`);
    changes.forEach(c => {
      console.log(`  ${c.ruleId}: ${c.description}`);
    });
    
    // Re-validate after fixes
    const fixedDoc = {
      ...doc,
      rawXml: fixedDocumentXml,
      stylesXml: fixedStylesXml,
      // Note: We would need to re-parse to update the model, but for simplicity we'll just check the rules that we fixed.
      // In a real scenario, we would re-run parseDocument on the fixed buffer.
    };
    
    // For now, let's just check the fixedResults from applyAutoFixes
    console.log(`\nAfter fixes, validation results:`);
    let fixedFailures = fixedResults.filter(r => r.status === 'fail');
    console.log(`Failures after fixes: ${fixedFailures.length}`);
    if (fixedFailures.length > 0) {
      console.log('First 3 failures after fixes:', fixedFailures.slice(0, 3).map(f => `${f.ruleId}: ${f.message}`));
    }
    
    // Check if any of our reference rules were fixed
    const referenceFixes = changes.filter(c => c.ruleId === 'REF-002' || c.ruleId === 'REF-003');
    if (referenceFixes.length > 0) {
      console.log(`\nReference spacing fixes applied: ${referenceFixes.length}`);
      referenceFixes.forEach(f => {
        console.log(`  ${f.ruleId}: ${f.description}`);
      });
    } else {
      console.log('\nNo reference spacing fixes were applied (maybe no references detected or already fixed).');
    }
    
    // Save the fixed document
    const fixedBuffer = await saveDocx(fixedZip, fixedDocumentXml, fixedStylesXml);
    writeFileSync('./test-doc-fixed.docx', fixedBuffer);
    console.log(`\nFixed document saved to test-doc-fixed.docx (size: ${fixedBuffer.length} bytes)`);
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

test();
