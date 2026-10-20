import s from './workspace.module.css';

export function SyntheticPage({ page }: { page: string }) {
  return (
    <div className={s.documentContent} aria-hidden="true">
      <header className={s.letterhead}>
        <div className={s.employerSymbol}>h.</div>
        <div>
          <strong>harborlight</strong>
          <span>LABS · FICTIONAL COMPANY</span>
        </div>
        <small>
          PEOPLE & CULTURE
          <br />
          MANILA, PHILIPPINES
        </small>
      </header>
      <div className={s.documentRule} />
      <div className={s.documentKicker}>YOUR NEXT CHAPTER</div>
      <h2>
        {page === 'offer'
          ? 'A place to begin.'
          : page === 'details'
            ? 'A little about you.'
            : 'Ready for day one.'}
      </h2>
      <p className={s.documentSubtitle}>
        {page === 'offer'
          ? 'Employment offer · Junior Data Analyst'
          : page === 'details'
            ? 'New graduate · Personal details form'
            : 'Your joining checklist'}
      </p>
      {page === 'offer' ? (
        <>
          <p>20 October 2026</p>
          <p>Dear Alex Rivera,</p>
          <p>
            We are delighted to invite you to join Harborlight Labs as a Junior
            Data Analyst. We look forward to the curiosity and fresh perspective
            you will bring to our team.
          </p>
          <div className={s.terms}>
            <div>
              <span>YOUR ROLE</span>
              <strong>Junior Data Analyst</strong>
            </div>
            <div>
              <span>MONTHLY BASE PAY</span>
              <strong>PHP 30,000</strong>
            </div>
            <div>
              <span>PROPOSED START</span>
              <strong>02 November 2026</strong>
            </div>
            <div>
              <span>WORK ARRANGEMENT</span>
              <strong>Hybrid · Manila</strong>
            </div>
          </div>
          <p>
            This is a fictional offer for design review only. It creates no
            employment relationship.
          </p>
          <p>
            To continue, sign and date below. Keep a completed copy for your
            records.
          </p>
          <div className={s.signatureLines}>
            <div>
              <span>Signature</span>
            </div>
            <div>
              <span>Date</span>
            </div>
          </div>
          <p className={s.printedName}>Alex Rivera · Synthetic graduate</p>
        </>
      ) : page === 'details' ? (
        <>
          <p>
            Please complete the supported fields below. All information in this
            prototype is fictional and remains in this tab.
          </p>
          <div className={s.formLabel} style={{ top: 270 }}>
            Full name <span>Supported field</span>
          </div>
          <div className={s.formLabel} style={{ top: 360 }}>
            Preferred name <span>Supported field</span>
          </div>
          <div className={s.formLabel} style={{ top: 450 }}>
            Emergency contact <span>Supported field</span>
          </div>
          <div className={s.formLabel} style={{ top: 540 }}>
            A note for your first day
          </div>
          <div className={s.ruledLines} />
        </>
      ) : (
        <>
          <p>
            A few simple steps before your first day. Place a checkmark beside a
            completed item, or add a note anywhere on this page.
          </p>
          <div className={s.checklistItems}>
            {[
              'Review your offer and ask any questions',
              'Complete your personal details',
              'Prepare the requested documents',
              'Confirm your first-day arrangements',
            ].map((text) => (
              <div key={text}>
                <i />
                {text}
              </div>
            ))}
          </div>
          <div className={s.documentNote}>
            <strong>One step at a time.</strong>
            <p>
              Your next beginning does not need to be perfect. Bring your
              questions, your curiosity, and yourself.
            </p>
          </div>
        </>
      )}
      <footer className={s.documentFooter}>
        <span>SYNTHETIC DOCUMENT · DESIGN REVIEW ONLY</span>
        <span>HARBORLIGHT LABS</span>
      </footer>
    </div>
  );
}
