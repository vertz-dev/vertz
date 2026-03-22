import { Button, List } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2, DocH3, DocParagraph } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import {
  animateConfigProps,
  listDragHandleProps,
  listItemProps,
  listProps,
} from '../props/list-props';

// ---------------------------------------------------------------------------
// Interactive demos — `let` becomes reactive via the Vertz compiler
// ---------------------------------------------------------------------------

let nextId = 4;

function AnimatedListDemo() {
  let items = [
    { id: 1, label: 'Buy groceries' },
    { id: 2, label: 'Walk the dog' },
    { id: 3, label: 'Read a book' },
  ];

  function addItem() {
    const id = nextId++;
    items = [...items, { id, label: `New task ${id}` }];
  }

  function removeItem(id: number) {
    items = items.filter((item) => item.id !== id);
  }

  return (
    <div>
      <div style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
        <Button intent="outline" size="sm" onClick={addItem}>
          Add item
        </Button>
      </div>
      <List animate>
        {items.map((item) => (
          <List.Item key={item.id}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
              }}
            >
              <span>{item.label}</span>
              <Button intent="ghost" size="sm" onClick={() => removeItem(item.id)}>
                Remove
              </Button>
            </div>
          </List.Item>
        ))}
      </List>
    </div>
  );
}

function SortableListDemo() {
  let items = [
    { id: 1, label: 'First item' },
    { id: 2, label: 'Second item' },
    { id: 3, label: 'Third item' },
    { id: 4, label: 'Fourth item' },
  ];

  function handleReorder(from: number, to: number) {
    items = List.reorder(items, from, to);
  }

  return (
    <List animate sortable onReorder={handleReorder}>
      {items.map((item) => (
        <List.Item key={item.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
            <List.DragHandle>
              <span style={{ cursor: 'grab', fontSize: '16px', opacity: 0.5 }}>{'\u2630'}</span>
            </List.DragHandle>
            <span>{item.label}</span>
          </div>
        </List.Item>
      ))}
    </List>
  );
}

// ---------------------------------------------------------------------------
// Page content
// ---------------------------------------------------------------------------

export function Content() {
  return (
    <>
      <DocH2>Animated List</DocH2>
      <DocParagraph>
        Enable FLIP animations for enter, exit, and reorder transitions with the animate prop. Add
        and remove items to see the transitions.
      </DocParagraph>
      <ComponentPreview>
        <AnimatedListDemo />
      </ComponentPreview>
      <CodeFence>
        <code>
          {`import { List } from '@vertz/ui/components';

<List animate>
  {items.map(item => (
    <List.Item key={item.id}>{item.label}</List.Item>
  ))}
</List>`}
        </code>
      </CodeFence>

      <DocH3>CSS for enter/exit animations</DocH3>
      <CodeFence>
        <code>
          {`[data-presence="enter"] {
  animation: fadeIn 200ms ease-out;
}
[data-presence="exit"] {
  animation: fadeOut 200ms ease-out;
}`}
        </code>
      </CodeFence>

      <DocH2>Sortable List</DocH2>
      <DocParagraph>
        Enable drag-and-sort with the sortable prop and an onReorder callback. Drag items by their
        handle to reorder.
      </DocParagraph>
      <ComponentPreview>
        <SortableListDemo />
      </ComponentPreview>
      <CodeFence>
        <code>
          {`import { List } from '@vertz/ui/components';

<List animate sortable onReorder={handleReorder}>
  {items.map(item => (
    <List.Item key={item.id}>
      <List.DragHandle>\u2630</List.DragHandle>
      {item.name}
    </List.Item>
  ))}
</List>`}
        </code>
      </CodeFence>

      <DocH2>Basic Usage</DocH2>
      <ComponentPreview>
        <List>
          <List.Item>Item one</List.Item>
          <List.Item>Item two</List.Item>
          <List.Item>Item three</List.Item>
        </List>
      </ComponentPreview>
      <CodeFence>
        <code>
          {`import { List } from '@vertz/ui/components';

<List>
  <List.Item>Item one</List.Item>
  <List.Item>Item two</List.Item>
  <List.Item>Item three</List.Item>
</List>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <DocH3>List</DocH3>
      <PropsTable props={listProps} />

      <DocH3>AnimateConfig</DocH3>
      <PropsTable props={animateConfigProps} />

      <DocH3>List.Item</DocH3>
      <PropsTable props={listItemProps} />

      <DocH3>List.DragHandle</DocH3>
      <PropsTable props={listDragHandleProps} />
    </>
  );
}
