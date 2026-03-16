---
'@vertz/ui-primitives': patch
'@vertz/theme-shadcn': patch
---

fix(ui-primitives,theme-shadcn): wire missing DropdownMenu onOpenChange, AlertDialog Header, and Select indicator/chevron

- DropdownMenu: add `onOpenChange` to `ComposedDropdownMenuProps` and themed `DropdownMenuRootProps`, forward to `Menu.Root`
- AlertDialog: expose `Header` sub-component on `ThemedAlertDialogComponent` type and factory
- Select: add check indicator (`data-part="indicator"`) to items and chevron icon (`data-part="chevron"`) to trigger, wire `itemIndicator` class through themed factory
