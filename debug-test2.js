import { readDocxFiles } from './lib/docx/reader.js';
import { parseDocument } from './lib/pipeline/parser.js';
import { validateDocument } from './lib/pipeline/validator.js';
import { readFileSync } from 'fs';

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
    const results = validateDocument(doc);
    console.log(`Validation complete: ${results.length} rules checked`);
    
    // Count by status
    const passed = results.filter(r => r.status === 'pass').length;
    const failed = results.filter(r => r.status === 'fail').length;
    const warned = results.filter(r => r.status === 'warning').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    
    console.log(`Results - Pass: ${passed}, Fail: ${failed}, Warn: ${warned}, Skipped: ${skipped}`);
    
    // Show first few failures
    const failures = results.filter(r => r.status === 'fail');
    if (failures.length > 0) {
      console.log('\nFirst 5 failures:');
      failures.slice(0, 5).forEach(f => {
        console.log(`  ${f.ruleId}: ${f.message}`);
      });
    }
    
    // Show first few warnings
    const warnings = results.filter(r => r.status === 'warning');
    if (warnings.length > 0) {
      console.log('\nFirst 5 warnings:');
      warnings.slice(0, 5).forEach(w => {
        console.log(`  ${w.ruleId}: ${w.message}`);
      });
    }
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

test();
