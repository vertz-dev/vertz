import { mount } from "@vertz/ui";
import { App, globalStyles } from "./app";
import { appTheme } from "./styles/theme";

(import.meta as ImportMeta & { hot?: { accept(): void } }).hot?.accept();

mount(App, {
  theme: appTheme,
  styles: globalStyles,
});
