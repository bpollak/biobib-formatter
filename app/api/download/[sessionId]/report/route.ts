import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      error:
        'Compliance reports are now generated directly in the results page. Re-open your results and choose Download Compliance Report.',
    },
    { status: 410 }
  );
}
