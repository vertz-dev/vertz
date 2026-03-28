// SSR test app — renders into document.body with an #app container.
// This module is loaded by the SSR pipeline and expected to produce
// DOM elements that can be serialized to HTML.

function Header() {
  return (
    <header class="app-header">
      <h1>SSR Test App</h1>
      <nav>
        <a href="/">Home</a>
        <a href="/tasks">Tasks</a>
        <a href="/about">About</a>
      </nav>
    </header>
  );
}

function TaskList() {
  return (
    <section class="task-list">
      <h2>Task List</h2>
      <ul>
        <li>Write tests</li>
        <li>Implement SSR</li>
        <li>Ship it</li>
      </ul>
    </section>
  );
}

function Footer() {
  return (
    <footer class="app-footer">
      <p>Powered by Vertz</p>
    </footer>
  );
}

export function App() {
  return (
    <div id="root">
      <Header />
      <main>
        <TaskList />
      </main>
      <Footer />
    </div>
  );
}

// SSR entry point: render the app and append to #app
const app = document.getElementById('app') || document.createElement('div');
if (!app.getAttribute('id')) app.setAttribute('id', 'app');

// Build the app tree
const root = document.createElement('div');
root.setAttribute('id', 'root');

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

const footer = document.createElement('footer');
footer.setAttribute('class', 'app-footer');
const p = document.createElement('p');
p.appendChild(document.createTextNode('Powered by Vertz'));
footer.appendChild(p);
root.appendChild(footer);

app.appendChild(root);
if (!document.body.querySelector('#app')) {
  document.body.appendChild(app);
}
