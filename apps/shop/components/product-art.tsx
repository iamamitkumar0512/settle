const LIGHT = "#f2f4f7";

// Simple drawings, so the sample store needs no photographs.
const ART: Record<string, React.ReactNode> = {
  masala: (
    <>
      <rect x="62" y="30" width="76" height="16" rx="3" fill={LIGHT} opacity="0.95" />
      <rect x="66" y="46" width="68" height="74" rx="4" fill={LIGHT} opacity="0.72" />
      <circle cx="100" cy="82" r="20" fill="none" stroke="#c8f04d" strokeWidth="3" />
      <path d="M92 86c6-14 12-14 16-14-2 10-8 16-16 14z" fill="#c8f04d" />
    </>
  ),
  kulhad: (
    <>
      <path d="M36 62h40l-7 56H43z" fill={LIGHT} opacity="0.55" />
      <path d="M124 62h40l-7 56h-26z" fill={LIGHT} opacity="0.55" />
      <path d="M76 44h48l-8 74H84z" fill={LIGHT} opacity="0.92" />
      <ellipse cx="100" cy="44" rx="24" ry="5" fill="#c8f04d" />
      <ellipse cx="56" cy="62" rx="20" ry="4" fill="#c8f04d" opacity="0.7" />
      <ellipse cx="144" cy="62" rx="20" ry="4" fill="#c8f04d" opacity="0.7" />
    </>
  ),
  ginger: (
    <>
      <path d="M100 26c0 12 18 8 26 20" fill="none" stroke={LIGHT} strokeWidth="2.5" />
      <rect x="118" y="44" width="24" height="18" rx="2" fill="#c8f04d" />
      <path d="M68 52h64l8 14v50a6 6 0 0 1-6 6H66a6 6 0 0 1-6-6V66z" fill={LIGHT} opacity="0.75" />
      <path d="M100 74c14 10 14 26 0 36-14-10-14-26 0-36zM100 74v36" fill="none" stroke="#3f4d22" strokeWidth="3" />
    </>
  ),
};

export function ProductArt({ id, tone }: { id: string; tone: string }) {
  return (
    <div
      className="swatch"
      style={{ background: `radial-gradient(circle at 50% 35%, ${tone}, var(--sunken) 78%)` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 150" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        {ART[id]}
      </svg>
    </div>
  );
}
