# Dissertation Formatting Agent — Project Brief

## Overview
A self-service web application for UC San Diego's Graduate Education and Postdoctoral Affairs (GEPA) office that automatically validates and formats doctoral dissertations and master's theses according to UCSD formatting requirements.

## Stakeholders
- **Requestor:** Erica Lennard, Assistant Dean of Academic Affairs, GEPA
- **Users:** Graduate students submitting dissertations/theses
- **Beneficiaries:** 5 GEPA formatting advisors currently doing manual reviews
- **Sponsor:** Brett Pollak, CTO / Zach Johnson, AI Strategy

## The Problem
- 5 GEPA advisors spend substantial time manually reviewing dissertation formatting
- New Title II ADA compliance (WCAG 2.1 Level AA) effective April 2026 adds accessibility requirements
- No efficient automated solution exists at any university (per CGS webinar)
- Students frequently deviate from templates, creating back-and-forth correction cycles

## Workflow
1. Student uploads dissertation (Word .docx) via web portal
2. Agent parses document structure and validates against ALL GEPA formatting rules
3. Auto-applies fixable formatting changes (margins, fonts, spacing, pagination, indentation)
4. Returns to student:
   - Corrected document with changes applied
   - Changelog: "Here's what I changed and why"
   - For unfixable items: specific guidance on manual edits needed
5. Student reviews, makes manual fixes, and resubmits — iterative loop
6. Once fully compliant → document forwarded to GEPA for final human review

## Formatting Requirements
Full requirements extracted from the 62-page GEPA formatting manual. See:
- `/Users/brettpollak/.openclaw/workspace/docs/dissertation-formatting-agent-requirements-2026-03-25.md`

Key rule categories:
- Margins (1" all sides)
- Fonts (Arial/Century Gothic/Helvetica/Times New Roman, 10-12pt, consistent)
- Pagination (Roman numerals for prelim, Arabic for body, specific numbering rules)
- Page organization (title → copyright → approval → optional prelim → TOC → acknowledgements → vita → abstract → body → appendices → references)
- Title page formatting (exact layout rules)
- Abstract (350 words doctoral, 250 words master's, 2.5" top margin)
- Figures/tables (captions above tables, below figures, facing captions for full-page items)
- References (single-spaced, double-space between entries, all authors listed)
- Accessibility (WCAG 2.1 Level AA — tags, alt-text, reading order, contrast, metadata)
- Spacing (double-spaced body, single-space OK for quotes/footnotes/captions)

## Tech Stack
- Next.js 15 + TypeScript + MUI (scaffolded)
- mammoth.js for .docx parsing
- pdf-lib for PDF manipulation (if needed)
- Deploy to Vercel via GitHub Pages
- Future: integrate with UCSD SSO / Kuali workflow

## Data Tier
P2 (Internal) — student dissertations are not public until published

## Success Criteria
- Student can upload a .docx and get back a formatted version + compliance report
- All checkable formatting rules are validated
- Auto-fixes applied where possible
- Clear, actionable guidance for manual fixes
- GEPA advisors receive only pre-validated documents
