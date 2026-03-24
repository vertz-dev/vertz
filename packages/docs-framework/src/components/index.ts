export { Accordion, AccordionGroup } from './accordion';
export { Callout, Check, Danger, Info, Note, Tip, Warning } from './callout';
export { Card, CardGroup } from './card';
export { CodeGroup } from './code-group';
export { Column, Columns } from './columns';
export { Frame } from './frame';
export { Step, Steps } from './steps';
export { Tab, Tabs } from './tabs';

import { Accordion, AccordionGroup } from './accordion';
import { Callout, Check, Danger, Info, Note, Tip, Warning } from './callout';
import { Card, CardGroup } from './card';
import { CodeGroup } from './code-group';
import { Column, Columns } from './columns';
import { Frame } from './frame';
import { Step, Steps } from './steps';
import { Tab, Tabs } from './tabs';

/**
 * All built-in MDX components, keyed by tag name.
 * Pass this to the MDX compilation components option to make them
 * globally available without explicit import in MDX files.
 */
export const builtinComponents: Record<string, (props: Record<string, unknown>) => string> = {
  Accordion,
  AccordionGroup,
  Callout,
  Card,
  CardGroup,
  Check,
  CodeGroup,
  Column,
  Columns,
  Danger,
  Frame,
  Info,
  Note,
  Step,
  Steps,
  Tab,
  Tabs,
  Tip,
  Warning,
};
