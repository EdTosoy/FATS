'use client';
import { useEffect, useState, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  taskGroup,
  nextActions,
  type JobApplication,
  type ApplicationTask,
  type TaskInput,
  type TaskChange,
  type TaskGroup,
} from '@fats/domain';
import { useApplications } from './application-provider';
import { useOffers } from './offer-provider';
import { Button, Card } from './ui';
import { SessionNotice } from './session-notice';
const groups: TaskGroup[] = ['Overdue', 'Due today', 'Upcoming', 'Completed'];
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Task could not be saved. Keep your inputs and retry.';
export function ApplicationTasks({
  application,
}: {
  application: JobApplication;
}) {
  const { changeTask, now } = useApplications();
  const [editor, setEditor] = useState<{
      id: string;
      task?: ApplicationTask;
      opener: HTMLElement;
    } | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState<ApplicationTask | null>(null);
  async function change(value: TaskChange) {
    setBusy(true);
    setError('');
    try {
      await changeTask(application.id, value);
      setDeleting(null);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card
      className="tracking-card application-tasks"
      aria-label="Application tasks"
    >
      <div className="preparation-heading">
        <h2>Tasks &amp; next actions</h2>
        <Button
          disabled={busy}
          onClick={(event) =>
            setEditor({ id: crypto.randomUUID(), opener: event.currentTarget })
          }
        >
          New task
        </Button>
      </div>
      <p className="muted">
        Tasks are manual reminders. Completing one does not change application,
        interview, or offer status. Interviews and offer deadlines remain in
        their existing sections.
      </p>
      {!application.tasks?.length && (
        <p>
          No tasks yet. Add a follow-up, assessment deadline, or another next
          step.
        </p>
      )}
      {now &&
        groups.map((group) => {
          const rows = (application.tasks ?? [])
            .filter((task) => taskGroup(task, now) === group)
            .sort((a, b) =>
              (a.dueAt ?? a.dueDate).localeCompare(b.dueAt ?? b.dueDate),
            );
          return rows.length ? (
            <section key={group} aria-label={`${group} tasks`}>
              <h3>{group}</h3>
              <ul className="preparation-list">
                {rows.map((task) => (
                  <li key={task.id}>
                    <h4>{task.title}</h4>
                    <p>
                      {task.dueDate}
                      {task.dueTime && ` · ${task.dueTime}`} · {task.timeZone}
                    </p>
                    <p className="preparation-text">{task.notes}</p>
                    {task.completedAt && (
                      <p>
                        Completed{' '}
                        {new Date(task.completedAt).toLocaleString('en-PH', {
                          timeZone: task.timeZone,
                        })}{' '}
                        · {task.timeZone}
                      </p>
                    )}
                    <div className="preparation-actions">
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={(event) =>
                          setEditor({
                            id: task.id,
                            task,
                            opener: event.currentTarget,
                          })
                        }
                      >
                        Edit task
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void change({
                            action:
                              task.state === 'pending' ? 'complete' : 'reopen',
                            id: task.id,
                            expected: task,
                          })
                        }
                      >
                        {task.state === 'pending'
                          ? 'Complete task'
                          : 'Reopen task'}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setDeleting(task)}
                      >
                        Delete task
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null;
        })}
      {deleting && (
        <div className="preparation-confirm">
          <p>
            Delete “{deleting.title}”? This removes this task, not its
            application.
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              void change({
                action: 'delete',
                id: deleting.id,
                expected: deleting,
              })
            }
          >
            Confirm delete task
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setDeleting(null)}
          >
            Cancel deletion
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {editor && (
        <TaskEditor
          applicationId={application.id}
          editor={editor}
          close={() => setEditor(null)}
        />
      )}
    </Card>
  );
}
function TaskEditor({
  applicationId,
  editor,
  close,
}: {
  applicationId: string;
  editor: { id: string; task?: ApplicationTask; opener: HTMLElement };
  close: () => void;
}) {
  const { changeTask } = useApplications();
  const initial: TaskInput = {
    title: editor.task?.title ?? '',
    notes: editor.task?.notes ?? '',
    dueDate: editor.task?.dueDate ?? '',
    dueTime: editor.task?.dueTime ?? '',
    timeZone: editor.task?.timeZone ?? 'Asia/Manila',
    occurrence: editor.task?.occurrence ?? '',
  };
  const [input, setInput] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const dirty = JSON.stringify(input) !== JSON.stringify(initial);
  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function leave() {
    if (!busy && (!dirty || window.confirm('Discard unsaved task changes?')))
      close();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await changeTask(applicationId, {
        action: 'save',
        id: editor.id,
        input,
        expected: editor.task ?? null,
      });
      close();
    } catch (error) {
      setError(message(error));
      setBusy(false);
    }
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) leave();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            leave();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (editor.opener.isConnected) editor.opener.focus();
          }}
        >
          <Dialog.Title className="dialog-title">
            {editor.task ? 'Edit task' : 'New task'}
          </Dialog.Title>
          <Dialog.Description>
            Choose a due date and timezone. An optional time makes this an exact
            deadline; otherwise it stays due throughout that calendar day.
            Saving does not complete the task.
          </Dialog.Description>
          <form className="job-form" onSubmit={save}>
            <fieldset disabled={busy}>
              <label>
                Task title
                <input
                  required
                  maxLength={160}
                  value={input.title}
                  onChange={(event) =>
                    setInput({ ...input, title: event.target.value })
                  }
                />
              </label>
              <label>
                Task notes
                <textarea
                  aria-label="Task notes"
                  rows={4}
                  maxLength={20000}
                  value={input.notes}
                  onChange={(event) =>
                    setInput({ ...input, notes: event.target.value })
                  }
                />
              </label>
              <div className="form-grid">
                <label>
                  Due date
                  <input
                    required
                    type="date"
                    value={input.dueDate}
                    onChange={(event) =>
                      setInput({
                        ...input,
                        dueDate: event.target.value,
                        occurrence: '',
                      })
                    }
                  />
                </label>
                <label>
                  Due time (optional)
                  <input
                    type="time"
                    value={input.dueTime}
                    onChange={(event) =>
                      setInput({
                        ...input,
                        dueTime: event.target.value,
                        occurrence: '',
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Task timezone
                <input
                  required
                  maxLength={100}
                  value={input.timeZone}
                  onChange={(event) =>
                    setInput({
                      ...input,
                      timeZone: event.target.value,
                      occurrence: '',
                    })
                  }
                />
                <span className="field-hint">
                  IANA timezone, for example Asia/Manila or America/New_York.
                </span>
              </label>
              {input.dueTime && (
                <label>
                  Repeated clock time
                  <select
                    aria-label="Repeated clock time"
                    value={input.occurrence}
                    onChange={(event) =>
                      setInput({
                        ...input,
                        occurrence: event.target
                          .value as TaskInput['occurrence'],
                      })
                    }
                  >
                    <option value="">
                      Choose only if this time occurs twice
                    </option>
                    <option value="earlier">First occurrence</option>
                    <option value="later">Second occurrence</option>
                  </select>
                </label>
              )}
            </fieldset>
            <p className="field-hint">
              {dirty
                ? 'Unsaved changes. Save explicitly to keep them.'
                : 'No unsaved changes.'}
            </p>
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
            <SessionNotice />
            <div className="preparation-actions">
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save task'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={leave}
              >
                Cancel editing task
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function NextActions() {
  const { applications, interviews, now, changeTask } = useApplications();
  const { offers, error: offerError, loading: offersLoading } = useOffers();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const actions = now
    ? nextActions(applications, interviews, offers, now).filter(
        (row) => row.group !== 'Completed',
      )
    : [];
  async function complete(applicationId: string, task: ApplicationTask) {
    setBusy(true);
    setError('');
    try {
      await changeTask(applicationId, {
        action: 'complete',
        id: task.id,
        expected: task,
      });
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="tracking-card next-actions" aria-label="Next actions">
      <h2>Next actions</h2>
      <p className="muted">
        Your pending tasks, scheduled interviews, and active offer response
        deadlines. Existing interviews and offers are shown directly, not copied
        into tasks.
      </p>
      {offersLoading && <p>Loading offer deadlines…</p>}
      {offerError && (
        <p className="error-message">
          Offer deadlines unavailable: {offerError}
        </p>
      )}
      {!actions.length && !offersLoading && !offerError && (
        <p>
          No pending actions. Add a task from an application when you have a
          next step to track.
        </p>
      )}
      {groups
        .filter((group) => group !== 'Completed')
        .map((group) => {
          const rows = actions.filter((row) => row.group === group);
          return rows.length ? (
            <section aria-label={`${group} next actions`} key={group}>
              <h3>{group}</h3>
              <ul className="preparation-list">
                {rows.map((row) => (
                  <li key={row.id}>
                    <strong>{row.title}</strong>
                    <p>
                      {row.date} · {row.timeZone} · {row.source}
                    </p>
                    <p>
                      <a
                        className="text-link"
                        href={`/applications/${encodeURIComponent(row.applicationId)}`}
                      >
                        {
                          applications.find(
                            (app) => app.id === row.applicationId,
                          )?.company
                        }{' '}
                        · Related application
                      </a>
                    </p>
                    {row.task ? (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void complete(row.applicationId, row.task!)
                        }
                      >
                        Complete task
                      </Button>
                    ) : (
                      <a className="text-link" href={row.href}>
                        Review {row.source}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null;
        })}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </Card>
  );
}
