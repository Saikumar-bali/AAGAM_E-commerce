import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const dynamic = 'force-static';

const androidLauncherLogo = resolve(
  process.cwd(),
  '../mobile-customer/android/app/src/main/res/drawable-nodpi/aagam_launcher_logo.png',
);

export async function GET() {
  const logo = await readFile(androidLauncherLogo);
  return new Response(new Uint8Array(logo), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
