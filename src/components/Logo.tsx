/** Amortas loop mark. Colour comes from `currentColor`. */
export function LogoMark({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="56 36 734 458" className={className} fill="none" aria-hidden="true">
      <path
        d="M262 378 C215 455 116 462 98 376 C90 304 155 260 228 262 C335 280 450 425 644 437 C752 442 756 345 711 267 C676 199 627 66 543 77 C488 86 452 145 386 238"
        stroke="currentColor"
        strokeWidth="58"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Orange mark + "Amortas" wordmark. `size` scales the whole lockup. */
export function Logo({
  size = "md",
  tone = "light",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  /** "light" for white surfaces (charcoal wordmark), "dark" for charcoal surfaces (white wordmark). */
  tone?: "light" | "dark";
  className?: string;
}) {
  const mark = { sm: "h-6", md: "h-7 sm:h-8", lg: "h-9" }[size];
  const text = { sm: "text-xl", md: "text-[22px] sm:text-2xl", lg: "text-[30px]" }[size];
  return (
    <span role="img" aria-label="Amortas" className={`inline-flex items-center gap-2.5 shrink-0 ${className}`}>
      <LogoMark className={`${mark} w-auto text-[#FF5A00]`} />
      <span aria-hidden="true" className={`${text} font-extrabold tracking-[-0.04em] leading-none ${tone === "dark" ? "text-white" : "text-[#2E2E2E]"}`}>
        Amortas
      </span>
    </span>
  );
}
