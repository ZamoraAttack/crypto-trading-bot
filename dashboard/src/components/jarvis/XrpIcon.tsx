interface XrpIconProps {
  className?: string;
}

export default function XrpIcon({ className }: XrpIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 5.5c2.1 0 3.2 1.1 4.4 2.7 1.3 1.7 2.2 2.9 3.6 2.9s2.3-1.2 3.6-2.9c1.2-1.6 2.3-2.7 4.4-2.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 18.5c2.1 0 3.2-1.1 4.4-2.7 1.3-1.7 2.2-2.9 3.6-2.9s2.3 1.2 3.6 2.9c1.2 1.6 2.3 2.7 4.4 2.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
