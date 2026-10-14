import Link from 'next/link';
import { ArrowUpRight, MapPin } from 'lucide-react';
import type { JobApplication } from '@fats/domain';
import { StatusBadge } from './ui';

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(new Date(value));
}

export function CompanyAvatar({ company }: { company: string }) {
  return (
    <span className="company-avatar" aria-hidden="true">
      {company.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function ApplicationTable({
  applications,
}: {
  applications: JobApplication[];
}) {
  return (
    <div className="application-table">
      <div className="table-head" aria-hidden="true">
        <span>Role & company</span>
        <span>Location</span>
        <span>Status</span>
        <span>Last updated</span>
        <span />
      </div>
      <ul className="application-rows" aria-label="Applications">
        {applications.map((application) => (
          <li key={application.id}>
            <div className="role-cell">
              <CompanyAvatar company={application.company} />
              <div>
                <Link
                  className="role-link"
                  href={`/applications/${application.id}`}
                >
                  {application.title}
                </Link>
                <span className="company-name">{application.company}</span>
              </div>
            </div>
            <span className="location-cell">
              <MapPin size={13} aria-hidden="true" />
              {application.location}
            </span>
            <div className="status-cell">
              <StatusBadge status={application.status} />
            </div>
            <time className="date-cell" dateTime={application.updatedAt}>
              {formatDate(application.updatedAt)}
            </time>
            <Link
              className="row-open"
              href={`/applications/${application.id}`}
              aria-label={`Open ${application.title} at ${application.company}`}
            >
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
