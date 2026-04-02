// E2E page API — wraps deno_core ops into a developer-friendly interface.
// Only loaded in e2e test mode.

((globalThis) => {
  "use strict";

  class ElementHandle {
    constructor(id) {
      this._id = id;
    }
    async click(opts = {}) {
      return Deno.core.ops.op_e2e_click("__id:" + this._id, opts.timeout ?? 5000);
    }
    async fill(value, opts = {}) {
      return Deno.core.ops.op_e2e_fill("__id:" + this._id, value, opts.timeout ?? 5000);
    }
    async type(text, opts = {}) {
      return Deno.core.ops.op_e2e_type("__id:" + this._id, text, opts.timeout ?? 5000);
    }
    async textContent() {
      return Deno.core.ops.op_e2e_text_content("__id:" + this._id, 5000);
    }
    async getAttribute(name) {
      return Deno.core.ops.op_e2e_get_attribute("__id:" + this._id, name, 5000);
    }
    async isVisible() {
      return Deno.core.ops.op_e2e_is_visible("__id:" + this._id, 5000);
    }
    async isChecked() {
      return Deno.core.ops.op_e2e_is_checked("__id:" + this._id, 5000);
    }
  }

  const page = {
    async navigate(url, opts = {}) {
      await Deno.core.ops.op_e2e_navigate(url, opts.timeout ?? 5000);
    },

    async reload(opts = {}) {
      await Deno.core.ops.op_e2e_evaluate(
        "(() => { location.reload(); return true; })()",
        opts.timeout ?? 5000
      );
    },

    async url() {
      return Deno.core.ops.op_e2e_url();
    },

    async click(selector, opts = {}) {
      return Deno.core.ops.op_e2e_click(selector, opts.timeout ?? 5000);
    },

    async fill(selector, value, opts = {}) {
      return Deno.core.ops.op_e2e_fill(selector, value, opts.timeout ?? 5000);
    },

    async type(selector, text, opts = {}) {
      return Deno.core.ops.op_e2e_type(selector, text, opts.timeout ?? 5000);
    },

    async press(key, opts = {}) {
      return Deno.core.ops.op_e2e_press(key, opts.timeout ?? 5000);
    },

    async check(selector, opts = {}) {
      return Deno.core.ops.op_e2e_check(selector, opts.timeout ?? 5000);
    },

    async uncheck(selector, opts = {}) {
      return Deno.core.ops.op_e2e_uncheck(selector, opts.timeout ?? 5000);
    },

    async selectOption(selector, value, opts = {}) {
      return Deno.core.ops.op_e2e_select_option(selector, value, opts.timeout ?? 5000);
    },

    async query(selector) {
      const id = await Deno.core.ops.op_e2e_query(selector);
      return id != null ? new ElementHandle(id) : null;
    },

    async queryAll(selector) {
      const ids = await Deno.core.ops.op_e2e_query_all(selector);
      return ids.map((id) => new ElementHandle(id));
    },

    async textContent(selectorOrHandle, opts = {}) {
      const key =
        typeof selectorOrHandle === "string"
          ? selectorOrHandle
          : "__id:" + selectorOrHandle._id;
      return Deno.core.ops.op_e2e_text_content(key, opts.timeout ?? 5000);
    },

    async innerHTML(selector, opts = {}) {
      return Deno.core.ops.op_e2e_inner_html(selector, opts.timeout ?? 5000);
    },

    async getAttribute(selector, name, opts = {}) {
      return Deno.core.ops.op_e2e_get_attribute(
        selector,
        name,
        opts.timeout ?? 5000
      );
    },

    async isVisible(selector, opts = {}) {
      return Deno.core.ops.op_e2e_is_visible(selector, opts.timeout ?? 5000);
    },

    async isChecked(selector, opts = {}) {
      return Deno.core.ops.op_e2e_is_checked(selector, opts.timeout ?? 5000);
    },

    async evaluate(fn, opts = {}) {
      const js = "(" + fn.toString() + ")()";
      const result = await Deno.core.ops.op_e2e_evaluate(
        js,
        opts.timeout ?? 5000
      );
      return JSON.parse(result);
    },

    async waitForSelector(selector, opts = {}) {
      const timeout = opts.timeout ?? 5000;
      const interval = 100;
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const id = await Deno.core.ops.op_e2e_query(selector);
        if (id != null) return new ElementHandle(id);
        await new Promise((r) => setTimeout(r, interval));
      }
      throw new Error(
        'timeout: waitForSelector("' + selector + '") exceeded ' + timeout + "ms"
      );
    },

    async waitForFunction(fn, opts = {}) {
      const timeout = opts.timeout ?? 5000;
      const interval = 100;
      const start = Date.now();
      const js = "(" + fn.toString() + ")()";
      while (Date.now() - start < timeout) {
        const result = await Deno.core.ops.op_e2e_evaluate(
          js,
          opts.timeout ?? 5000
        );
        if (JSON.parse(result)) return;
        await new Promise((r) => setTimeout(r, interval));
      }
      throw new Error(
        "timeout: waitForFunction exceeded " + timeout + "ms"
      );
    },

    async waitForNavigation(urlPattern, opts = {}) {
      const timeout = opts.timeout ?? 5000;
      const interval = 100;
      const start = Date.now();
      const startUrl = await page.url();
      while (Date.now() - start < timeout) {
        const current = await page.url();
        if (current !== startUrl) {
          if (!urlPattern || current.includes(urlPattern)) return;
        }
        await new Promise((r) => setTimeout(r, interval));
      }
      throw new Error(
        "timeout: waitForNavigation exceeded " + timeout + "ms"
      );
    },
  };

  globalThis.__vtz_e2e_page = page;
  globalThis.__vtz_e2e_ElementHandle = ElementHandle;
})(globalThis);
