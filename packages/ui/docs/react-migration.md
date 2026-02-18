# Coming from React

If you're a React developer, Vertz will feel familiar but different. The biggest mental shift: **just use `let` and `const`**.

## The Core Difference

In React, you explicitly declare reactive state:

```tsx
// React
const [count, setCount] = useState(0);
const doubled = useMemo(() => count * 2, [count]);

function increment() {
  setCount(count + 1);
}
```

In Vertz, you just use variables. The compiler handles the reactivity:

```tsx
// Vertz
let count = 0;
const doubled = count * 2; // automatically reactive!

function increment() {
  count++; // that's it
}
```

---

## Quick Reference

| React | Vertz |
|-------|-------|
| `useState()` | `let` variable |
| `useMemo()` | `const` (derived) |
| `useEffect()` | `effect()` |
| `useRef()` | `let` (no reactivity needed) |
| Props | Props (with getter functions for reactive props) |
| Context | Modules with dependency injection |
| `useCallback()` | Rarely needed |

---

## State: `let` = Reactive

**React:**
```tsx
function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(count + 1)}>
      {count}
    </button>
  );
}
```

**Vertz:**
```tsx
function Counter() {
  let count = 0;

  return (
    <button onClick={() => count++}>
      {count}
    </button>
  );
}
```

Just use `let`. The compiler turns it into a signal automatically.

---

## Derived State: Just Use `const`

**React:**
```tsx
function Pricing() {
  const [quantity, setQuantity] = useState(1);
  const total = quantity * 10;
  const formatted = `$${total}`;

  return <span>{formatted}</span>;
}
```

**Vertz:**
```tsx
function Pricing() {
  let quantity = 1;
  const total = quantity * 10;
  const formatted = `$${total}`;

  return <span>{formatted}</span>;
}
```

No `useMemo` needed. The compiler sees `total` depends on `quantity` and makes it reactive automatically.

---

## Effects: `effect()`

**React:**
```tsx
useEffect(() => {
  console.log('Count changed:', count);
}, [count]);
```

**Vertz:**
```tsx
effect(() => {
  console.log('Count changed:', count);
});
```

The `effect()` function runs when any signal it reads changes. No dependency array needed—the compiler figures it out.

> **You need effects less often.** In React, you often need `useEffect` to sync state or trigger side effects. In Vertz, assignments are already reactive, so you usually just modify the variable directly.

---

## What If I DON'T Want Reactivity?

Sometimes you need a variable that doesn't trigger updates. Use a regular variable:

```tsx
function App() {
  // This IS reactive - used in JSX
  let name = 'World';

  // This is NOT reactive - just a local variable
  let temporary = computeSomethingOnce();

  // Or use a plain object without reactivity
  let cache = { value: null };

  function handleClick() {
    cache.value = computeExpensiveThing();
    // This won't update the DOM - it's just a local variable
  }

  return <button onClick={handleClick}>{name}</button>;
}
```

**Rule of thumb:** If you use a variable in JSX, it's reactive. If you only use it inside functions, it's just a local variable.

---

## Props

Props work similarly, with one key difference:

**React:**
```tsx
function Greeting({ name, onClick }) {
  return <button onClick={onClick}>{name}</button>;
}
```

**Vertz:**
```tsx
function Greeting(props: { name: () => number; onClick: () => void }) {
  return <button onClick={props.onClick}>{props.name()}</button>;
}

// Usage
<Greeting name={() => count} onClick={() => count++} />
```

The `() =>` is a **getter function**. It makes the prop reactive—when the signal changes, the component updates. If you pass a plain value, it's static (computed once).

> This feels weird at first, but it gives you fine-grained control: "should this prop trigger re-renders?"

---

## Components

Components are functions that return JSX (compiled to DOM nodes):

```tsx
function Card({ title }: { title: () => string }) {
  return (
    <div class="card">
      <h2>{title()}</h2>
    </div>
  );
}
```

Key differences from React:
- No `return null` for no-output—use an empty fragment `<>...</>`
- No `React.FC` types—just plain function types
- Events are native: `onClick`, `onInput`, etc. (camelCase)

---

## No Hooks

Vertz doesn't have hooks. There's no `useState`, `useEffect`, `useContext`, etc.

- State → just use `let`
- Derived state → just use `const`
- Side effects → use `effect()`
- Sharing state → use modules with dependency injection

---

## Forms

**React:**
```tsx
function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    submit({ email, password });
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={email} onChange={e => setEmail(e.target.value)} />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <button type="submit">Login</button>
    </form>
  );
}
```

