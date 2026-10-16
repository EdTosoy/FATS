import { Worker } from 'node:worker_threads';
export class DocumentWorkerLimit extends Error {}
// Worker constraints cover JS heap/time, not native allocations or process RSS.
export async function finishDocumentWorker<T>(
  worker: Worker,
  timeoutMs = 5000,
): Promise<T> {
  worker.stdout?.resume();
  worker.stderr?.resume();
  try {
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new DocumentWorkerLimit('Document processing limit.')),
        timeoutMs,
      );
      worker.once('message', (message) => {
        clearTimeout(timer);
        resolve(message);
      });
      worker.once('error', () => {
        clearTimeout(timer);
        reject(new Error('Document processing failed.'));
      });
      worker.once('exit', () => {
        clearTimeout(timer);
        reject(new Error('Document processing interrupted.'));
      });
    });
  } finally {
    await worker.terminate();
  }
}
export async function runDocumentWorker<T = boolean>(
  bytes: Uint8Array,
  action: 'validate' | 'extract',
): Promise<T> {
  const worker = new Worker(
    `
    const {parentPort,workerData}=require('node:worker_threads');
    const path=require('node:path'),fs=require('node:fs');
    try {
      const parserPath=[path.join(workerData.root,'apps/web/src/server/docx-parser.mjs'),path.join(workerData.root,'src/server/docx-parser.mjs')].find(p=>fs.existsSync(p));
      const parser=require(parserPath);
      const result=workerData.action==='extract'?parser.extractDocx(workerData.bytes):!!parser.validatedDocxEntries(workerData.bytes);
      parentPort.postMessage({ok:true,result});
    } catch { parentPort.postMessage({ok:false}); }
  `,
    {
      eval: true,
      workerData: { root: process.cwd(), bytes, action },
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 16,
        stackSizeMb: 4,
      },
      stdout: true,
      stderr: true,
    },
  );
  const message = await finishDocumentWorker<{ ok: boolean; result: T }>(
    worker,
  );
  if (!message.ok) throw new Error('Unsupported document.');
  return message.result;
}
