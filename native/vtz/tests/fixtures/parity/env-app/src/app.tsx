export function App() {
  const title = import.meta.env.VITE_APP_TITLE;
  const url = import.meta.env.VITE_API_URL;
  return <div id="root">{title} - {url}</div>;
}
