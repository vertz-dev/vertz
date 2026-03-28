/**
 * Registers @vertz/ui context helpers with the Fast Refresh runtime.
 *
 * This module script runs after @vertz/ui/internals loads, providing the
 * real pushScope/popScope/getContextScope/setContextScope functions.
 * Without these, Fast Refresh re-mounting fails because useContext calls
 * can't find their providers.
 */
import {
  pushScope,
  popScope,
  getContextScope,
  setContextScope,
  startSignalCollection,
  stopSignalCollection,
  _tryOnCleanup,
  runCleanups,
} from '/@deps/@vertz/ui/dist/src/internals.js';

var fr = globalThis[Symbol.for('vertz:fast-refresh')];
if (fr && typeof fr.registerHelpers === 'function') {
  fr.registerHelpers({
    pushScope: pushScope,
    popScope: popScope,
    getContextScope: getContextScope,
    setContextScope: setContextScope,
    startSignalCollection: startSignalCollection,
    stopSignalCollection: stopSignalCollection,
    _tryOnCleanup: _tryOnCleanup,
    runCleanups: runCleanups,
  });
}
