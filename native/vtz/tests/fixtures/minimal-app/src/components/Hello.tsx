interface HelloProps {
  name: string;
}

export function Hello({ name }: HelloProps) {
  return <div class="greeting">Hello, {name}!</div>;
}
