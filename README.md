# BioBib Formatter

Converts UCSD faculty CVs (.docx) to UCSD Academic Biography & Bibliography (BioBib) format using AI.

Built by ITS Workplace Technology & Infrastructure Services.

## How It Works

1. Faculty uploads their CV (.docx)
2. App parses the CV and sends it to the TritonAI LiteLLM Gateway
3. AI maps CV content to all BioBib sections (I, II, III)
4. App generates a completed BioBib.docx + a gap report
5. Faculty downloads the BioBib and fills any flagged gaps manually

## Stack

- Next.js 15 (App Router) + TypeScript
- Material UI
- mammoth (CV parsing)
- docx npm (BioBib generation)
- TritonAI LiteLLM Gateway (AI mapping)
- Vercel (deployment)

## Local Development

```bash
cp .env.example .env.local
# Add your LITELLM_API_KEY
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

| Variable | Description |
|---|---|
| `LITELLM_API_KEY` | TritonAI API key |
| `LITELLM_BASE_URL` | Gateway URL (default: https://tritonai-api.ucsd.edu) |
| `LITELLM_MODEL` | Model to use (default: gpt-5.5) |

## Deployment

Push to `main` → Vercel auto-deploys. Set env vars in Vercel dashboard.

## Required Regression Gate

Run `npm run test:release` for every change. Changes that can affect conversion
behavior or generated Word output also require the live real-CV and second-pass
gate:

```bash
npm run test:release:live
```

See [docs/release-regression.md](docs/release-regression.md) for required
environment variables, the semantic acceptance profiles, the five-CV release
cohort, and pass criteria.

## Source Materials

- BioBib instructions: https://academicaffairs.ucsd.edu/_files/aps/forms/word/BioBib-instructions.docx
- APS forms: https://aps.ucsd.edu/tools/forms.html#appointment-for
- Based on dissertation-formatter architecture
