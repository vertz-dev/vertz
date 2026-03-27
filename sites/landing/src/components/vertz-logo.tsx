import { css } from '@vertz/ui';

const s = css({
  logo: ['h:7'],
});

export function VertzLogo() {
  return (
    <svg
      className={s.logo}
      viewBox="0 0 262 232"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Vertz"
    >
      <path d="M137.986 232L117 203L185.467 113.67L155.731 66H262L137.986 232Z" fill="white" />
      <path d="M110.277 66H16L96.5 174.5L141.365 113.67L110.277 66Z" fill="white" />
    </svg>
  );
}
