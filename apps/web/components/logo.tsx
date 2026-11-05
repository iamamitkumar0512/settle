import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" aria-label="Settle home" className="inline-flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect width="28" height="28" rx="8" fill="#C8F04D" />
        <path
          d="M8 10.5h9M11 17.5h9"
          stroke="#161C04"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <span className="display text-xl">Settle</span>
    </Link>
  );
}
