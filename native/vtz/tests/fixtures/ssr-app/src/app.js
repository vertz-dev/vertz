// SSR test app — plain JS (no JSX compilation needed).
// Exports an App component function for SSR rendering via ssrRenderSinglePass.

export function App() {
  const root = document.createElement('div');
  root.setAttribute('id', 'root');

  // Header
  const header = document.createElement('header');
  header.setAttribute('class', 'app-header');
  const h1 = document.createElement('h1');
  h1.appendChild(document.createTextNode('SSR Test App'));
  header.appendChild(h1);

  const nav = document.createElement('nav');
  const links = [['/', 'Home'], ['/tasks', 'Tasks'], ['/about', 'About']];
  for (const [href, text] of links) {
    const a = document.createElement('a');
    a.setAttribute('href', href);
    a.appendChild(document.createTextNode(text));
    nav.appendChild(a);
  }
  header.appendChild(nav);
  root.appendChild(header);

  // Main content
  const main = document.createElement('main');
  const section = document.createElement('section');
  section.setAttribute('class', 'task-list');
  const h2 = document.createElement('h2');
  h2.appendChild(document.createTextNode('Task List'));
  section.appendChild(h2);
  const ul = document.createElement('ul');
  const tasks = ['Write tests', 'Implement SSR', 'Ship it'];
  for (const task of tasks) {
    const li = document.createElement('li');
    li.appendChild(document.createTextNode(task));
    ul.appendChild(li);
  }
  section.appendChild(ul);
  main.appendChild(section);
  root.appendChild(main);

  // Footer
  const footer = document.createElement('footer');
  footer.setAttribute('class', 'app-footer');
  const p = document.createElement('p');
  p.appendChild(document.createTextNode('Powered by Vertz'));
  footer.appendChild(p);
  root.appendChild(footer);

  return root;
}

export const styles = [
  '.app-header { background: #1a1a2e; color: white; padding: 16px; }',
  '.task-list { padding: 16px; }',
  '.app-footer { padding: 16px; text-align: center; }',
];
