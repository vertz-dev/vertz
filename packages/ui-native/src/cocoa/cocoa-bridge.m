/**
 * Cocoa bridge for native macOS controls.
 *
 * Wraps NSTextField and other AppKit controls into flat C functions
 * callable via Bun's FFI. Compiled at runtime with cc().
 *
 * All functions use void* for opaque pointers to Obj-C objects.
 */

#import <Cocoa/Cocoa.h>

/* ---------- NSTextField ---------- */

/**
 * Create a native text field positioned at (x, y) with size (w, h).
 * Coordinates use macOS convention (origin at bottom-left).
 */
void* vt_cocoa_create_text_field(double x, double y, double w, double h) {
  NSTextField *field = [[NSTextField alloc] initWithFrame:NSMakeRect(x, y, w, h)];
  [field setStringValue:@""];
  [field setBezeled:NO];
  [field setBordered:NO];
  [field setEditable:YES];
  [field setSelectable:YES];
  [field setFocusRingType:NSFocusRingTypeNone];

  /* Dark theme styling — no bezel so background color is visible */
  [field setDrawsBackground:YES];
  [field setBackgroundColor:[NSColor colorWithRed:0.18 green:0.18 blue:0.20 alpha:1.0]];
  [field setTextColor:[NSColor whiteColor]];
  [field setFont:[NSFont systemFontOfSize:14.0]];

  /* Layer-backed for rounded corners and custom border */
  [field setWantsLayer:YES];
  field.layer.cornerRadius = 6.0;
  field.layer.masksToBounds = YES;
  field.layer.borderWidth = 1.0;
  field.layer.borderColor = [NSColor colorWithRed:0.35 green:0.35 blue:0.40 alpha:1.0].CGColor;

  /* Add internal padding via cell */
  [[field cell] setWraps:NO];
  [[field cell] setScrollable:YES];

  return (__bridge_retained void*)field;
}

/**
 * Add a text field (or any NSView) as a subview of the given NSWindow's contentView.
 */
void vt_cocoa_add_to_window(void* nswindow, void* nsview) {
  NSWindow *win = (__bridge NSWindow*)nswindow;
  NSView *view = (__bridge NSView*)nsview;
  [[win contentView] addSubview:view];
}

/**
 * Remove a view from its superview.
 */
void vt_cocoa_remove_from_window(void* nsview) {
  NSView *view = (__bridge NSView*)nsview;
  [view removeFromSuperview];
}

/**
 * Get the text value of an NSTextField.
 * Returns a pointer to a UTF-8 C string (valid until next call).
 */
static char text_buffer[4096];
const char* vt_cocoa_get_text(void* textfield) {
  NSTextField *field = (__bridge NSTextField*)textfield;
  NSString *str = [field stringValue];
  const char *utf8 = [str UTF8String];
  if (!utf8) return "";
  strncpy(text_buffer, utf8, sizeof(text_buffer) - 1);
  text_buffer[sizeof(text_buffer) - 1] = '\0';
  return text_buffer;
}

/**
 * Set the text value of an NSTextField.
 */
void vt_cocoa_set_text(void* textfield, const char* text) {
  NSTextField *field = (__bridge NSTextField*)textfield;
  [field setStringValue:[NSString stringWithUTF8String:text]];
}

/**
 * Set the placeholder text of an NSTextField.
 */
void vt_cocoa_set_placeholder(void* textfield, const char* text) {
  NSTextField *field = (__bridge NSTextField*)textfield;
  [field setPlaceholderString:[NSString stringWithUTF8String:text]];
}

/**
 * Reposition and resize a text field.
 * Coordinates use macOS convention (origin at bottom-left).
 */
void vt_cocoa_set_frame(void* nsview, double x, double y, double w, double h) {
  NSView *view = (__bridge NSView*)nsview;
  [view setFrame:NSMakeRect(x, y, w, h)];
}

/**
 * Set background color of an NSTextField (RGBA floats 0..1).
 */
void vt_cocoa_set_bg_color(void* textfield, double r, double g, double b, double a) {
  NSTextField *field = (__bridge NSTextField*)textfield;
  [field setBackgroundColor:[NSColor colorWithRed:r green:g blue:b alpha:a]];
  [field setDrawsBackground:YES];
}

/**
 * Set text color of an NSTextField (RGBA floats 0..1).
 */
void vt_cocoa_set_text_color(void* textfield, double r, double g, double b, double a) {
  NSTextField *field = (__bridge NSTextField*)textfield;
  [field setTextColor:[NSColor colorWithRed:r green:g blue:b alpha:a]];
}

/**
 * Set font size of an NSTextField.
 */
void vt_cocoa_set_font_size(void* textfield, double size) {
  NSTextField *field = (__bridge NSTextField*)textfield;
  [field setFont:[NSFont systemFontOfSize:size]];
}

/**
 * Set whether the text field has a visible border.
 */
void vt_cocoa_set_bordered(void* textfield, int bordered) {
  NSTextField *field = (__bridge NSTextField*)textfield;
  [field setBordered:bordered ? YES : NO];
  [field setBezeled:bordered ? YES : NO];
}

/**
 * Set the border color using a layer-backed approach.
 */
void vt_cocoa_set_border_color(void* textfield, double r, double g, double b, double a) {
  NSTextField *field = (__bridge NSTextField*)textfield;
  [field setWantsLayer:YES];
  field.layer.borderColor = [NSColor colorWithRed:r green:g blue:b alpha:a].CGColor;
  field.layer.borderWidth = 1.0;
}

/**
 * Set corner radius.
 */
void vt_cocoa_set_corner_radius(void* textfield, double radius) {
  NSTextField *field = (__bridge NSTextField*)textfield;
  [field setWantsLayer:YES];
  field.layer.cornerRadius = radius;
  field.layer.masksToBounds = YES;
}

/**
 * Make the text field the first responder (focus it).
 */
void vt_cocoa_focus(void* textfield) {
  NSTextField *field = (__bridge NSTextField*)textfield;
  [[field window] makeFirstResponder:field];
}

/**
 * Check if the text field is currently the first responder.
 */
int vt_cocoa_is_focused(void* textfield) {
  NSTextField *field = (__bridge NSTextField*)textfield;
  NSWindow *win = [field window];
  if (!win) return 0;
  /* NSTextField uses a field editor, so check the field editor's delegate */
  id firstResp = [win firstResponder];
  if (firstResp == field) return 1;
  if ([firstResp isKindOfClass:[NSTextView class]]) {
    NSTextView *editor = (NSTextView*)firstResp;
    return [editor delegate] == (id)field ? 1 : 0;
  }
  return 0;
}

/**
 * Release a retained Obj-C object.
 */
void vt_cocoa_release(void* obj) {
  if (obj) {
    CFRelease(obj);
  }
}

/**
 * Get the content view height (needed for coordinate flipping).
 */
double vt_cocoa_content_height(void* nswindow) {
  NSWindow *win = (__bridge NSWindow*)nswindow;
  return [[win contentView] frame].size.height;
}
