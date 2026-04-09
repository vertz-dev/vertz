import { describe, expect, it } from '@vertz/test';
import { withStyles } from '../composed/with-styles';
import type { TableClasses } from '../table/table-composed';
import { ComposedTable } from '../table/table-composed';

const classes: TableClasses = {
  root: 'table-root',
  header: 'table-header',
  body: 'table-body',
  row: 'table-row',
  head: 'table-head',
  cell: 'table-cell',
  caption: 'table-caption',
  footer: 'table-footer',
};

function RenderTableRoot() {
  return <ComposedTable classes={classes}>content</ComposedTable>;
}
function RenderTablePlain() {
  return <ComposedTable>content</ComposedTable>;
}
function RenderTableWithClass() {
  return (
    <ComposedTable classes={classes} className="custom">
      content
    </ComposedTable>
  );
}
function RenderTableHeader() {
  return (
    <ComposedTable classes={classes}>
      <ComposedTable.Header>header</ComposedTable.Header>
    </ComposedTable>
  );
}
function RenderTableBody() {
  return (
    <ComposedTable classes={classes}>
      <ComposedTable.Body>body</ComposedTable.Body>
    </ComposedTable>
  );
}
function RenderTableRow() {
  return (
    <ComposedTable classes={classes}>
      <ComposedTable.Row>row</ComposedTable.Row>
    </ComposedTable>
  );
}
function RenderTableHead() {
  return (
    <ComposedTable classes={classes}>
      <ComposedTable.Head>head</ComposedTable.Head>
    </ComposedTable>
  );
}
function RenderTableCell() {
  return (
    <ComposedTable classes={classes}>
      <ComposedTable.Cell>cell</ComposedTable.Cell>
    </ComposedTable>
  );
}
function RenderTableCaption() {
  return (
    <ComposedTable classes={classes}>
      <ComposedTable.Caption>caption</ComposedTable.Caption>
    </ComposedTable>
  );
}
function RenderTableFooter() {
  return (
    <ComposedTable classes={classes}>
      <ComposedTable.Footer>footer</ComposedTable.Footer>
    </ComposedTable>
  );
}
function RenderUnstyled() {
  return (
    <ComposedTable>
      <ComposedTable.Header>h</ComposedTable.Header>
    </ComposedTable>
  );
}
function RenderHeaderWithClass() {
  return (
    <ComposedTable classes={classes}>
      <ComposedTable.Header className="extra">h</ComposedTable.Header>
    </ComposedTable>
  );
}

describe('ComposedTable', () => {
  describe('Root', () => {
    it('wraps content in div > table structure', () => {
      const el = RenderTableRoot();
      // Root returns a Provider wrapper; find the div
      const wrapper = el.querySelector('div') ?? el;
      expect(wrapper.tagName).toBe('DIV');
      expect(wrapper.querySelector('table')).not.toBeNull();
    });

    it('wrapper div has overflow styles', () => {
      const el = RenderTableRoot();
      const wrapper = el.querySelector('div') ?? el;
      expect(wrapper.style.overflowX).toBe('auto');
      expect(wrapper.style.position).toBe('relative');
      expect(wrapper.style.width).toBe('100%');
    });

    it('table has root class', () => {
      const el = RenderTableRoot();
      const table = el.querySelector('table');
      expect(table).not.toBeNull();
      expect(table?.className).toContain('table-root');
    });

    it('appends user className to table', () => {
      const el = RenderTableWithClass();
      const table = el.querySelector('table');
      expect(table).not.toBeNull();
      expect(table?.className).toContain('table-root');
      expect(table?.className).toContain('custom');
    });

    it('resolves children into the table element', () => {
      const el = RenderTableRoot();
      const table = el.querySelector('table');
      expect(table?.textContent).toContain('content');
    });

    it('renders without crashing when no classes provided', () => {
      const el = RenderTablePlain();
      const table = el.querySelector('table');
      expect(table).not.toBeNull();
    });
  });

  describe('Sub-components receive classes from context', () => {
    it('Header renders as thead with header class', () => {
      const el = RenderTableHeader();
      const header = el.querySelector('.table-header');
      expect(header).not.toBeNull();
      expect(header?.tagName).toBe('THEAD');
      expect(header?.textContent).toContain('header');
    });

    it('Body renders as tbody with body class', () => {
      const el = RenderTableBody();
      const body = el.querySelector('.table-body');
      expect(body).not.toBeNull();
      expect(body?.tagName).toBe('TBODY');
    });

    it('Row renders as tr with row class', () => {
      const el = RenderTableRow();
      const row = el.querySelector('.table-row');
      expect(row).not.toBeNull();
      expect(row?.tagName).toBe('TR');
    });

    it('Head renders as th with head class and scope="col"', () => {
      const el = RenderTableHead();
      const head = el.querySelector('.table-head');
      expect(head).not.toBeNull();
      expect(head?.tagName).toBe('TH');
      expect(head?.getAttribute('scope')).toBe('col');
    });

    it('Cell renders as td with cell class', () => {
      const el = RenderTableCell();
      const cell = el.querySelector('.table-cell');
      expect(cell).not.toBeNull();
      expect(cell?.tagName).toBe('TD');
    });

    it('Caption renders as caption with caption class', () => {
      const el = RenderTableCaption();
      const caption = el.querySelector('.table-caption');
      expect(caption).not.toBeNull();
      expect(caption?.tagName).toBe('CAPTION');
    });

    it('Footer renders as tfoot with footer class', () => {
      const el = RenderTableFooter();
      const footer = el.querySelector('.table-footer');
      expect(footer).not.toBeNull();
      expect(footer?.tagName).toBe('TFOOT');
    });
  });

  describe('Sub-components append user classes', () => {
    it('Header appends user className', () => {
      const el = RenderHeaderWithClass();
      const header = el.querySelector('thead');
      expect(header?.className).toContain('table-header');
      expect(header?.className).toContain('extra');
    });
  });

  describe('Without classes (unstyled)', () => {
    it('renders without crashing when no classes provided', () => {
      const el = RenderUnstyled();
      expect(el.querySelector('thead')).not.toBeNull();
    });
  });

  describe('withStyles integration', () => {
    it('styled table preserves sub-components', () => {
      const StyledTable = withStyles(ComposedTable, classes as Required<TableClasses>);
      expect(StyledTable.Header).toBeDefined();
      expect(StyledTable.Body).toBeDefined();
      expect(StyledTable.Row).toBeDefined();
      expect(StyledTable.Head).toBeDefined();
      expect(StyledTable.Cell).toBeDefined();
      expect(StyledTable.Caption).toBeDefined();
      expect(StyledTable.Footer).toBeDefined();
    });
  });
});
