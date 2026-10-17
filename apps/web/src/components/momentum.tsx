'use client';

import { Check, Sprout } from 'lucide-react';
import { getMomentum } from '@fats/domain';
import { useApplications } from './application-provider';
import { useAccount } from './account-provider';

const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function Momentum() {
  const { activityDays, now, loading, error } = useApplications();
  const account = useAccount();
  const unavailable = Boolean(error || account.expired);
  const momentum = now ? getMomentum(activityDays, now) : null;
  const ready = !loading && !unavailable && momentum;

  return (
    <section className="momentum" aria-label="Your momentum">
      <p className="sr-only">
        One active day per Philippine calendar date for saved job-search work.
        Saving a job, changing its status, interview preparation, accepted new
        document content, or a substantive offer review counts. Browsing does
        not. A streak can continue from yesterday while today is open.
      </p>
      <div className="momentum-heading">
        <h2>Your momentum</h2>
        <Sprout size={16} aria-hidden="true" />
      </div>
      {ready ? (
        <>
          <p className="momentum-streak">
            <strong>{momentum.streak}</strong>
            <span>day{momentum.streak === 1 ? '' : 's'} in a row</span>
          </p>
          <ol
            className="momentum-week"
            aria-label="Activity this week, Monday to Sunday"
          >
            {momentum.days.map((day, index) => (
              <li
                key={day.date}
                className={`${day.active ? 'is-active' : ''} ${day.today ? 'is-today' : ''}`}
                aria-current={day.today ? 'date' : undefined}
                aria-label={`${new Intl.DateTimeFormat('en', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${day.date}T00:00:00Z`))}: ${day.active ? 'active' : day.future ? 'upcoming' : day.today ? 'open for today' : 'no recorded activity'}${day.today ? ', today' : ''}`}
              >
                <span className="momentum-day" aria-hidden="true">
                  {weekdays[index]}
                </span>
                <span className="momentum-mark" aria-hidden="true">
                  {day.active ? (
                    <Check size={12} strokeWidth={2.5} />
                  ) : (
                    <span />
                  )}
                </span>
              </li>
            ))}
          </ol>
          <p className="momentum-count">
            <strong>{momentum.activeThisWeek}</strong> active{' '}
            {momentum.activeThisWeek === 1 ? 'day' : 'days'} this week
          </p>
          <p className="momentum-message">
            {!momentum.hasActivity
              ? 'A small step is a lovely start.'
              : momentum.days.some((day) => day.today && day.active)
                ? 'Small steps count. At your pace.'
                : 'Here when you’re ready.'}
          </p>
        </>
      ) : (
        <p className="momentum-message">
          {unavailable
            ? 'Momentum is unavailable. Reconnect your workspace to see your activity.'
            : 'Getting your activity ready…'}
        </p>
      )}
      <p className="momentum-calendar">Mon–Sun · Philippine time</p>
    </section>
  );
}
