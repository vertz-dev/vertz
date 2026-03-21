import type { ChildValue } from '@vertz/ui';
import { createContext, useContext } from '@vertz/ui';

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
  const effectiveCls = className ?? classProp;
  const combined = [ctx?.classes?.header, effectiveCls].filter(Boolean).join(' ');
  return <thead class={combined || undefined}>{children}</thead>;
}

function TableBody({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(TableContext);
  const effectiveCls = className ?? classProp;
  const combined = [ctx?.classes?.body, effectiveCls].filter(Boolean).join(' ');
  return <tbody class={combined || undefined}>{children}</tbody>;
}

function TableRow({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(TableContext);
  const effectiveCls = className ?? classProp;
  const combined = [ctx?.classes?.row, effectiveCls].filter(Boolean).join(' ');
  return <tr class={combined || undefined}>{children}</tr>;
}

function TableHead({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(TableContext);
  const effectiveCls = className ?? classProp;
  const combined = [ctx?.classes?.head, effectiveCls].filter(Boolean).join(' ');
  return (
    <th scope="col" class={combined || undefined}>
      {children}
    </th>
  );
}

function TableCell({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(TableContext);
  const effectiveCls = className ?? classProp;
  const combined = [ctx?.classes?.cell, effectiveCls].filter(Boolean).join(' ');
  return <td class={combined || undefined}>{children}</td>;
}

function TableCaption({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(TableContext);
  const effectiveCls = className ?? classProp;
  const combined = [ctx?.classes?.caption, effectiveCls].filter(Boolean).join(' ');
  return <caption class={combined || undefined}>{children}</caption>;
}

function TableFooter({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(TableContext);
  const effectiveCls = className ?? classProp;
  const combined = [ctx?.classes?.footer, effectiveCls].filter(Boolean).join(' ');
  return <tfoot class={combined || undefined}>{children}</tfoot>;
}

export interface ComposedTableProps {
  children?: ChildValue;
  classes?: TableClasses;
  className?: string;
  class?: string;
}

function ComposedTableRoot({ children, classes, className, class: classProp }: ComposedTableProps) {
  const effectiveCls = className ?? classProp;
  const combinedClass = [classes?.root, effectiveCls].filter(Boolean).join(' ');
  return (
    <TableContext.Provider value={{ classes }}>
      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse' }} class={combinedClass || undefined}>
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
