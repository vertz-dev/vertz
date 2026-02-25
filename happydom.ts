/**
 * Root-level test preload: registers happy-dom so DOM tests work when
 * running `bun test <path>` from the repo root. Packages (ui, ui-primitives,
 * ui-canvas) also have their own preload in bunfig.toml for when tests run
 * from the package directory or via Turbo.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'http://localhost/' });
