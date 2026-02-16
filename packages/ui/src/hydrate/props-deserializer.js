/**
 * Reads serialized props from a `<script type="application/json">` tag
 * within the hydration boundary element.
 */
export function deserializeProps(container) {
  const script = container.querySelector('script[type="application/json"]');
  if (!script || !script.textContent) {
    return {};
  }
  try {
    return JSON.parse(script.textContent);
  } catch {
    return {};
  }
}
//# sourceMappingURL=props-deserializer.js.map
