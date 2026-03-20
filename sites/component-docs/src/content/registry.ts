/** Descriptions for documented components (content components are imported separately in .tsx files). */
export const descriptions: Record<string, string> = {
  // Simple components
  button: 'Displays a button or a component that looks like a button.',
  badge: 'Displays a badge or a component that looks like a badge.',
  input: 'Displays an input field for user text entry.',
  label: 'Renders an accessible label associated with a form control.',
  textarea: 'Displays a multi-line text input field.',
  separator: 'Visually or semantically separates content.',
  breadcrumb: 'Displays the path to the current resource using a hierarchy of links.',
  pagination: 'Pagination with page navigation, previous and next links.',
  // Compound / suite components
  dialog: 'A window overlaid on the primary window, rendering content on top.',
  'alert-dialog':
    'A modal dialog that interrupts the user with important content and expects a response.',
  select: 'Displays a list of options for the user to pick from, triggered by a button.',
  tabs: 'A set of layered sections of content, known as tab panels.',
  accordion: 'A vertically stacked set of interactive headings that reveal content.',
  card: 'Displays a card with header, content, and footer.',
  table: 'A responsive table component for displaying tabular data.',
  alert: 'Displays a callout for important information.',
};
