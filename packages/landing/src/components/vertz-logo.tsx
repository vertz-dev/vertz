import { css } from '@vertz/ui';

const s = css({
  logo: ['h:7'],
});

export function VertzLogo() {
  return (
    <svg
      className={s.logo}
      viewBox="0 0 298 298"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Vertz"
    >
      <path d="M120.277 66H26L106.5 174.5L151.365 113.67L120.277 66Z" fill="#E8E4DC" />
      <path d="M147.986 232L127 203L195.467 113.67L165.731 66H272L147.986 232Z" fill="#E8E4DC" />
    </svg>
  );
}
