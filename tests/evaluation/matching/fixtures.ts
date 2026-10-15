import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  sourceSegments,
  MAX_MATCHING_BYTES,
  type MatchingSources,
} from '@fats/domain';
import { extractResume } from '../../../apps/web/src/server/resume-extraction';
import { validateDocument } from '../../../apps/web/src/server/document-validation';
import { docxFixture } from '../../helpers/document-fixtures';
import { DATASET, type EvaluationCase } from './dataset';

const require = createRequire(
  new URL('../../../apps/web/package.json', import.meta.url),
);
const { PDFDocument } =
  require('pdf-lib') as typeof import('../../../apps/web/node_modules/pdf-lib');
export const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export interface PreparedCase {
  entry: EvaluationCase;
  bytes: Uint8Array;
  extractionMs: number;
  sources: MatchingSources | null;
  state: 'ready' | 'blocked' | 'extraction_failed';
  contentHash: string | null;
}
function xml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
export async function buildResume(entry: EvaluationCase) {
  if (entry.format === 'docx')
    return docxFixture({
      'word/document.xml':
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        entry.resume
          .map((text) => '<w:p><w:r><w:t>' + xml(text) + '</w:t></w:r></w:p>')
          .join('') +
        '</w:body></w:document>',
    });
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(new Date('2026-01-01T00:00:00Z'));
  pdf.setModificationDate(new Date('2026-01-01T00:00:00Z'));
  const page = pdf.addPage([612, 792]);
  let y = 740;
  for (const paragraph of entry.resume) {
    // Short, predictable text lines; no content is clipped from the fixture.
    const words = paragraph.split(' ');
    let line = '';
    for (const word of words) {
      if ((line + word).length > 80) {
        page.drawText(line.trim(), { x: 36, y, size: 10 });
        y -= 15;
        line = '';
      }
      line += word + ' ';
    }
    if (line) {
      page.drawText(line.trim(), { x: 36, y, size: 10 });
      y -= 15;
    }
  }
  return pdf.save();
}
export async function prepareCase(
  entry: EvaluationCase,
): Promise<PreparedCase> {
  const bytes = await buildResume(entry);
  await validateDocument(bytes, 'synthetic.' + entry.format);
  const start = performance.now();
  const extraction = await extractResume(bytes, entry.format);
  const result = {
    entry,
    bytes,
    extractionMs: Math.round(performance.now() - start),
  };
  if (extraction.status !== 'success')
    return {
      ...result,
      sources: null,
      state: 'extraction_failed',
      contentHash: null,
    };
  try {
    const resume = sourceSegments(extraction.lines, 'resume'),
      job = sourceSegments(
        entry.job.map((text, i) => ({ text, location: 'Job line ' + (i + 1) })),
        'job',
      );
    const sources: MatchingSources = {
      resume: resume.segments,
      job: job.segments,
      warnings: extraction.warnings,
    };
    if (
      !sources.resume.length ||
      !sources.job.length ||
      Buffer.byteLength(
        JSON.stringify({ resume: sources.resume, job: sources.job }),
      ) > MAX_MATCHING_BYTES
    )
      throw Error();
    return { ...result, sources, state: 'ready', contentHash: digest(sources) };
  } catch {
    return { ...result, sources: null, state: 'blocked', contentHash: null };
  }
}
export async function pipelineDigest() {
  const files = [
    'dataset.ts',
    'fixtures.ts',
    'harness.ts',
    'grading.ts',
    'run.test.ts',
    '../../../apps/web/src/server/matching-provider.ts',
    '../../../apps/web/src/server/resume-extraction.ts',
    '../../../apps/web/src/server/document-validation.ts',
    '../../../libs/domain/src/matching.ts',
    '../../../pnpm-lock.yaml',
    '../../../vitest.evaluation.config.ts',
  ];
  return digest(
    await Promise.all(
      files.map((path) => readFile(new URL(path, import.meta.url), 'utf8')),
    ),
  );
}
export const datasetDigest = () => digest(DATASET);
