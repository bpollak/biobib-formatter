import { readDocxFiles } from './lib/docx/reader.js';
import { parseDocument } from './lib/pipeline/parser.js';
import { readFileSync } from 'fs';

async function test() {
  try {
    // Load the test document
    const buffer = readFileSync('./test-doc.docx');
    const files = await readDocxFiles(buffer);
    console.log('Files keys:', Object.keys(files));
    console.log('documentXml length:', files.documentXml.length);
    console.log('stylesXml length:', files.stylesXml.length);
    
    // Parse document
    const metadata = { 
      type: 'dissertation', 
      degreeType: 'doctoral', 
      fileName: 'test-doc.docx', 
      fileSize: buffer.length 
    };
    const doc = await parseDocument(buffer, metadata);
    
    console.log('DocumentModel keys:', Object.keys(doc));
    console.log('margins:', doc.margins);
    console.log('paragraphs length:', doc.paragraphs?.length || 'undefined');
    console.log('metadata:', doc.metadata);
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

test();
