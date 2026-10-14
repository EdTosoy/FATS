export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {!compact && (
        <span>
          FATS<span className="brand-caption">Your job-search companion</span>
        </span>
      )}
    </span>
  );
}
