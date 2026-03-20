import type { ChildValue, CSSOutput } from '@vertz/ui';

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
  className?: string;
  /** @deprecated Use `className` instead. */
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
  function Table({ className, class: classProp, children }: TableProps) {
    const combinedClass = [tableStyles.root, className ?? classProp].filter(Boolean).join(' ');
    return (
      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse' }} class={combinedClass}>
          {children}
        </table>
      </div>
    ) as HTMLDivElement;
  }

  function TableHeader({ className, class: classProp, children }: TableProps) {
    const combinedClass = [tableStyles.header, className ?? classProp].filter(Boolean).join(' ');
    return (<thead class={combinedClass}>{children}</thead>) as HTMLTableSectionElement;
  }

  function TableBody({ className, class: classProp, children }: TableProps) {
    const combinedClass = [tableStyles.body, className ?? classProp].filter(Boolean).join(' ');
    return (<tbody class={combinedClass}>{children}</tbody>) as HTMLTableSectionElement;
  }

  function TableRow({ className, class: classProp, children }: TableProps) {
    const combinedClass = [tableStyles.row, className ?? classProp].filter(Boolean).join(' ');
    return (<tr class={combinedClass}>{children}</tr>) as HTMLTableRowElement;
  }

  function TableHead({ className, class: classProp, children }: TableProps) {
    const combinedClass = [tableStyles.head, className ?? classProp].filter(Boolean).join(' ');
    return (
      <th scope="col" class={combinedClass}>
        {children}
      </th>
    ) as HTMLTableCellElement;
  }

  function TableCell({ className, class: classProp, children }: TableProps) {
    const combinedClass = [tableStyles.cell, className ?? classProp].filter(Boolean).join(' ');
    return (<td class={combinedClass}>{children}</td>) as HTMLTableCellElement;
  }

  function TableCaption({ className, class: classProp, children }: TableProps) {
    const combinedClass = [tableStyles.caption, className ?? classProp].filter(Boolean).join(' ');
    return (<caption class={combinedClass}>{children}</caption>) as HTMLTableCaptionElement;
  }

  function TableFooter({ className, class: classProp, children }: TableProps) {
    const combinedClass = [tableStyles.footer, className ?? classProp].filter(Boolean).join(' ');
    return (<tfoot class={combinedClass}>{children}</tfoot>) as HTMLTableSectionElement;
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
