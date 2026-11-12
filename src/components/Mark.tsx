// Cursive's mark: the app icon's tile and page with the Markdown asterisk, in the primary
// color of the theme. The same drawing as assets/app-icon.svg, without its margin.
export function Mark(props: { className?: string }) {
  return (
    <svg viewBox="100 100 824 824" aria-hidden className={props.className}>
      <rect
        x="100"
        y="100"
        width="824"
        height="824"
        rx="185.4"
        fill="var(--primary-fill)"
      />
      <rect
        x="256.56"
        y="256.56"
        width="510.88"
        height="510.88"
        rx="85.828"
        fill="var(--primary-foreground)"
      />
      <path
        d="M512 362 L512 662 M382 437 L642 587 M382 587 L642 437"
        stroke="var(--primary-fill)"
        strokeWidth="57.68"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
