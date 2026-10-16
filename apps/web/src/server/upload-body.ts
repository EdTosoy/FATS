import { MAX_DOCUMENT_BYTES } from '@fats/domain';
import { WorkspaceError } from './workspace-repository';
import { UPLOAD_TIMEOUT_MS } from './upload-admission';
export async function readUploadBody(
  request: Request,
  timeoutMs = UPLOAD_TIMEOUT_MS,
) {
  const length = request.headers.get('content-length');
  if (
    length !== null &&
    (!/^\d+$/.test(length) || Number(length) > MAX_DOCUMENT_BYTES)
  )
    throw new WorkspaceError('Choose a file of 10 MiB or less.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new WorkspaceError('Choose a nonempty PDF or DOCX.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  const stop = new Promise<never>((_, reject) => {
    abort = () =>
      reject(
        new WorkspaceError(
          'The upload was interrupted. Keep your file and retry.',
          408,
        ),
      );
    timer = setTimeout(
      () =>
        reject(
          new WorkspaceError(
            'The upload took too long. Choose a file of 10 MiB or less and retry.',
            408,
          ),
        ),
      timeoutMs,
    );
    request.signal.addEventListener('abort', abort, { once: true });
  });
  // One fixed-size allocation; no unbounded list of tiny chunks.
  const bytes = Buffer.alloc(MAX_DOCUMENT_BYTES);
  let size = 0;
  try {
    if (request.signal.aborted) abort();
    while (true) {
      const { value, done } = await Promise.race([reader.read(), stop]);
      if (done) break;
      if (size + value.byteLength > MAX_DOCUMENT_BYTES)
        throw new WorkspaceError('Choose a file of 10 MiB or less.', 413);
      bytes.set(value, size);
      size += value.byteLength;
    }
    if (!size) throw new WorkspaceError('Choose a nonempty PDF or DOCX.');
    return bytes.subarray(0, size);
  } catch (error) {
    // Cancellation of an untrusted stream must not delay releasing admission.
    void reader.cancel().catch(() => {});
    if (error instanceof WorkspaceError) throw error;
    throw new WorkspaceError(
      'The upload was interrupted. Keep your file and retry.',
      408,
    );
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}
