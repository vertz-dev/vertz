export { Accordion, AccordionGroup } from './accordion';
export { Callout, Check, Danger, Info, Note, Tip, Warning } from './callout';
export { Card, CardGroup } from './card';
export { CodeGroup } from './code-group';
export { Column, Columns } from './columns';
export { Expandable } from './expandable';
export { Frame } from './frame';
export { Icon } from './icon';
export { ParamField } from './param-field';
export { ResponseField } from './response-field';
export { Step, Steps } from './steps';
export { Tab, Tabs } from './tabs';
export { Tooltip } from './tooltip';

import { Accordion, AccordionGroup } from './accordion';
import { Callout, Check, Danger, Info, Note, Tip, Warning } from './callout';
import { Card, CardGroup } from './card';
import { CodeGroup } from './code-group';
import { Column, Columns } from './columns';
import { Expandable } from './expandable';
import { Frame } from './frame';
import { Icon } from './icon';
import { ParamField } from './param-field';
import { ResponseField } from './response-field';
import { Step, Steps } from './steps';
import { Tab, Tabs } from './tabs';
import { Tooltip } from './tooltip';

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
  Expandable,
  Frame,
  Icon,
  Info,
  Note,
  ParamField,
  ResponseField,
  Step,
  Steps,
  Tab,
  Tabs,
  Tip,
  Tooltip,
  Warning,
};
