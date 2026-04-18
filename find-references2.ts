import { readDocxFiles } from './lib/docx/reader';
import { parseDocument } from './lib/pipeline/parser';
import { validateDocument } from './lib/pipeline/validator';
import { existsSync, readFileSync } from 'fs';

const testFiles = [
  './Copy of Cheng_Li_PhD dissertation.docx',
  './Copy of Nies_Laurie- Rough Draft Dissertation Formatted 5-9.docx',
  './Copy of Niles_Renee_PhD_Dissertation_Draft.docx',
  './Copy of Niles_Renee_PhD_Dissertation_Draft (1).docx',
  './Copy of West_Melanie Dissertation .docx'
];

async function testFile(file: string) {
  if (!existsSync(file)) {
    console.log(`File not found: ${file}`);
    return;
  }

  console.log(`\nTesting ${file}...`);
  const fileBuffer = readFileSync(file);
  console.log(`Loaded: ${fileBuffer.length} bytes`);

  try {
    const docxFiles = await readDocxFiles(fileBuffer);
    const metadata = { type: 'dissertation' };
    const parsedDoc = await parseDocument(fileBuffer, metadata);
    const validationResults = validateDocument(parsedDoc);

    const ref001 = validationResults.find(r => r.ruleId === 'REF-001');
    if (ref001) {
      console.log(`  REF-001: ${ref001.passed ? '✓ PASS' : '✗ FAIL'} - ${ref001.message}`);
      // Also check the other reference rules if REF-001 passes
      if (ref001.passed) {
        const refRules = validationResults.filter(r => 
          r.ruleId && (r.ruleId.startsWith('REF-') || r.ruleId.includes('reference')));
        console.log(`  Other REF rules:`);
        refRules.forEach(rule => {
          if (rule.ruleId !== 'REF-001') {
            console.log(`    ${rule.ruleId}: ${rule.passed ? '✓ PASS' : '✗ FAIL'} - ${rule.message}`);
          }
        });
      }
    } else {
      console.log('  REF-001: NOT FOUND (rule not in results?)');
    }
  } catch (error) {
    console.error(`  Error processing ${file}:`, error.message);
  }
}

// Run all tests
(async () => {
  for (const file of testFiles) {
    await testFile(file);
  }
})();