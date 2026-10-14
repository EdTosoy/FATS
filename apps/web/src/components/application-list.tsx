'use client';

import { useState } from 'react';
import {
  APPLICATION_STATUSES,
  filterApplications,
  type ApplicationStatus,
} from '@fats/domain';
import {
  BookmarkPlus,
  BriefcaseBusiness,
  Search,
  SearchX,
  SlidersHorizontal,
} from 'lucide-react';
import { useApplications } from './application-provider';
import { ApplicationTable } from './application-table';
import { Button, Card, EmptyState, PageHeading } from './ui';

export function ApplicationList() {
  const { applications, loading, error, openForm } = useApplications();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ApplicationStatus | 'All'>('All');
  const filtered = filterApplications(applications, query, status);

  return (
    <>
      <PageHeading
        eyebrow="One place for every possibility"
        title="Your applications"
        description="Keep the details together. See how far you’ve come."
        action={
          <Button onClick={() => openForm()} disabled={loading || !!error}>
            <BookmarkPlus size={17} aria-hidden="true" />
            Save a job
          </Button>
        }
      />
      <Card className="tracker-card">
        <div className="tracker-heading">
          <div>
            <h2>Application workspace</h2>
            <p>Saved by you. Organized for you.</p>
          </div>
          <span className="count-pill">
            {loading || error ? '—' : applications.length}{' '}
            {applications.length === 1 ? 'application' : 'applications'}
          </span>
        </div>
        <div className="tracker-controls">
          <label className="search-field">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search applications</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by role, company, location…"
              disabled={loading || !!error}
            />
          </label>
          <label className="filter-field">
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span className="sr-only">Filter by status</span>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as ApplicationStatus | 'All')
              }
              disabled={loading || !!error}
            >
              <option value="All">All statuses</option>
              {APPLICATION_STATUSES.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
        </div>
        {loading ? (
          <p className="loading-state" role="status">
            Loading your applications…
          </p>
        ) : error ? (
          <p className="loading-state">
            Your applications will appear once storage is available.
          </p>
        ) : applications.length === 0 ? (
          <EmptyState
            icon={BriefcaseBusiness}
            title="A blank page. A bright beginning."
            action={
              <Button onClick={() => openForm()}>
                <BookmarkPlus size={17} aria-hidden="true" />
                Save your first job
              </Button>
            }
          >
            <p>
              Found a job on LinkedIn, JobStreet, or a company website?
              <br />
              Save its link and details here, then track your next steps.
            </p>
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No applications match just yet."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('');
                  setStatus('All');
                }}
              >
                Clear search & filters
              </Button>
            }
          >
            <p>Try a different word or choose another status.</p>
          </EmptyState>
        ) : (
          <ApplicationTable applications={filtered} />
        )}
        <div className="tracker-footer" role="status">
          {!loading && !error && (
            <span>
              Showing {filtered.length} of {applications.length} applications
            </span>
          )}
          <span>Most recently updated first</span>
        </div>
      </Card>
      <p className="page-footnote">
        Saving a job in FATS doesn’t submit an application. Apply through the
        original job website.
      </p>
    </>
  );
}
