import { describe, expect, it } from 'bun:test';
import { configureTheme } from '../configure';
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

describe('Table component (composed)', () => {
  const theme = configureTheme();
  const { Table } = theme.components;

  it('Table wraps content in div > table', () => {
    const el = Table({}) as HTMLElement;
    const wrapper = el.querySelector('div') ?? el;
    expect(wrapper.tagName).toBe('DIV');
    expect(wrapper.querySelector('table')).not.toBeNull();
  });

  it('Table wrapper has overflow styles', () => {
    const el = Table({}) as HTMLElement;
    const wrapper = el.querySelector('div') ?? el;
    expect(wrapper.style.overflowX).toBe('auto');
    expect(wrapper.style.position).toBe('relative');
    expect(wrapper.style.width).toBe('100%');
  });

  it('Table applies root class to inner table', () => {
    const el = Table({}) as HTMLElement;
    const table = el.querySelector('table');
    expect(table?.className).toContain(theme.styles.table.root);
  });

  it('Table appends user class to inner table', () => {
    const el = Table({ className: 'custom-table' }) as HTMLElement;
    const table = el.querySelector('table');
    expect(table?.className).toContain('custom-table');
    expect(table?.className).toContain(theme.styles.table.root);
  });

  it('Table has all expected sub-components', () => {
    expect(Table.Header).toBeDefined();
    expect(Table.Body).toBeDefined();
    expect(Table.Row).toBeDefined();
    expect(Table.Head).toBeDefined();
    expect(Table.Cell).toBeDefined();
    expect(Table.Caption).toBeDefined();
    expect(Table.Footer).toBeDefined();
  });
});
