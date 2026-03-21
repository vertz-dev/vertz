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
  // Form components
  checkbox: 'A control that allows the user to toggle between checked and not checked.',
  'date-picker': 'A date picker component with calendar dropdown for selecting dates.',
  'form-group': 'Groups a form label, input, and error message together.',
  'radio-group': 'A set of checkable buttons where only one can be checked at a time.',
  slider: 'An input for selecting a value from a range by dragging a handle.',
  switch: 'A control that toggles between on and off states.',
  toggle: 'A two-state button that can be either on or off.',
  // Layout components
  'resizable-panel': 'A group of resizable panels with draggable handles.',
  'scroll-area': 'A scrollable area with custom styled scrollbars.',
  skeleton: 'A placeholder to show while content is loading.',
  // Data Display components
  avatar: 'An image element with a fallback for representing the user.',
  calendar: 'A date calendar component for selecting dates.',
  progress: 'Displays an indicator showing the completion progress of a task.',
  // Feedback components
  drawer: 'A panel that slides out from the edge of the screen.',
  sheet: 'A panel that slides in from the edge of the screen as an overlay.',
  toast: 'A succinct message that is displayed temporarily.',
  // Navigation components
  command: 'A command palette for fast, searchable actions.',
  menubar: 'A horizontally stacked set of menus, typically at the top of the window.',
  'navigation-menu': 'A collection of links for navigating between pages.',
  // Overlay components
  'context-menu': 'A menu that appears on right-click with contextual actions.',
  'dropdown-menu': 'A menu of actions triggered by a button, displayed as a dropdown.',
  'hover-card': 'A card that appears on hover to preview content.',
  popover: 'A floating panel anchored to a trigger element.',
  tooltip: 'A small popup that provides additional information on hover.',
  // Disclosure components
  carousel: 'A slideshow component for cycling through content.',
  collapsible: 'A component that expands and collapses content.',
  'toggle-group': 'A group of toggle buttons where one or multiple can be active.',
};
