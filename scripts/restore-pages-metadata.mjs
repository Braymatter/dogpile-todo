import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const output = process.env.PAGES_OUTPUT ?? 'docs';
const cname = process.env.PAGES_CNAME ?? 'dogpile.dev';

await mkdir(output, { recursive: true });
await writeFile(join(output, '.nojekyll'), '\n');
await writeFile(join(output, 'CNAME'), `${cname}\n`);
