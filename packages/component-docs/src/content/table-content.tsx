import { Table } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { tableProps } from '../props/table-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.Head>Invoice</Table.Head>
              <Table.Head>Status</Table.Head>
              <Table.Head>Method</Table.Head>
              <Table.Head>Amount</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row>
              <Table.Cell>INV001</Table.Cell>
              <Table.Cell>Paid</Table.Cell>
              <Table.Cell>Credit Card</Table.Cell>
              <Table.Cell>$250.00</Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell>INV002</Table.Cell>
              <Table.Cell>Pending</Table.Cell>
              <Table.Cell>PayPal</Table.Cell>
              <Table.Cell>$150.00</Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell>INV003</Table.Cell>
              <Table.Cell>Unpaid</Table.Cell>
              <Table.Cell>Bank Transfer</Table.Cell>
              <Table.Cell>$350.00</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Table } from 'vertz/components';

<Table>
  <Table.Header>
    <Table.Row>
      <Table.Head>Name</Table.Head>
      <Table.Head>Email</Table.Head>
    </Table.Row>
  </Table.Header>
  <Table.Body>
    <Table.Row>
      <Table.Cell>Alice</Table.Cell>
      <Table.Cell>alice@example.com</Table.Cell>
    </Table.Row>
  </Table.Body>
</Table>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={tableProps} />
    </>
  );
}
