import { readDocxFiles } from './lib/docx/reader.js';
import { parseDocument } from './lib/pipeline/parser.js';
import { validateDocument } from './lib/pipeline/validator.js';
import { readFileSync } from 'fs';

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
    const results = validateDocument(doc);
    
    // Look for reference rules specifically
    const referenceRules = results.filter(r => r.ruleId.startsWith('REF-'));
    console.log('Reference rule results:');
    referenceRules.forEach(r => {
      console.log(`  ${r.ruleId}: ${r.status} - ${r.message} (autoFixable: ${r.autoFixable})`);
    });
    
    // Also check if we have any references detected
    console.log(`\nReferences detected: ${doc.references?.length || 0}`);
    if (doc.references && doc.references.length > 0) {
      console.log('First reference:', doc.references[0]);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

test();
