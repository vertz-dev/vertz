const topbarStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: '52px',
  padding: '0 24px',
  borderBottom: '1px solid var(--color-border)',
  background: 'var(--color-card)',
};

const titleStyle = {
  fontSize: '14px',
  fontWeight: '600',
  color: 'var(--color-foreground)',
};

const badgeStyle = {
  fontSize: '11px',
  padding: '2px 8px',
  borderRadius: '9999px',
  background: 'var(--color-secondary)',
  color: 'var(--color-secondary-foreground)',
};

interface TopbarProps {
  title: string;
}

export function Topbar(props: TopbarProps) {
  return (
    <header style={topbarStyle}>
      <span style={titleStyle}>{props.title}</span>
      <span style={badgeStyle}>Local</span>
    </header>
  );
}
