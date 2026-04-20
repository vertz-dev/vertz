import { onMount } from '@vertz/ui';
import { useParams } from '@vertz/ui/router';
import { PrevNext } from '../components/prev-next';
import { PrevNextCompact } from '../components/prev-next-compact';
import { Content as AccordionContent } from '../content/accordion-content';
import { Content as AlertContent } from '../content/alert-content';
import { Content as AlertDialogContent } from '../content/alert-dialog-content';
import { Content as AvatarContent } from '../content/avatar-content';
import { Content as BadgeContent } from '../content/badge-content';
import { Content as BreadcrumbContent } from '../content/breadcrumb-content';
import { Content as ButtonContent } from '../content/button-content';
import { Content as CalendarContent } from '../content/calendar-content';
import { Content as CardContent } from '../content/card-content';
import { Content as CarouselContent } from '../content/carousel-content';
import { Content as CheckboxContent } from '../content/checkbox-content';
import { Content as CollapsibleContent } from '../content/collapsible-content';
import { Content as ComboboxContent } from '../content/combobox-content';
import { Content as CommandContent } from '../content/command-content';
import { Content as ContextMenuContent } from '../content/context-menu-content';
import { Content as DatePickerContent } from '../content/date-picker-content';
import { Content as DialogContent } from '../content/dialog-content';
import { Content as DialogStackContent } from '../content/dialog-stack-content';
import { Content as DrawerContent } from '../content/drawer-content';
import { Content as DropdownMenuContent } from '../content/dropdown-menu-content';
import { Content as EmptyStateContent } from '../content/empty-state-content';
import { Content as FormGroupContent } from '../content/form-group-content';
import { Content as HoverCardContent } from '../content/hover-card-content';
import { Content as InputContent } from '../content/input-content';
import { Content as LabelContent } from '../content/label-content';
import { Content as ListContent } from '../content/list-content';
import { Content as MenuContent } from '../content/menu-content';
import { Content as MenubarContent } from '../content/menubar-content';
import { Content as NavigationMenuContent } from '../content/navigation-menu-content';
import { Content as PaginationContent } from '../content/pagination-content';
import { Content as PopoverContent } from '../content/popover-content';
import { Content as ProgressContent } from '../content/progress-content';
import { Content as RadioGroupContent } from '../content/radio-group-content';
import { descriptions } from '../content/registry';
import { Content as ResizablePanelContent } from '../content/resizable-panel-content';
import { Content as ScrollAreaContent } from '../content/scroll-area-content';
import { Content as SelectContent } from '../content/select-content';
import { Content as SeparatorContent } from '../content/separator-content';
import { Content as SheetContent } from '../content/sheet-content';
import { Content as SkeletonContent } from '../content/skeleton-content';
import { Content as SliderContent } from '../content/slider-content';
import { Content as SwitchContent } from '../content/switch-content';
import { Content as TableContent } from '../content/table-content';
import { Content as TabsContent } from '../content/tabs-content';
import { Content as TextareaContent } from '../content/textarea-content';
import { Content as ToastContent } from '../content/toast-content';
import { Content as ToggleContent } from '../content/toggle-content';
import { Content as ToggleGroupContent } from '../content/toggle-group-content';
import { Content as TooltipContent } from '../content/tooltip-content';
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
  'dialog-stack': DialogStackContent,
  'alert-dialog': AlertDialogContent,
  select: SelectContent,
  tabs: TabsContent,
  accordion: AccordionContent,
  card: CardContent,
  list: ListContent,
  table: TableContent,
  alert: AlertContent,
  checkbox: CheckboxContent,
  combobox: ComboboxContent,
  'date-picker': DatePickerContent,
  'form-group': FormGroupContent,
  'radio-group': RadioGroupContent,
  slider: SliderContent,
  switch: SwitchContent,
  toggle: ToggleContent,
  'resizable-panel': ResizablePanelContent,
  'scroll-area': ScrollAreaContent,
  skeleton: SkeletonContent,
  'empty-state': EmptyStateContent,
  avatar: AvatarContent,
  calendar: CalendarContent,
  progress: ProgressContent,
  drawer: DrawerContent,
  sheet: SheetContent,
  toast: ToastContent,
  command: CommandContent,
  menu: MenuContent,
  menubar: MenubarContent,
  'navigation-menu': NavigationMenuContent,
  'context-menu': ContextMenuContent,
  'dropdown-menu': DropdownMenuContent,
  'hover-card': HoverCardContent,
  popover: PopoverContent,
  tooltip: TooltipContent,
  carousel: CarouselContent,
  collapsible: CollapsibleContent,
  'toggle-group': ToggleGroupContent,
};

const PAGE_STYLE: Record<string, string> = {
  padding: '32px 48px',
  maxWidth: '800px',
};

export function ComponentPage() {
  const { name } = useParams<'/components/:name'>();
  const entry = findComponent(name);
  const { prev, next } = getAdjacentComponents(name);

  // Reset window scroll on every component-page mount — runs after the new
  // page is in the DOM, so each component nav starts at the top.
  onMount(() => {
    window.scrollTo(0, 0);
  });

  if (!entry) {
    return (
      <div style={PAGE_STYLE}>
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
      </div>
    );
  }

  const description = descriptions[name];
  const ContentComponent = contentMap[name];

  return (
    <div style={PAGE_STYLE}>
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
      <PrevNextCompact prev={prev} next={next} />
      {ContentComponent ? <ContentComponent /> : null}
      <PrevNext prev={prev} next={next} />
    </div>
  );
}
