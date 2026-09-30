export function ThreadGlyph({ className = "h-[26px] w-[26px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 26 26" fill="none" className={className} aria-hidden>
      <path d="M3 20c4-10 8 4 12-6s6-6 8-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="3" cy="20" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <p className={`flex items-center gap-2 font-serif text-[26px] italic leading-none tracking-[-0.01em] text-ink ${className}`}>
      <span className="text-thread">
        <ThreadGlyph />
      </span>
      Ariadne
    </p>
  );
}
