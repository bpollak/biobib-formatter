# CONTEXT.md — Dissertation Formatting Agent

## Current State
- **Stage:** Evaluator (needs testing with real .docx files)
- **Live URL:** https://dissertation-formatter.vercel.app
- **Repo:** github.com/bpollak/dissertation-formatter
- **Stack:** Next.js 16 + TypeScript + MUI + JSZip

## What's Built
- Upload page with drag-and-drop, dissertation/thesis toggle, degree type selector
- 67 formatting rules across 13 categories (margins, fonts, spacing, pagination, page order, title page, abstract, figures/tables, references, headings, accessibility, indentation)
- ~20 auto-fixable rules
- Validation pipeline: parse → validate → fix → report
- Results page with accordion checklist, changelog, manual fixes, download buttons
- UCSD CMS V5-aligned branding (header, footer, institutional layout)

## Design Decisions
- JSZip for direct .docx XML manipulation (mammoth only for HTML preview)
- In-memory session store with TTL (no database for MVP)
- Stateless processing — upload → process → download
- P2 data tier (student dissertations not public until published)

## Known Issues / Next Steps
- Evaluator stage: test with real dissertation .docx files
- Phase 2: full pagination auto-fix, WCAG 2.1 AA checking, PDF output, UCSD SSO, Kuali integration, LaTeX support, batch processing

## Stakeholders
- Erica Lennard (Assistant Dean, GEPA) — original requestor
- Norienne Saign — Title II compliance
- Brett Pollak — sponsor
- Zach Johnson — AI Strategy

## Key Files
- SPEC.md — full architecture (698 lines)
- BRIEF.md — project brief
- lib/rules/ — one file per rule category
- lib/pipeline/ — processing pipeline
- docs/dissertation-formatting-agent-requirements-2026-03-25.md — full GEPA requirements
