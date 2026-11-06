'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  PREPARATION_KINDS,
  type JobApplication,
  type Preparation,
  type PreparationInput,
  type PreparationKind,
} from '@fats/domain';
import { useApplications } from './application-provider';
import { useAccount } from './account-provider';
import { SessionNotice } from './session-notice';
import { Button, Card } from './ui';
import { formatDate } from './application-table';

function failure(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Your preparation could not be saved. Keep your draft and retry.';
}
interface EditorState {
  id: string;
  entry?: Preparation;
  notes?: string;
  opener: HTMLElement | null;
}

export function ApplicationPreparation({
  application,
}: {
  application: JobApplication;
}) {
  const { changePreparation } = useApplications();
  const account = useAccount();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [confirm, setConfirm] = useState<{
    action: 'submit' | 'delete';
    entry: Preparation;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  function edit(entry?: Preparation, notes?: string) {
    setEditor({
      id: entry?.id ?? crypto.randomUUID(),
      entry,
      notes,
      opener:
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
    });
    setError('');
    setNotice('');
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Text copied.');
      setError('');
    } catch {
      setError(
        'Copy is unavailable. Open Edit material, select the text, and copy it manually.',
      );
    }
  }
  async function apply() {
    if (!confirm) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await changePreparation(application.id, {
        action: confirm.action,
        id: confirm.entry.id,
        expected: confirm.entry,
      });
      setNotice(
        confirm.action === 'submit'
          ? 'Submitted copy recorded. Nothing was sent to the employer.'
          : 'Preparation deleted.',
      );
      setConfirm(null);
    } catch (error) {
      setError(failure(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card
      className="tracking-card application-preparation"
      aria-labelledby="preparation-title"
    >
      <div className="preparation-heading">
        <h2 id="preparation-title">Preparation</h2>
        <Button onClick={() => edit()} disabled={busy}>
          New material
        </Button>
      </div>
      <p className="muted">
        Keep job-specific drafts here. Save changes explicitly. Recording a
        submitted copy does not send it or change your application status.
      </p>
      <section
        aria-label="General preparation notes"
        className="preparation-notes"
      >
        <h3>General preparation notes</h3>
        <p className="field-hint">
          Uses this application’s existing Notes field.
        </p>
        <p className="preparation-text">
          {application.notes || 'No general preparation notes yet.'}
        </p>
        <div className="preparation-actions">
          <Button
            variant="secondary"
            onClick={() => edit(undefined, application.notes ?? '')}
            disabled={busy}
          >
            Edit preparation notes
          </Button>
          {application.notes && (
            <Button
              variant="ghost"
              onClick={() => void copy(application.notes!)}
            >
              Copy notes
            </Button>
          )}
        </div>
      </section>
      {account.user ? (
        <p className="field-hint">
          Keep resume selection notes here; record the exact private resume
          version in the existing{' '}
          <a className="text-link" href="#submitted-resume">
            Submitted resume section
          </a>
          . JSON backups preserve preparation text, not document files or live
          links.
        </p>
      ) : (
        <p className="field-hint">
          Resume references can be recorded as filename or version notes.
          Private document selection requires an account; no files are added
          here.
        </p>
      )}
      {!application.preparations?.length && (
        <p className="muted preparation-empty">
          No materials yet. Add a cover letter, screening answer, introduction
          script, portfolio project, or resume reference notes.
        </p>
      )}
      <ul className="preparation-list" aria-label="Preparation materials">
        {application.preparations?.map((entry) => (
          <li key={entry.id}>
            <div className="preparation-heading">
              <h3>{entry.title}</h3>
              <span className="count-pill">
                {entry.state === 'submitted'
                  ? 'Submitted'
                  : entry.state === 'ready'
                    ? 'Ready'
                    : 'Draft'}
              </span>
            </div>
            <p className="field-hint">
              {PREPARATION_KINDS[entry.kind]} · Last saved{' '}
              {formatDate(entry.updatedAt)}
            </p>
            <p className="preparation-text">
              {entry.text || 'No text added yet.'}
            </p>
            {entry.url && (
              <a
                className="text-link preparation-url"
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {entry.url}
              </a>
            )}
            {entry.submitted && (
              <details className="preparation-submitted">
                <summary>
                  Last submitted copy ·{' '}
                  {formatDate(entry.submitted.submittedAt)}
                </summary>
                <p>
                  {entry.submitted.title} ·{' '}
                  {PREPARATION_KINDS[entry.submitted.kind]}
                </p>
                <p className="preparation-text">{entry.submitted.text}</p>
                {entry.submitted.url && (
                  <p className="preparation-url">{entry.submitted.url}</p>
                )}
                <Button
                  variant="ghost"
                  onClick={() =>
                    void copy(entry.submitted!.text || entry.submitted!.url)
                  }
                >
                  Copy submitted text
                </Button>
              </details>
            )}
            <div className="preparation-actions">
              <Button
                variant="secondary"
                onClick={() => edit(entry)}
                disabled={busy}
              >
                Edit material
              </Button>
              <Button
                variant="ghost"
                onClick={() => void copy(entry.text || entry.url)}
                disabled={!entry.text && !entry.url}
              >
                Copy text
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setConfirm({ action: 'submit', entry });
                  setError('');
                }}
                disabled={
                  busy ||
                  entry.state === 'submitted' ||
                  (!entry.text.trim() && !entry.url)
                }
              >
                Record submitted copy
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirm({ action: 'delete', entry });
                  setError('');
                }}
                disabled={busy}
              >
                Delete material
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {confirm && (
        <div
          className="preparation-confirm"
          role="group"
          aria-label="Confirm preparation action"
        >
          <p>
            {confirm.action === 'delete'
              ? `Delete “${confirm.entry.title}” and its last submitted copy? This cannot be undone.`
              : `Record the saved “${confirm.entry.title}” as the copy you actually submitted? This replaces any previous submitted-copy record, while future draft edits keep this copy.`}
          </p>
          <div className="preparation-actions">
            <Button onClick={() => void apply()} disabled={busy}>
              {busy
                ? 'Saving…'
                : confirm.action === 'delete'
                  ? 'Confirm delete material'
                  : 'Confirm submitted copy'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setConfirm(null);
                setError('');
              }}
              disabled={busy}
            >
              Cancel action
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="save-feedback" role="status">
          {notice}
        </p>
      )}
      {editor && (
        <PreparationEditor
          key={editor.id}
          applicationId={application.id}
          editor={editor}
          close={() => setEditor(null)}
        />
      )}
    </Card>
  );
}

