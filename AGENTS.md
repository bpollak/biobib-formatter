<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Release Notes Reminder

Whenever application enhancements are completed, update the public Release Notes section in `app/about/page.tsx` in the same change set. Use a concrete date and time marker, summarize product-facing improvements, and avoid naming internal regression fixtures or one-off validation files.

## Mandatory Regression Release Gate

Follow `docs/release-regression.md` for every change.

- Run `npm run test:release` before every merge or deployment.
- For any change that can affect conversion behavior or generated output, deploy the candidate and run `npm run test:release:live`.
- The live gate must use both semantic acceptance CVs, must process every generated output a second time, and must apply the same acceptance profile on both passes.
- For material extraction, prompt, model, classification, deduplication, or Word-generation changes, include at least three additional real UC San Diego faculty CVs for a cohort of five or more.
- Do not commit private source CVs, generated BioBibs, tokens, or regression artifacts.
- Do not proceed when a required check fails; investigate, fix, and rerun the complete applicable gate.
