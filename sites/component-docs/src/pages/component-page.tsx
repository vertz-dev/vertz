import { useParams } from '@vertz/ui/router';
import { DocsLayout } from '../components/docs-layout';
import { PrevNext } from '../components/prev-next';
import { Content as AccordionContent } from '../content/accordion-content';
import { Content as AlertContent } from '../content/alert-content';
import { Content as AlertDialogContent } from '../content/alert-dialog-content';
import { Content as BadgeContent } from '../content/badge-content';
import { Content as BreadcrumbContent } from '../content/breadcrumb-content';
import { Content as ButtonContent } from '../content/button-content';
import { Content as CardContent } from '../content/card-content';
import { Content as DialogContent } from '../content/dialog-content';
import { Content as InputContent } from '../content/input-content';
import { Content as LabelContent } from '../content/label-content';
import { Content as PaginationContent } from '../content/pagination-content';
import { descriptions } from '../content/registry';
import { Content as SelectContent } from '../content/select-content';
import { Content as SeparatorContent } from '../content/separator-content';
import { Content as TableContent } from '../content/table-content';
import { Content as TabsContent } from '../content/tabs-content';
import { Content as TextareaContent } from '../content/textarea-content';
import { findComponent, getAdjacentComponents } from '../manifest';

const contentMap: Record<
  string,
  (props?: Record<string, unknown>) => HTMLElement | SVGElement | DocumentFragment
> = {
  button: ButtonContent,
  badge: BadgeContent,
  input: InputContent,
  label: LabelContent,
  textarea: TextareaContent,
  separator: SeparatorContent,
  breadcrumb: BreadcrumbContent,
  pagination: PaginationContent,
  dialog: DialogContent,
  'alert-dialog': AlertDialogContent,
  select: SelectContent,
  tabs: TabsContent,
  accordion: AccordionContent,
  card: CardContent,
  table: TableContent,
  alert: AlertContent,
};

export function ComponentPage() {
  const { name } = useParams<'/components/:name'>();
  const entry = findComponent(name);
  const { prev, next } = getAdjacentComponents(name);

  if (!entry) {
    return (
      <DocsLayout>
        <h1
          style={{
            fontSize: '30px',
            fontWeight: '700',
            lineHeight: '1.2',
            color: 'var(--color-foreground)',
            margin: '0 0 8px',
          }}
        >
          Component not found
        </h1>
        <p
          style={{
            fontSize: '16px',
            lineHeight: '1.6',
            color: 'var(--color-muted-foreground)',
            margin: '0 0 32px',
          }}
        >
          The component "{name}" does not exist in the documentation.
        </p>
      </DocsLayout>
    );
  }

  const description = descriptions[name];
  const ContentComponent = contentMap[name];

  return (
    <DocsLayout activeName={name}>
      <h1
        style={{
          fontSize: '30px',
          fontWeight: '700',
          lineHeight: '1.2',
          color: 'var(--color-foreground)',
          margin: '0 0 8px',
        }}
      >
        {entry.title}
      </h1>
      <p
        style={{
          fontSize: '16px',
          lineHeight: '1.6',
          color: 'var(--color-muted-foreground)',
          margin: '0 0 32px',
        }}
      >
        {description ?? `Documentation for ${entry.title} is coming soon.`}
      </p>
      {ContentComponent ? <ContentComponent /> : null}
      <PrevNext prev={prev} next={next} />
    </DocsLayout>
  );
}
