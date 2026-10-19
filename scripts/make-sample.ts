// Writes a synthetic Takeout-style mbox for manual testing: `npm run sample [count] [out]`
import { writeFileSync } from 'node:fs';
import { buildSampleMbox } from '../tests/fixture.ts';

const fillers = Number(process.argv[2] ?? 300);
const out = process.argv[3] ?? 'sample.mbox';
const bytes = buildSampleMbox(fillers);
writeFileSync(out, bytes);
console.log(`Wrote ${out} (${bytes.length.toLocaleString()} bytes, ${fillers + 9} messages)`);
