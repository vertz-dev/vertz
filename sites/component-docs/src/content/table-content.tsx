import { Table } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { tableProps } from '../props/table-props';


export function Content() {
  return (
    <>
      <ComponentPreview>
        <Table.Table>
          <Table.TableHeader>
            <Table.TableRow>
              <Table.TableHead>Invoice</Table.TableHead>
              <Table.TableHead>Status</Table.TableHead>
              <Table.TableHead>Method</Table.TableHead>
              <Table.TableHead>Amount</Table.TableHead>
            </Table.TableRow>
          </Table.TableHeader>
          <Table.TableBody>
            <Table.TableRow>
              <Table.TableCell>INV001</Table.TableCell>
              <Table.TableCell>Paid</Table.TableCell>
              <Table.TableCell>Credit Card</Table.TableCell>
              <Table.TableCell>$250.00</Table.TableCell>
            </Table.TableRow>
            <Table.TableRow>
              <Table.TableCell>INV002</Table.TableCell>
              <Table.TableCell>Pending</Table.TableCell>
              <Table.TableCell>PayPal</Table.TableCell>
              <Table.TableCell>$150.00</Table.TableCell>
            </Table.TableRow>
            <Table.TableRow>
              <Table.TableCell>INV003</Table.TableCell>
              <Table.TableCell>Unpaid</Table.TableCell>
              <Table.TableCell>Bank Transfer</Table.TableCell>
              <Table.TableCell>$350.00</Table.TableCell>
            </Table.TableRow>
          </Table.TableBody>
        </Table.Table>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Table } from '@vertz/ui/components';

<Table.Table>
  <Table.TableHeader>
    <Table.TableRow>
      <Table.TableHead>Name</Table.TableHead>
      <Table.TableHead>Email</Table.TableHead>
    </Table.TableRow>
  </Table.TableHeader>
  <Table.TableBody>
    <Table.TableRow>
      <Table.TableCell>Alice</Table.TableCell>
      <Table.TableCell>alice@example.com</Table.TableCell>
    </Table.TableRow>
  </Table.TableBody>
</Table.Table>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={tableProps} />
    </>
  );
}
