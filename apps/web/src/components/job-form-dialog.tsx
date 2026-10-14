'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { BookmarkPlus, X } from 'lucide-react';
import { APPLICATION_STATUSES, type JobApplication } from '@fats/domain';
import { useApplications } from './application-provider';
import { Button } from './ui';

export function JobFormDialog({
  application,
  opener,
  onClose,
}: {
  application?: JobApplication;
  opener: HTMLElement | null;
  onClose: () => void;
}) {
  const { create, update } = useApplications();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input = {
      title: String(data.get('title') ?? ''),
      company: String(data.get('company') ?? ''),
      sourceUrl: String(data.get('sourceUrl') ?? ''),
      location: String(data.get('location') ?? ''),
      description: String(data.get('description') ?? ''),
    };
    setSaving(true);
    setError(null);
    try {
      if (application) {
        const status =
          APPLICATION_STATUSES.find(
            (status) => status === data.get('status'),
          ) ?? application.status;
        await update(application.id, { ...input, status });
      } else {
        const saved = await create(input);
        router.push(`/applications/${saved.id}`);
      }
      onClose();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Your changes could not be saved. Try again.',
      );
      setSaving(false);
    }
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener?.isConnected) opener.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (saving) event.preventDefault();
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <div className="dialog-heading">
            <span className="icon-tile blue">
              <BookmarkPlus size={22} aria-hidden="true" />
            </span>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                className="icon-button"
                aria-label="Close form"
                disabled={saving}
              >
                <X size={20} />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Title className="dialog-title">
            {application ? 'Edit application' : 'Save a job'}
          </Dialog.Title>
          <Dialog.Description className="muted">
            {application
              ? 'Keep the details and progress up to date.'
              : 'Found something promising? Keep the link and details in one place. Saving here does not apply for the job.'}
          </Dialog.Description>
          <form onSubmit={submit} className="job-form">
            <fieldset disabled={saving}>
              <label>
                Job title <span className="required-note">(required)</span>
                <input
                  name="title"
                  required
                  maxLength={160}
                  defaultValue={application?.title}
                  placeholder="e.g. Junior Software Engineer"
                />
              </label>
              <div className="form-grid">
                <label>
                  Company <span className="required-note">(required)</span>
                  <input
                    name="company"
                    required
                    maxLength={160}
                    defaultValue={application?.company}
                    placeholder="e.g. Acme Philippines"
                  />
                </label>
                <label>
                  Location <span className="required-note">(required)</span>
                  <input
                    name="location"
                    required
                    maxLength={160}
                    defaultValue={application?.location}
                    placeholder="e.g. Makati · Hybrid"
                  />
                </label>
              </div>
              <label>
                Source URL <span className="required-note">(required)</span>
                <input
                  name="sourceUrl"
                  type="url"
                  required
                  maxLength={2048}
                  defaultValue={application?.sourceUrl}
                  placeholder="https://…"
                />
                <span className="field-hint">
                  A link from a job website or the company’s careers page.
                </span>
              </label>
              {application && (
                <label>
                  Status
                  <select name="status" defaultValue={application.status}>
                    {APPLICATION_STATUSES.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Job description{' '}
                <span className="required-note">(optional)</span>
                <textarea
                  name="description"
                  maxLength={20000}
                  rows={4}
                  defaultValue={application?.description}
                  placeholder="Paste the responsibilities, requirements, or anything you want to remember."
                />
              </label>
            </fieldset>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <div className="form-footer">
              <span className="field-hint">Stored in this browser only.</span>
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onClose}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving
                    ? 'Saving…'
                    : application
                      ? 'Save changes'
                      : 'Save job'}
                </Button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