**Vertz:**
```tsx
import { form } from '@vertz/ui';

// Create an SDK method with url and method metadata
const login = ((body: { email: string; password: string }) =>
  fetch('/api/login', {
    method: 'POST',
    body: JSON.stringify(body),
  }).then(r => r.json())) as typeof login & { url: string; method: string };
login.url = '/api/login';
login.method = 'POST';

// Simple validation schema (or use @vertz/schema for more complex validation)
const loginSchema = {
  parse(data: unknown) {
    const d = data as { email?: string; password?: string };
    if (!d.email) throw { fieldErrors: { email: 'Email is required' } };
    if (!d.password) throw { fieldErrors: { password: 'Password is required' } };
    return d as { email: string; password: string };
  }
};

function LoginForm() {
  const f = form(login, { schema: loginSchema });

  return (
    <form {...f.attrs()} onSubmit={f.handleSubmit()}>
      <input name="email" />
      {f.error('email') && <span class="error">{f.error('email')}</span>}
      <input type="password" name="password" />
      {f.error('password') && <span class="error">{f.error('password')}</span>}
      <button type="submit">{f.submitting.value ? 'Logging in...' : 'Login'}</button>
    </form>
  );
}
```

The `form()` helper takes an SDK method (with `.url` and `.method` properties) and a validation schema. It provides:
- `attrs()` for progressive enhancement (returns action/method)
- `handleSubmit()` extracts FormData, validates, and submits
- `error(fieldName)` for field-level error messages
- `submitting.value` for loading state

---

## Data Fetching

**React:**
```tsx
function UserList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => {
        setUsers(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <Spinner />;

  return <ul>{users.map(u => <li>{u.name}</li>)}</ul>;
}
```

**Vertz:**
```tsx
import { query } from '@vertz/ui';

function UserList() {
  const q = query(() => fetch('/api/users').then(r => r.json()));

  if (q.loading.value) return <Spinner />;
  if (q.error.value) return <Error error={q.error.value} />;

  return (
    <ul>
      {q.data.value?.map(u => <li key={u.id}>{u.name}</li>)}
    </ul>
  );
}
```

The `query()` helper wraps fetch and gives you reactive signals:
- `loading.value` — true while fetching
- `error.value` — error object if fetch failed
- `data.value` — the fetched data

---

## Lists

**React:**
```tsx
function TodoList() {
  const [todos, setTodos] = useState([...]);

  return (
    <ul>
      {todos.map(todo => (
        <li key={todo.id}>{todo.text}</li>
      ))}
    </ul>
  );
}
```

**Vertz:**
```tsx
function TodoList() {
  let todos = [...];

  return (
    <ul>
      {todos.map(todo => (
        <li key={todo.id}>{todo.text}</li>
      ))}
    </ul>
  );
}
```

Same syntax! The compiler handles the list reactivity.

---

## Conditional Rendering

**React:**
```tsx
{isLoggedIn ? <Dashboard /> : <Login />}
{showModal && <Modal />}
```

**Vertz:**
```tsx
{isLoggedIn() ? <Dashboard /> : <Login />}
{showModal && <Modal />}
```

Same syntax. Note the `()` for reactive boolean checks.

---

## Styling

**React:**
```tsx
<div className={`card ${active ? 'active' : ''}`} />
<button style={{ marginTop: 10 }} />
```

**Vertz:**
```tsx
<div class={`card ${active ? 'active' : ''}`} />
<button style={{ marginTop: 10 }} />
```

Use `class` instead of `className`. Attributes are camelCase like JavaScript.

---

## Migration Tips

1. **Start simple:** Convert one component at a time. Start with stateless presentational components.

2. **Delete useState:** Replace `const [x, setX] = useState(initial)` with `let x = initial`.

3. **Delete useMemo:** Just use `const`. The compiler handles dependencies.

4. **Delete useEffect sparingly:** You often don't need it—assignments are reactive. Use `effect()` only for true side effects (logging, analytics, etc.).

5. **Read the compiled output:** If something's confusing, the compiler shows you what it produced. Check your devtools or compiler output.

6. **Trust the compiler:** It handles the tricky stuff (mutations, derived state, cleanup). You just write code.

---

## Common Gotchas

| Issue | Solution |
|-------|----------|
| "Why isn't my variable reactive?" | Make sure it's used in JSX |
| "My effect runs too often" | Move it outside JSX or use `const` for derived values |
| "Props aren't updating" | Pass getter functions: `prop={() => value}` |
| "I need a non-reactive counter" | Use a plain variable (not in JSX) or `let` outside component |
| "How do I share state?" | Use modules with dependency injection |

---

## Still Confused?

- Check the main [README.md](../README.md) for more details
- Look at examples in the `examples/` folder
- Remember: **just use `let` and `const`**
