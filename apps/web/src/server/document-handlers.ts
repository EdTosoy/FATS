import { admitUpload } from './upload-admission';
import { readUploadBody } from './upload-body';
import { assertActiveAccount } from './account-lifecycle';
import { DocumentValidationError } from '@fats/domain';
import type { Services } from './services';
import { PostgresDocumentRepository } from './document-repository';
import {
  getDocumentStorage,
  isStorageKey,
  type DocumentStorage,
} from './document-storage';
import { WorkspaceError } from './workspace-repository';
import {
  requireOrigin,
  readJson,
  textField,
  privateHeaders,
  errorResponse,
} from './http';

export async function handleDocuments(
  request: Request,
  services: Services,
  storage?: DocumentStorage,
): Promise<Response> {
  let release: (() => Promise<void>) | undefined;
  try {
    // Uploads use a bounded raw body and JSON metadata header, avoiding an
    // unbounded multipart parser. The same exact-origin rules apply to writes.
    const isUpload = request.method === 'PUT';
    requireOrigin(
      isUpload
        ? new Request(request.url, {
            method: 'PUT',
            headers: new Headers({
              ...Object.fromEntries(request.headers),
              'content-type': 'application/json',
            }),
          })
        : request,
      services.origin,
    );
    const session = await services.auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    });
    if (!session)
      throw new WorkspaceError(
        'Your session ended. Sign in again to use your document library.',
        401,
      );
    if (!session.user.emailVerified)
      return Response.json(
        {
          error: 'Verify your email before opening your documents.',
          code: 'EMAIL_UNVERIFIED',
        },
        { status: 403, headers: privateHeaders },
      );
    await assertActiveAccount(services.pool, session.user.id);
    const expected = request.headers.get('x-fats-account');
    if (expected && expected !== session.user.id)
      return Response.json(
        {
          error:
            'Your signed-in account changed. Reopen this workspace before saving.',
          code: 'ACCOUNT_CHANGED',
        },
        { status: 409, headers: privateHeaders },
      );
    let adapter: DocumentStorage;
    try {
      adapter = storage ?? getDocumentStorage();
    } catch {
      throw new WorkspaceError(
        'Private document storage is not configured. Ask the local operator to set FATS_DOCUMENTS_DIR to a persistent private directory, then restart FATS.',
        503,
      );
    }
    const repository = new PostgresDocumentRepository(
      services.pool,
      session.user.id,
      adapter,
    );
    const url = new URL(request.url);
    if (request.method === 'GET') {
      const version = url.searchParams.get('version');
      if (!version)
        return Response.json(await repository.library(), {
          headers: privateHeaders,
        });
      if (!isStorageKey(version))
        throw new WorkspaceError('Document version not found.', 404);
      const { row, bytes } = await repository.download(version);
      const preview = url.searchParams.get('preview') === '1';
      if (preview && row.format !== 'pdf')
        throw new WorkspaceError(
          'Only PDFs support preview. Download this DOCX to view it on your device.',
          415,
        );
      // Isolated PDF viewer; no document HTML, scripts, navigation or forms.
      const headers = {
        ...privateHeaders,
        'Content-Type':
          row.format === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Length': String(bytes.length),
        'Content-Disposition': `${preview ? 'inline' : 'attachment'}; filename="document.${row.format}"; filename*=UTF-8''${encodeURIComponent(row.original_filename).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16))}`,
        'Content-Security-Policy':
          "sandbox; default-src 'none'; frame-ancestors 'self'",
        'Cross-Origin-Resource-Policy': 'same-origin',
        'X-Frame-Options': 'SAMEORIGIN',
      };
      return new Response(new Uint8Array(bytes), { headers });
    }
    if (isUpload) {
      if (
        request.headers.get('content-type')?.split(';')[0].trim() !==
        'application/octet-stream'
      )
        throw new WorkspaceError(
          'Send document bytes as application/octet-stream.',
          415,
        );
      let meta: Record<string, unknown>;
      try {
        const raw = request.headers.get('x-fats-upload') ?? '';
        if (raw.length > 8192) throw new Error();
        meta = JSON.parse(decodeURIComponent(raw));
        if (!meta || typeof meta !== 'object' || Array.isArray(meta))
          throw new Error();
      } catch {
        throw new WorkspaceError('Choose a file and valid document details.');
      }
      if ('userId' in meta || 'user_id' in meta || 'owner' in meta)
        throw new WorkspaceError(
          'Ownership comes from your signed-in account.',
        );
      if (
        typeof meta.requestId !== 'string' ||
        !isStorageKey(meta.requestId) ||
        (meta.documentId !== undefined &&
          (typeof meta.documentId !== 'string' ||
            !isStorageKey(meta.documentId)))
      )
        throw new WorkspaceError('Use a valid upload request.');
      release = await admitUpload(services.pool, session.user.id);
      const bytes = await readUploadBody(request);
      const result = await repository.uploadAdmitted(bytes, meta.filename, {
        name: meta.name,
        category: meta.category,
        documentId: meta.documentId as string | undefined,
        requestId: meta.requestId,
      });
      return Response.json(result, { headers: privateHeaders });
    }
    if (request.method !== 'POST')
      throw new WorkspaceError('Method not allowed.', 405);
    const row = await readJson(request, 8192);
    if ('userId' in row || 'user_id' in row || 'owner' in row)
      throw new WorkspaceError('Ownership comes from your signed-in account.');
    const id = () => {
      const value = textField(row, 'id');
      if (!isStorageKey(value))
        throw new WorkspaceError('Document not found.', 404);
      return value;
    };
    switch (row.action) {
      case 'edit':
        await repository.edit(id(), {
          name: row.name,
          category: row.category,
          archived: row.archived,
          isDefault: row.isDefault,
        });
        break;
      case 'delete':
        if (row.confirmed !== true)
          throw new WorkspaceError('Confirm document deletion first.');
        await repository.delete(id());
        break;
      case 'associate': {
        const applicationId = textField(row, 'applicationId');
        if (
          !applicationId ||
          applicationId.length > 256 ||
          (row.versionId !== null &&
            (typeof row.versionId !== 'string' || !isStorageKey(row.versionId)))
        )
          throw new WorkspaceError(
            'Choose an application and a resume version.',
          );
        if (row.confirmed !== true)
          throw new WorkspaceError(
            'Explicitly confirm the submitted resume version.',
          );
        await repository.associate(
          applicationId,
          row.versionId as string | null,
        );
        break;
      }
      default:
        throw new WorkspaceError('Unknown document action.');
    }
    return Response.json({ success: true }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof DocumentValidationError)
      return Response.json(
        { error: error.message },
        { status: 400, headers: privateHeaders },
      );
    return errorResponse(error);
  } finally {
    await release?.();
  }
}
