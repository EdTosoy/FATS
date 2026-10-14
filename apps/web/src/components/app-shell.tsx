'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import {
  BookmarkPlus,
  CalendarDays,
  FileText,
  HelpCircle,
  LayoutDashboard,
  BriefcaseBusiness,
  Settings,
  Menu,
  X,
  LockKeyhole,
  ArrowUpRight,
} from 'lucide-react';
import { useApplications } from './application-provider';
import { Brand } from './brand';
import { Button } from './ui';

const navigation = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/applications', label: 'Applications', icon: BriefcaseBusiness },
  { href: '/resumes', label: 'Resumes', icon: FileText },
  { href: '/interviews', label: 'Interviews', icon: CalendarDays },
];
const secondaryNavigation = [
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/help', label: 'Help & guidance', icon: HelpCircle },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { loading, error, openForm } = useApplications();

  function navLinks(items: typeof navigation) {
    return items.map(({ href, label, icon: Icon }) => {
      const active =
        href === '/' ? pathname === '/' : pathname.startsWith(href);
      return (
        <Link
          key={href}
          href={href}
          className={`nav-link ${active ? 'active' : ''}`}
          aria-current={active ? 'page' : undefined}
          onClick={() => setMenuOpen(false)}
        >
          <Icon size={19} aria-hidden="true" />
          {label}
          {active && <span className="nav-dot" aria-hidden="true" />}
        </Link>
      );
    });
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/" aria-label="FATS dashboard" className="brand-link">
          <Brand />
        </Link>
        <p className="nav-label">YOUR WORKSPACE</p>
        <nav aria-label="Main navigation">{navLinks(navigation)}</nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-sprout" aria-hidden="true">
              ✦
            </span>
            <p>
              Small steps.
              <br />
              <strong>Brighter beginnings.</strong>
            </p>
            <span>One application at a time.</span>
          </div>
          <nav aria-label="Support navigation">
            {navLinks(secondaryNavigation)}
          </nav>
          <div className="profile">
            <span className="avatar" aria-hidden="true">
              M
            </span>
            <div>
              <strong>Maria Santos</strong>
              <span>Demo profile · local workspace</span>
            </div>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="desktop-breadcrumb">
            Your workspace <span>/</span>{' '}
            <strong>
              {pathname.startsWith('/applications')
                ? 'Applications'
                : pathname === '/'
                  ? 'Dashboard'
                  : pathname
                      .slice(1)
                      .replace(/^./, (char) => char.toUpperCase())}
            </strong>
          </div>
          <Link href="/" className="mobile-brand" aria-label="FATS dashboard">
            <Brand />
          </Link>
          <div className="topbar-actions">
            <span className="local-label">
              <LockKeyhole size={13} aria-hidden="true" />
              Local workspace
            </span>
            <Button onClick={() => openForm()} disabled={loading || !!error}>
              <BookmarkPlus size={17} aria-hidden="true" />
              <span>Save a job</span>
            </Button>
            <Button
              variant="ghost"
              className="mobile-menu icon-button"
              aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </Button>
          </div>
        </header>
        {menuOpen && (
          <nav
            id="mobile-navigation"
            className="mobile-navigation"
            aria-label="Mobile navigation"
          >
            {navLinks(navigation)}
            <hr />
            {navLinks(secondaryNavigation)}
          </nav>
        )}
        <main id="main-content" className="main-content" tabIndex={-1}>
          {error && (
            <div className="storage-error" role="alert">
              <strong>Let’s keep your data safe.</strong>
              <p>{error}</p>
              <Link className="text-link" href="/help">
                Read recovery guidance{' '}
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
          )}
          {children}
        </main>
        <footer className="workspace-footer">
          <span>Friendly by default. Powerful when needed.</span>
          <span>
            Made for your next beginning <span aria-hidden="true">✦</span>
          </span>
        </footer>
      </div>
    </div>
  );
}
