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
    
    // Parse document first to get the DocumentModel
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
    
    // Apply auto-fixes - pass the original buffer and the parsed doc
    console.log('\nApplying auto-fixes...');
    const { correctedBuffer, changes } = await applyAutoFixes(buffer, doc);
    
    console.log(`Applied ${changes.length} auto-fixes:`);
    changes.forEach(c => {
      console.log(`  ${c.ruleId}: ${c.description}`);
    });
    
    // Save the fixed document
    writeFileSync('./test-doc-fixed.docx', correctedBuffer);
    console.log(`\nFixed document saved to test-doc-fixed.docx (size: ${correctedBuffer.length} bytes)`);
    
  } catch (error) {
    console.error('Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

test();
