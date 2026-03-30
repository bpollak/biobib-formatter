import { PDFDocument, rgb } from 'pdf-lib';
import { ValidationResults, ChangeRecord } from '../types';
import { UCSD_COLORS } from '../constants';

export async function generateReportPDF(results: ValidationResults): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]); // Letter size
  const { width, height } = page.getSize();

  // Fonts
  const fontSize = 12;
  const margin = 72;
  let y = height - margin;

  // Header
  page.drawText('UCSD Dissertation Formatting Compliance Report', {
    x: margin,
    y,
    size: fontSize + 4,
    color: rgb(...hexToRgb(UCSD_COLORS.navy)),
  });
  y -= 30;

  page.drawText(`Document: ${results.metadata.fileName}`, {
    x: margin,
    y,
    size: fontSize,
  });
  y -= 20;

  page.drawText(`Type: ${results.metadata.type} | Degree: ${results.metadata.degreeType}`, {
    x: margin,
    y,
    size: fontSize,
  });
  y -= 30;

  // Summary
  page.drawText('SUMMARY', {
    x: margin,
    y,
    size: fontSize + 2,
    color: rgb(...hexToRgb(UCSD_COLORS.gold)),
  });
  y -= 20;

  const { total, passed, failed, warned, autoFixed } = results.summary;
  page.drawText(`Total Rules Checked: ${total}`, { x: margin, y, size: fontSize }); y -= 18;
  page.drawText(`Passed: ${passed}`, { x: margin, y, size: fontSize, color: rgb(0, 0.6, 0) }); y -= 18;
  page.drawText(`Failed: ${failed}`, { x: margin, y, size: fontSize, color: rgb(0.8, 0, 0) }); y -= 18;
  page.drawText(`Warnings: ${warned}`, { x: margin, y, size: fontSize, color: rgb(0.8, 0.4, 0) }); y -= 18;
  page.drawText(`Auto-Fixed: ${autoFixed}`, { x: margin, y, size: fontSize, color: rgb(0, 0.4, 0.8) }); y -= 18;
  page.drawText(`Overall Status: ${results.summary.overallStatus.toUpperCase()}`, {
    x: margin,
    y,
    size: fontSize,
    color: results.summary.overallStatus === 'pass' 
      ? rgb(0, 0.6, 0) 
      : results.summary.overallStatus === 'needs-attention'
      ? rgb(0.8, 0.4, 0)
      : rgb(0.8, 0, 0),
  });
  y -= 30;

  // Changelog
  if (results.changes.length > 0) {
    page.drawText('CHANGES APPLIED (Auto-Fixes)', {
      x: margin,
      y,
      size: fontSize + 2,
      color: rgb(...hexToRgb(UCSD_COLORS.gold)),
    });
    y -= 20;

    for (const change of results.changes.slice(0, 15)) { // Limit to 15 for space
      if (y < margin + 100) {
        // Add new page if needed - Assign page variable to target new page
        page = pdfDoc.addPage([612, 792]);
        y = page.getSize().height - margin;
        page.drawText('CHANGES APPLIED (continued)', {
          x: margin,
          y,
          size: fontSize + 2,
          color: rgb(...hexToRgb(UCSD_COLORS.gold)),
        });
        y -= 20;
      }
      
      page.drawText(`• ${change.description}`, {
        x: margin + 10,
        y,
        size: fontSize - 1,
      });
      y -= 16;
    }
    y -= 10;
  }

  // Manual Fixes
  if (results.manualFixes.length > 0) {
    page.drawText('MANUAL FIXES REQUIRED', {
      x: margin,
      y,
      size: fontSize + 2,
      color: rgb(...hexToRgb(UCSD_COLORS.gold)),
    });
    y -= 20;

    for (const fix of results.manualFixes.slice(0, 15)) {
      if (y < margin + 100) {
        // Add new page if needed - Assign page variable to target new page
        page = pdfDoc.addPage([612, 792]);
        y = page.getSize().height - margin;
        page.drawText('MANUAL FIXES REQUIRED (continued)', {
          x: margin,
          y,
          size: fontSize + 2,
          color: rgb(...hexToRgb(UCSD_COLORS.gold)),
        });
        y -= 20;
      }
      
      page.drawText(`${fix.ruleId}: ${fix.title}`, {
        x: margin + 10,
        y,
        size: fontSize - 1,
        color: rgb(0.8, 0, 0),
      });
      y -= 14;
      
      page.drawText(`  ${fix.instruction}`, {
        x: margin + 20,
        y,
        size: fontSize - 2,
      });
      y -= 16;
      
      if (fix.location) {
        page.drawText(`  Location: ${fix.location}`, {
          x: margin + 20,
          y,
          size: fontSize - 2,
          color: rgb(0.4, 0.4, 0.4),
        });
        y -= 14;
      }
      y -= 6;
    }
  }

  // Finalize PDF
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  const r = ((bigint >> 16) & 255) / 255;
  const g = ((bigint >> 8) & 255) / 255;
  const b = (bigint & 255) / 255;
  return [r, g, b];
}

export function generateResultsSummary(results: ValidationResults): string {
  const { total, passed, failed, warned, autoFixed } = results.summary;
  return `Formatting check complete: ${passed}/${total} rules passed, ${failed} failed, ${warned} warnings, ${autoFixed} auto-fixed. Overall: ${results.summary.overallStatus}.`;
}
