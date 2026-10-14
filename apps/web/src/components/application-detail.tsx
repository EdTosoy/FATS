'use client';

import { useState } from 'react';
import { APPLICATION_STATUSES, type ApplicationStatus } from '@fats/domain';
import {
  ArrowLeft,
  ArrowUpRight,
  FileText,
  MapPin,
  Pencil,
  Link as LinkIcon,
  Check,
} from 'lucide-react';
import Link from 'next/link';
import { useApplications } from './application-provider';
import { CompanyAvatar, formatDate } from './application-table';
import { ActionLink, Button, Card, PageHeading, StatusBadge } from './ui';

export function ApplicationDetail({ id }: { id: string }) {
  const {
    applications,
    loading,
    error: storageError,
    update,
    openForm,
  } = useApplications();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const application = applications.find((application) => application.id === id);
  if (loading)
    return (
      <p className="loading-state" role="status">
        Loading application…
      </p>
    );
  if (storageError)
    return (
      <PageHeading
        eyebrow="Application details"
        title="Your data is unavailable."
        description="Follow the recovery guidance above, then refresh to open this application."
      />
    );
  if (!application)
    return (
      <>
        <PageHeading
          eyebrow="Application details"
          title="We couldn’t find this application."
          description="It may have been saved in another browser or workspace."
        />
        <ActionLink href="/applications" variant="secondary">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to applications
        </ActionLink>
      </>
    );

  async function changeStatus(status: ApplicationStatus) {
    if (!application) return;
    setSaving(true);
    setError(null);
    setMessage('');
    try {
      await update(application.id, { ...application, status });
      setMessage(`Status updated to ${status}.`);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Status could not be saved. Try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Link className="back-link" href="/applications">
        <ArrowLeft size={16} aria-hidden="true" />
        Back to applications
      </Link>
      <PageHeading
        eyebrow="One opportunity. Your own pace."
        title={application.title}
        description={application.company}
        action={
          <Button variant="secondary" onClick={() => openForm(application)}>
            <Pencil size={16} aria-hidden="true" />
            Edit details
          </Button>
        }
      />
      <div className="detail-grid">
        <div>
          <Card className="detail-overview">
            <div className="detail-company">
              <CompanyAvatar company={application.company} />
              <div>
                <h2>{application.company}</h2>
                <p>
                  <MapPin size={15} aria-hidden="true" />
                  {application.location}
                </p>
              </div>
              <StatusBadge status={application.status} />
            </div>
            <div className="source-link">
              <span>
                <LinkIcon size={16} aria-hidden="true" />
                Original job posting
              </span>
              <a
                href={application.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open job website <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
            <p className="field-hint source-url">{application.sourceUrl}</p>
          </Card>
          <Card className="description-card">
            <div className="section-heading">
              <h2>
                <FileText size={18} aria-hidden="true" />
                Job description
              </h2>
            </div>
            {application.description ? (
              <p className="job-description">{application.description}</p>
            ) : (
              <div className="description-empty">
                <p>No description added yet.</p>
                <span>
                  Paste the requirements or responsibilities to keep them handy,
                  even if the original posting changes.
                </span>
                <Button
                  variant="secondary"
                  onClick={() => openForm(application)}
                >
                  <Pencil size={15} aria-hidden="true" />
                  Add a description
                </Button>
              </div>
            )}
          </Card>
        </div>
        <div>
          <Card className="progress-card">
            <h2>Your progress</h2>
            <p className="muted">
              Update this after taking a step on the original job website.
            </p>
            <label className="status-label">
              Application status
              <select
                value={application.status}
                disabled={saving}
                onChange={(event) =>
                  void changeStatus(event.target.value as ApplicationStatus)
                }
              >
                {APPLICATION_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <div className="save-feedback" role="status">
              {saving ? (
                'Saving status…'
              ) : message ? (
                <>
                  <Check size={15} aria-hidden="true" />
                  {message}
                </>
              ) : (
                'Changes save automatically.'
              )}
            </div>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <hr />
            <dl>
              <div>
                <dt>Saved on</dt>
                <dd>{formatDate(application.createdAt)}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{formatDate(application.updatedAt)}</dd>
              </div>
            </dl>
          </Card>
          <div className="gentle-note">
            <span aria-hidden="true">✦</span>
            <h3>Every step counts.</h3>
            <p>
              Changing a status helps you stay organized. It doesn’t contact the
              company or apply on your behalf.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
