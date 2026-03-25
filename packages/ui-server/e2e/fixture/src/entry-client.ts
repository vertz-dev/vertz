import { mount } from "@vertz/ui";
import { App } from "./app";

// HMR self-accept — prevents full page reloads when module graph changes
// propagate to the entry point. Component-level Fast Refresh handles actual changes.
import.meta.hot.accept();

mount(App);
