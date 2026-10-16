import Image from 'next/image';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <Image
        className="brand-mark"
        src="/brand/icon.svg"
        width={48}
        height={48}
        alt={compact ? 'FATS' : ''}
      />
      {!compact && (
        <span>
          FATS<span className="brand-caption">Your job-search companion</span>
        </span>
      )}
    </span>
  );
}
