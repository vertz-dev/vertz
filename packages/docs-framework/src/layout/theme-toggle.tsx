export interface ThemeToggleProps {
  defaultTheme?: 'light' | 'dark';
}

export function ThemeToggle({ defaultTheme }: ThemeToggleProps) {
  let currentTheme = defaultTheme ?? 'light';

  function toggle() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
  }

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={toggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
        border: '1px solid var(--docs-border, #e5e7eb)',
        borderRadius: '6px',
        backgroundColor: 'transparent',
        cursor: 'pointer',
        fontSize: '16px',
      }}
    >
      {currentTheme === 'light' ? '\u263E' : '\u2600'}
    </button>
  );
}