function PreparationEditor({
  applicationId,
  editor,
  close,
}: {
  applicationId: string;
  editor: EditorState;
  close: () => void;
}) {
  const { changePreparation } = useApplications();
  const notes = editor.notes !== undefined;
  const original = {
    kind: editor.entry?.kind ?? 'cover-letter',
    title: editor.entry?.title ?? '',
    text: notes ? editor.notes! : (editor.entry?.text ?? ''),
    url: editor.entry?.url ?? '',
    state: editor.entry?.state === 'ready' ? 'ready' : 'draft',
  } satisfies PreparationInput;
  const [input, setInput] = useState<PreparationInput>(original);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const textArea = useRef<HTMLTextAreaElement>(null);
  const dirty = JSON.stringify(input) !== JSON.stringify(original);
  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function requestClose() {
    if (
      !busy &&
      (!dirty || window.confirm('Discard unsaved preparation changes?'))
    )
      close();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await changePreparation(
        applicationId,
        notes
          ? { action: 'notes', text: input.text, expected: editor.notes! }
          : {
              action: 'save',
              id: editor.id,
              input,
              expected: editor.entry ?? null,
            },
      );
      close();
    } catch (error) {
      setError(failure(error));
      setBusy(false);
    }
  }
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(input.text);
      setMessage('Draft text copied.');
    } catch {
      textArea.current?.focus();
      textArea.current?.select();
      setMessage('Text selected. Use your device’s Copy command.');
    }
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            requestClose();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (editor.opener?.isConnected) editor.opener.focus();
          }}
        >
          <Dialog.Title className="dialog-title">
            {notes
              ? 'Edit preparation notes'
              : editor.entry
                ? 'Edit preparation material'
                : 'New preparation material'}
          </Dialog.Title>
          <Dialog.Description className="muted">
            {notes
              ? 'These are the same Notes shown in application details.'
              : 'Keep one material per entry. For screening answers, use the question as the title.'}{' '}
            {editor.entry?.submitted
              ? 'Your last submitted copy stays unchanged until you explicitly record another.'
              : 'Saving here does not submit anything.'}
          </Dialog.Description>
          <form className="job-form" onSubmit={save}>
            <fieldset disabled={busy}>
              {!notes && (
                <>
                  <label>
                    Material type
                    <select
                      aria-label="Material type"
                      value={input.kind}
                      onChange={(event) =>
                        setInput({
                          ...input,
                          kind: event.target.value as PreparationKind,
                          url:
                            event.target.value === 'portfolio' ? input.url : '',
                        })
                      }
                    >
                      {(
                        Object.keys(PREPARATION_KINDS) as PreparationKind[]
                      ).map((kind) => (
                        <option value={kind} key={kind}>
                          {PREPARATION_KINDS[kind]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Title / screening question
                    <input
                      required
                      maxLength={300}
                      value={input.title}
                      onChange={(event) =>
                        setInput({ ...input, title: event.target.value })
                      }
                    />
                  </label>
                </>
              )}
              <label>
                {notes
                  ? 'General preparation notes'
                  : input.kind === 'screening-answer'
                    ? 'Answer text'
                    : 'Material text'}
                <textarea
                  aria-label={
                    notes
                      ? 'General preparation notes'
                      : input.kind === 'screening-answer'
                        ? 'Answer text'
                        : 'Material text'
                  }
                  ref={textArea}
                  rows={8}
                  maxLength={20000}
                  value={input.text}
                  onChange={(event) =>
                    setInput({ ...input, text: event.target.value })
                  }
                />
              </label>
              {!notes && input.kind === 'portfolio' && (
                <label>
                  Portfolio URL
                  <input
                    type="url"
                    maxLength={2048}
                    value={input.url}
                    onChange={(event) =>
                      setInput({ ...input, url: event.target.value })
                    }
                  />
                </label>
              )}
              {!notes && (
                <label>
                  Material readiness
                  <select
                    aria-label="Material readiness"
                    value={input.state}
                    onChange={(event) =>
                      setInput({
                        ...input,
                        state: event.target.value as PreparationInput['state'],
                      })
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="ready">Ready</option>
                  </select>
                </label>
              )}
            </fieldset>
            <p className="field-hint" role="status">
              {busy
                ? 'Saving preparation…'
                : dirty
                  ? 'Unsaved changes. Save explicitly to keep this text.'
                  : 'No unsaved changes.'}
            </p>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            {message && <p className="field-hint">{message}</p>}
            <SessionNotice />
            <div className="preparation-actions">
              <Button type="submit" disabled={busy}>
                {busy
                  ? 'Saving…'
                  : notes
                    ? 'Save preparation notes'
                    : 'Save material'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={requestClose}
              >
                Cancel editing
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void copyDraft()}
                disabled={!input.text}
              >
                Copy draft text
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
