import { Container, Graphics, Text } from 'pixi.js';

/**
 * Creates a debug overlay that draws wireframe bounding boxes and labels
 * for all display objects in the stage. Toggle via the `debug` prop on CanvasLayer.
 */
export function createDebugOverlay(stage: Container): {
  overlay: Container;
  update: () => void;
  destroy: () => void;
} {
  const overlay = new Container();
  overlay.label = '__debug_overlay';

  function update() {
    overlay.removeChildren();
    drawDebugRecursive(stage, overlay);
  }

  function drawDebugRecursive(node: Container, debugLayer: Container) {
    for (const child of node.children) {
      if (child === overlay) continue;

      if (child instanceof Container) {
        const bounds = child.getBounds();
        const box = new Graphics();
        box.rect(bounds.x, bounds.y, bounds.width, bounds.height);
        box.stroke({ width: 1, color: 0x00ff00, alpha: 0.5 });
        debugLayer.addChild(box);

        if (child.label) {
          const label = new Text({
            text: child.label,
            style: { fontSize: 10, fill: 0x00ff00 },
          });
          label.x = bounds.x;
          label.y = bounds.y - 12;
          debugLayer.addChild(label);
        }

        if (child.children.length > 0) {
          drawDebugRecursive(child as Container, debugLayer);
        }
      }
    }
  }

  return {
    overlay,
    update,
    destroy: () => {
      overlay.removeChildren();
      overlay.destroy({ children: true });
    },
  };
}
