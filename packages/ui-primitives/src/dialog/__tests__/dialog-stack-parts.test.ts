import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { type DialogHandle, DialogHandleContext, DialogIdContext } from '@vertz/ui';
import {
  StackDialogBody,
  StackDialogCancel,
  StackDialogClose,
  StackDialogDescription,
  StackDialogFooter,
  StackDialogHeader,
  StackDialogTitle,
} from '../dialog-stack-parts';

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  document.body.removeChild(container);
});

/** Helper: render a component inside both stack contexts */
function renderInStackContext<T>(
  dialogId: string,
  handle: DialogHandle<T>,
  render: () => Node,
): Node {
  let result!: Node;
  DialogHandleContext.Provider(handle as DialogHandle<unknown>, () => {
    DialogIdContext.Provider(dialogId, () => {
      result = render();
    });
  });
  return result;
}

describe('StackDialogTitle', () => {
  it('renders an h2 with id derived from DialogIdContext', () => {
    const handle: DialogHandle<void> = { close: () => {} };
    const el = renderInStackContext('dlg-42', handle, () =>
      StackDialogTitle({ children: ['Test Title'] }),
    );
    container.appendChild(el);

    const h2 = container.querySelector('h2') as HTMLElement;
    expect(h2).toBeTruthy();
    expect(h2.id).toBe('dlg-42-title');
    expect(h2.getAttribute('data-part')).toBe('title');
    expect(h2.textContent).toBe('Test Title');
  });

  it('accepts className prop', () => {
    const handle: DialogHandle<void> = { close: () => {} };
    const el = renderInStackContext('dlg-1', handle, () =>
      StackDialogTitle({ children: ['Title'], className: 'custom-class' }),
    );
    container.appendChild(el);

    const h2 = container.querySelector('h2') as HTMLElement;
    expect(h2.className).toContain('custom-class');
  });
});

describe('StackDialogDescription', () => {
  it('renders a p with id derived from DialogIdContext', () => {
    const handle: DialogHandle<void> = { close: () => {} };
    const el = renderInStackContext('dlg-5', handle, () =>
      StackDialogDescription({ children: ['Some description'] }),
    );
    container.appendChild(el);

    const p = container.querySelector('p') as HTMLElement;
    expect(p).toBeTruthy();
    expect(p.id).toBe('dlg-5-desc');
    expect(p.getAttribute('data-part')).toBe('description');
    expect(p.textContent).toBe('Some description');
  });
});

describe('StackDialogHeader', () => {
  it('renders a div with data-part="header"', () => {
    const handle: DialogHandle<void> = { close: () => {} };
    const el = renderInStackContext('dlg-1', handle, () =>
      StackDialogHeader({ children: ['Header content'] }),
    );
    container.appendChild(el);

    const div = container.querySelector('[data-part="header"]') as HTMLElement;
    expect(div).toBeTruthy();
    expect(div.textContent).toBe('Header content');
  });
});

describe('StackDialogFooter', () => {
  it('renders a div with data-part="footer"', () => {
    const handle: DialogHandle<void> = { close: () => {} };
    const el = renderInStackContext('dlg-1', handle, () =>
      StackDialogFooter({ children: ['Footer content'] }),
    );
    container.appendChild(el);

    const div = container.querySelector('[data-part="footer"]') as HTMLElement;
    expect(div).toBeTruthy();
    expect(div.textContent).toBe('Footer content');
  });
});

describe('StackDialogBody', () => {
  it('renders a div with data-part="body"', () => {
    const handle: DialogHandle<void> = { close: () => {} };
    const el = renderInStackContext('dlg-1', handle, () =>
      StackDialogBody({ children: ['Body content'] }),
    );
    container.appendChild(el);

    const div = container.querySelector('[data-part="body"]') as HTMLElement;
    expect(div).toBeTruthy();
    expect(div.textContent).toBe('Body content');
  });
});

describe('StackDialogCancel', () => {
  it('calls handle.close() with no result when clicked', () => {
    let closeCalled = false;
    const handle: DialogHandle<void> = {
      close: () => {
        closeCalled = true;
      },
    };
    const el = renderInStackContext('dlg-1', handle, () =>
      StackDialogCancel({ children: ['Cancel'] }),
    );
    container.appendChild(el);

    const btn = container.querySelector('[data-part="cancel"]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.textContent).toBe('Cancel');

    btn.click();
    expect(closeCalled).toBe(true);
  });
});

describe('StackDialogClose', () => {
  it('renders an X button that calls handle.close() when clicked', () => {
    let closeCalled = false;
    const handle: DialogHandle<void> = {
      close: () => {
        closeCalled = true;
      },
    };
    const el = renderInStackContext('dlg-1', handle, () => StackDialogClose({}));
    container.appendChild(el);

    const btn = container.querySelector('[data-part="close"]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-label')).toBe('Close');

    btn.click();
    expect(closeCalled).toBe(true);
  });

  it('renders custom children instead of default X', () => {
    const handle: DialogHandle<void> = { close: () => {} };
    const el = renderInStackContext('dlg-1', handle, () =>
      StackDialogClose({ children: ['Dismiss'] }),
    );
    container.appendChild(el);

    const btn = container.querySelector('[data-part="close"]') as HTMLButtonElement;
    expect(btn.textContent).toBe('Dismiss');
    // aria-label should not be set when children are provided
    expect(btn.getAttribute('aria-label')).toBeNull();
  });
});
