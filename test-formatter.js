import { loadDocx } from './lib/docx/writer.js';
import { saveDocx } from './lib/docx/writer.js';
import { fixReferenceSpacing } from './lib/docx/writer.js';
import { validateDocument } from './lib/pipeline/validator.js';
import { applyAutoFixes } from './lib/pipeline/fixer.js';
import { readFileSync } from 'fs';

async function test() {
  try {
    // Load the test document
    const buffer = readFileSync('./test-doc.docx');
    const { zip, documentXml, stylesXml } = await loadDocx(buffer);
    
    console.log('Document loaded successfully');
    console.log('Document XML length:', documentXml.length);
    
    // Run validation
    const results = await validateDocument({ zip, documentXml, stylesXml });
    console.log(`Validation complete: ${results.length} rules checked`);
    
    // Count failures
    const failures = results.filter(r => r.status === 'fail');
    console.log(`Failures: ${failures.length}`);
    if (failures.length > 0) {
      console.log('First few failures:', failures.slice(0, 3).map(f => `${f.ruleId}: ${f.message}`));
    }
    
    // Try to apply auto-fixes
    const { fixedZip, fixedDocumentXml, fixedStylesXml, changes, fixedResults } = 
      await applyAutoFixes({ zip, documentXml, stylesXml });
    
    console.log(`Auto-fixes applied: ${changes.length} changes`);
    if (changes.length > 0) {
      console.log('Changes:', changes.map(c => `${c.ruleId}: ${c.description}`));
    }
    
    // Save the fixed document
    const fixedBuffer = await saveDocx(fixedZip, fixedDocumentXml, fixedStylesXml);
    console.log(`Fixed document generated, size: ${fixedBuffer.length} bytes`);
    
    // Write to file for inspection
    await import('fs/promises').then(fs => fs.writeFile('./test-doc-fixed.docx', fixedBuffer));
    console.log('Fixed document written to test-doc-fixed.docx');
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

test();
