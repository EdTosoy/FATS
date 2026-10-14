import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import type { ApplicationStatus } from '@fats/domain';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  return (
    <button className={`button button-${variant} ${className}`} {...props} />
  );
}

export function ActionLink({
  href,
  children,
  variant = 'primary',
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  return (
    <Link className={`button button-${variant}`} href={href}>
      {children}
    </Link>
  );
}

export function Card({
  className = '',
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <section className={`card ${className}`} {...props} />;
}

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span className={`status status-${status.toLowerCase()}`}>
      <span aria-hidden="true" />
      {status}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="icon-tile mint">
        <Icon size={25} aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      <div className="empty-copy">{children}</div>
      {action}
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="page-title" tabIndex={-1}>
          {title}
        </h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function TextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link className="text-link" href={href}>
      {children}
      <ArrowRight size={15} aria-hidden="true" />
    </Link>
  );
}
