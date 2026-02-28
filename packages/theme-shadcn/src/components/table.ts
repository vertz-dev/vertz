import type { ChildValue, CSSOutput } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';

type TableBlocks = {
  root: string[];
  header: string[];
  body: string[];
  row: string[];
  head: string[];
  cell: string[];
  caption: string[];
  footer: string[];
};

export interface TableProps {
  class?: string;
  children?: ChildValue;
}

export interface TableComponents {
  Table: (props: TableProps) => HTMLDivElement;
  TableHeader: (props: TableProps) => HTMLTableSectionElement;
  TableBody: (props: TableProps) => HTMLTableSectionElement;
  TableRow: (props: TableProps) => HTMLTableRowElement;
  TableHead: (props: TableProps) => HTMLTableCellElement;
  TableCell: (props: TableProps) => HTMLTableCellElement;
  TableCaption: (props: TableProps) => HTMLTableCaptionElement;
  TableFooter: (props: TableProps) => HTMLTableSectionElement;
}

export function createTableComponents(tableStyles: CSSOutput<TableBlocks>): TableComponents {
  function Table({ class: className, children }: TableProps): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.width = '100%';
    wrapper.style.overflowX = 'auto';
    const table = document.createElement('table');
    table.style.borderCollapse = 'collapse';
    table.className = [tableStyles.root, className].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      table.appendChild(node);
    }
    wrapper.appendChild(table);
    return wrapper;
  }

  function TableHeader({ class: className, children }: TableProps): HTMLTableSectionElement {
    const el = document.createElement('thead');
    el.className = [tableStyles.header, className].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function TableBody({ class: className, children }: TableProps): HTMLTableSectionElement {
    const el = document.createElement('tbody');
    el.className = [tableStyles.body, className].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function TableRow({ class: className, children }: TableProps): HTMLTableRowElement {
    const el = document.createElement('tr');
    el.className = [tableStyles.row, className].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function TableHead({ class: className, children }: TableProps): HTMLTableCellElement {
    const el = document.createElement('th');
    el.scope = 'col';
    el.className = [tableStyles.head, className].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function TableCell({ class: className, children }: TableProps): HTMLTableCellElement {
    const el = document.createElement('td');
    el.className = [tableStyles.cell, className].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function TableCaption({ class: className, children }: TableProps): HTMLTableCaptionElement {
    const el = document.createElement('caption');
    el.className = [tableStyles.caption, className].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function TableFooter({ class: className, children }: TableProps): HTMLTableSectionElement {
    const el = document.createElement('tfoot');
    el.className = [tableStyles.footer, className].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  return {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    TableCaption,
    TableFooter,
  };
}
