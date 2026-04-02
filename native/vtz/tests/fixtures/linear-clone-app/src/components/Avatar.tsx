interface AvatarProps {
  name: string;
  url?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Avatar({ name, url, size = 'sm' }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((part: string) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const sizeClass = `avatar-${size}`;

  return (
    <div class={`avatar ${sizeClass}`} title={name}>
      {url ? (
        <img src={url} alt={name} class="avatar-img" />
      ) : (
        <span class="avatar-initials">{initials}</span>
      )}
    </div>
  );
}
