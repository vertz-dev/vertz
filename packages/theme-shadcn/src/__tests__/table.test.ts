import { describe, expect, it } from 'bun:test';
import { createTableComponents } from '../components/table';
import { createTableStyles } from '../styles/table';

describe('table styles', () => {
  const table = createTableStyles();

  it('has all 8 blocks', () => {
    expect(typeof table.root).toBe('string');
    expect(typeof table.header).toBe('string');
    expect(typeof table.body).toBe('string');
    expect(typeof table.row).toBe('string');
    expect(typeof table.head).toBe('string');
    expect(typeof table.cell).toBe('string');
    expect(typeof table.caption).toBe('string');
    expect(typeof table.footer).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(table.root.length).toBeGreaterThan(0);
    expect(table.header.length).toBeGreaterThan(0);
    expect(table.body.length).toBeGreaterThan(0);
    expect(table.row.length).toBeGreaterThan(0);
    expect(table.head.length).toBeGreaterThan(0);
    expect(table.cell.length).toBeGreaterThan(0);
    expect(table.caption.length).toBeGreaterThan(0);
    expect(table.footer.length).toBeGreaterThan(0);
  });

  it('CSS contains hover state', () => {
    expect(table.css).toContain(':hover');
  });

  it('CSS contains selected state', () => {
    expect(table.css).toContain('data-state="selected"');
  });
});

describe('Table components', () => {
  const styles = createTableStyles();
  const components = createTableComponents(styles);

  it('Table wraps content in div > table', () => {
    const el = components.Table({});
    expect(el.tagName).toBe('DIV');
    expect(el.querySelector('table')).not.toBeNull();
  });

  it('Table wrapper has overflow styles', () => {
    const el = components.Table({});
    expect(el.style.overflowX).toBe('auto');
    expect(el.style.position).toBe('relative');
    expect(el.style.width).toBe('100%');
  });

  it('Table applies root class to inner table', () => {
    const el = components.Table({});
    const table = el.querySelector('table');
    expect(table?.className).toContain(styles.root);
  });

  it('Table appends user class to inner table', () => {
    const el = components.Table({ class: 'custom-table' });
    const table = el.querySelector('table');
    expect(table?.className).toContain('custom-table');
    expect(table?.className).toContain(styles.root);
  });

  it('Table resolves children into the table element', () => {
    const el = components.Table({ children: 'content' });
    const table = el.querySelector('table');
    expect(table?.textContent).toBe('content');
  });

  it('TableHeader creates thead', () => {
    const el = components.TableHeader({});
    expect(el.tagName).toBe('THEAD');
    expect(el.className).toContain(styles.header);
  });

  it('TableBody creates tbody', () => {
    const el = components.TableBody({});
    expect(el.tagName).toBe('TBODY');
    expect(el.className).toContain(styles.body);
  });

  it('TableRow creates tr', () => {
    const el = components.TableRow({});
    expect(el.tagName).toBe('TR');
    expect(el.className).toContain(styles.row);
  });

  it('TableHead creates th with scope="col"', () => {
    const el = components.TableHead({});
    expect(el.tagName).toBe('TH');
    expect(el.scope).toBe('col');
    expect(el.className).toContain(styles.head);
  });

  it('TableCell creates td', () => {
    const el = components.TableCell({});
    expect(el.tagName).toBe('TD');
    expect(el.className).toContain(styles.cell);
  });

  it('TableCaption creates caption', () => {
    const el = components.TableCaption({});
    expect(el.tagName).toBe('CAPTION');
    expect(el.className).toContain(styles.caption);
  });

  it('TableFooter creates tfoot', () => {
    const el = components.TableFooter({});
    expect(el.tagName).toBe('TFOOT');
    expect(el.className).toContain(styles.footer);
  });

  it('components append user class', () => {
    const header = components.TableHeader({ class: 'custom' });
    expect(header.className).toContain('custom');
    expect(header.className).toContain(styles.header);

    const row = components.TableRow({ class: 'custom' });
    expect(row.className).toContain('custom');
    expect(row.className).toContain(styles.row);
  });

  it('components resolve children', () => {
    const row = components.TableRow({ children: 'row content' });
    expect(row.textContent).toBe('row content');

    const cell = components.TableCell({ children: 'cell content' });
    expect(cell.textContent).toBe('cell content');
  });
});
