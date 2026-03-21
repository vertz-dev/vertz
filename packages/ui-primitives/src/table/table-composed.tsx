import type { ChildValue } from '@vertz/ui';
import { createContext, useContext } from '@vertz/ui';
import { cn } from '../composed/cn';

export interface TableClasses {
  root?: string;
  header?: string;
  body?: string;
  row?: string;
  head?: string;
  cell?: string;
  caption?: string;
  footer?: string;
}

export type TableClassKey = keyof TableClasses;

interface SlotProps {
  children?: ChildValue;
  className?: string;
  class?: string;
}

const TableContext = createContext<{ classes?: TableClasses } | undefined>(
  undefined,
  '@vertz/ui-primitives::TableContext',
);

function TableHeader({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(TableContext);
  return <thead class={cn(ctx?.classes?.header, className ?? classProp)}>{children}</thead>;
}

function TableBody({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(TableContext);
  return <tbody class={cn(ctx?.classes?.body, className ?? classProp)}>{children}</tbody>;
}

function TableRow({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(TableContext);
  return <tr class={cn(ctx?.classes?.row, className ?? classProp)}>{children}</tr>;
}

function TableHead({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(TableContext);
  return (
    <th scope="col" class={cn(ctx?.classes?.head, className ?? classProp)}>
      {children}
    </th>
  );
}

function TableCell({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(TableContext);
  return <td class={cn(ctx?.classes?.cell, className ?? classProp)}>{children}</td>;
}

function TableCaption({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(TableContext);
  return <caption class={cn(ctx?.classes?.caption, className ?? classProp)}>{children}</caption>;
}

function TableFooter({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(TableContext);
  return <tfoot class={cn(ctx?.classes?.footer, className ?? classProp)}>{children}</tfoot>;
}

export interface ComposedTableProps {
  children?: ChildValue;
  classes?: TableClasses;
  className?: string;
  class?: string;
}

function ComposedTableRoot({ children, classes, className, class: classProp }: ComposedTableProps) {
  return (
    <TableContext.Provider value={{ classes }}>
      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse' }} class={cn(classes?.root, className ?? classProp)}>
          {children}
        </table>
      </div>
    </TableContext.Provider>
  );
}

export const ComposedTable = Object.assign(ComposedTableRoot, {
  Header: TableHeader,
  Body: TableBody,
  Row: TableRow,
  Head: TableHead,
  Cell: TableCell,
  Caption: TableCaption,
  Footer: TableFooter,
}) as ((props: ComposedTableProps) => HTMLElement) & {
  __classKeys?: TableClassKey;
  Header: (props: SlotProps) => HTMLElement;
  Body: (props: SlotProps) => HTMLElement;
  Row: (props: SlotProps) => HTMLElement;
  Head: (props: SlotProps) => HTMLElement;
  Cell: (props: SlotProps) => HTMLElement;
  Caption: (props: SlotProps) => HTMLElement;
  Footer: (props: SlotProps) => HTMLElement;
};
