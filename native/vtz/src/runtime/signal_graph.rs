use bitvec::vec::BitVec;
use deno_core::v8;
use smallvec::SmallVec;
use thiserror::Error;

/// Preparation data for a computed evaluation (used by ops layer for reentrant-safe V8 calls).
pub struct ComputedEvalPrep {
    /// The compute function to call in V8.
    pub compute_fn: v8::Global<v8::Function>,
    /// The tracking_subscriber that was active before this evaluation started.
    pub old_tracking: Option<u32>,
}

/// Preparation data for an effect execution (used by ops layer for reentrant-safe V8 calls).
pub struct EffectRunPrep {
    /// The effect function to call in V8.
    pub effect_fn: v8::Global<v8::Function>,
    /// The tracking_subscriber that was active before this effect ran.
    pub old_tracking: Option<u32>,
}

/// Result of `try_read`: either the value is ready or the computed needs evaluation.
pub enum ReadOutcome<'a> {
    /// Value is ready (signal or clean computed). Dependencies already tracked.
    Ready(v8::Local<'a, v8::Value>),
    /// Computed needs evaluation. Caller must orchestrate V8 call via
    /// `begin_evaluate_computed` / V8 call / `complete_evaluate_computed`.
    NeedsEval,
}

/// Errors returned by `SignalGraph` operations.
#[derive(Debug, Error)]
pub enum SignalGraphError {
    #[error("invalid signal node id: {0}")]
    InvalidId(u32),
    #[error("signal node {id} has been disposed{}", hmr_key.as_ref().map(|k| format!(" ({})", k)).unwrap_or_default())]
    NodeDisposed { id: u32, hmr_key: Option<String> },
    #[error("cycle detected: computed node {0} is already being evaluated")]
    CycleDetected(u32),
}

/// State machine for computed nodes.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ComputedState {
    /// Cached value is current.
    Clean,
    /// A source changed — needs re-evaluation on next read.
    Dirty,
    /// Currently being evaluated (used for cycle detection).
    Computing,
}

/// A node in the reactive signal graph.
pub enum SignalNode {
    Signal {
        value: v8::Global<v8::Value>,
        subscribers: SmallVec<[u32; 2]>,
        hmr_key: Option<String>,
    },
    Computed {
        compute_fn: v8::Global<v8::Function>,
        cached_value: Option<v8::Global<v8::Value>>,
        state: ComputedState,
        sources: SmallVec<[u32; 2]>,
        subscribers: SmallVec<[u32; 2]>,
    },
    Effect {
        effect_fn: v8::Global<v8::Function>,
        sources: SmallVec<[u32; 2]>,
        disposed: bool,
    },
    /// Placeholder for disposed/free slots. Retains `hmr_key` for error messages.
    Empty { hmr_key: Option<String> },
}

/// Rust-native reactive signal graph.
///
/// Graph metadata (nodes, edges, dirty flags) lives in Rust;
/// signal values remain as V8 Global handles.
pub struct SignalGraph {
    nodes: Vec<SignalNode>,
    free_list: Vec<u32>,
    pub(crate) batch_depth: u32,
    pending_effects: Vec<u32>,
    /// O(1) dedup: tracks which effect IDs are already in `pending_effects`.
    effect_scheduled: BitVec,
    tracking_subscriber: Option<u32>,
}

impl Default for SignalGraph {
    fn default() -> Self {
        Self::new()
    }
}

impl SignalGraph {
    /// Create a new signal graph with pre-allocated capacity.
    pub fn new() -> Self {
        Self {
            nodes: Vec::with_capacity(256),
            free_list: Vec::new(),
            batch_depth: 0,
            pending_effects: Vec::new(),
            effect_scheduled: BitVec::new(),
            tracking_subscriber: None,
        }
    }

    /// Allocate a node slot, reusing from free list if available.
    fn alloc_slot(&mut self, node: SignalNode) -> u32 {
        if let Some(id) = self.free_list.pop() {
            self.nodes[id as usize] = node;
            id
        } else {
            let id = self.nodes.len() as u32;
            self.nodes.push(node);
            // Grow the effect_scheduled bitset to match
            self.effect_scheduled.push(false);
            id
        }
    }

    /// Create a signal node. Returns the node ID.
    pub fn create_signal(
        &mut self,
        scope: &mut v8::HandleScope,
        value: v8::Local<v8::Value>,
        hmr_key: Option<String>,
    ) -> u32 {
        let global = v8::Global::new(scope, value);
        self.alloc_slot(SignalNode::Signal {
            value: global,
            subscribers: SmallVec::new(),
            hmr_key,
        })
    }

    /// Create a computed node. Starts in `Dirty` state so it evaluates on first read.
    pub fn create_computed(
        &mut self,
        scope: &mut v8::HandleScope,
        compute_fn: v8::Local<v8::Function>,
    ) -> u32 {
        let global_fn = v8::Global::new(scope, compute_fn);
        self.alloc_slot(SignalNode::Computed {
            compute_fn: global_fn,
            cached_value: None,
            state: ComputedState::Dirty,
            sources: SmallVec::new(),
            subscribers: SmallVec::new(),
        })
    }

    /// Allocate an effect node without running it. Used by the ops layer
    /// to separate allocation from V8 execution for reentrant safety.
    pub fn alloc_effect(
        &mut self,
        scope: &mut v8::HandleScope,
        effect_fn: v8::Local<v8::Function>,
    ) -> u32 {
        let global_fn = v8::Global::new(scope, effect_fn);
        self.alloc_slot(SignalNode::Effect {
            effect_fn: global_fn,
            sources: SmallVec::new(),
            disposed: false,
        })
    }

    /// Create an effect node. Runs `effect_fn` immediately to capture initial dependencies.
    pub fn create_effect(
        &mut self,
        scope: &mut v8::HandleScope,
        effect_fn: v8::Local<v8::Function>,
    ) -> u32 {
        let id = self.alloc_effect(scope, effect_fn);
        // Run effect immediately on creation to capture initial dependencies
        self.run_effect(scope, id);
        id
    }

    /// Add a tracking dependency edge: subscriber subscribes to source.
    /// Called during `read_signal`/`read_computed` when `tracking_subscriber` is set.
    fn track_dependency(&mut self, source_id: u32, subscriber_id: u32) {
        // Add subscriber to source's subscriber list
        let added_to_source = match &mut self.nodes[source_id as usize] {
            SignalNode::Signal { subscribers, .. } | SignalNode::Computed { subscribers, .. } => {
                if !subscribers.contains(&subscriber_id) {
                    subscribers.push(subscriber_id);
                    true
                } else {
                    false
                }
            }
            SignalNode::Empty { .. } | SignalNode::Effect { .. } => false,
        };

        // Add source to subscriber's source list (for cleanup on re-evaluation)
        if added_to_source {
            if let Some(SignalNode::Computed { sources, .. } | SignalNode::Effect { sources, .. }) =
                self.nodes.get_mut(subscriber_id as usize)
            {
                if !sources.contains(&source_id) {
                    sources.push(source_id);
                }
            }
        }
    }

    /// Read a signal's value. If `tracking_subscriber` is set, adds a
    /// dependency edge from this signal to the subscriber.
    pub fn read_signal<'a>(
        &mut self,
        scope: &mut v8::HandleScope<'a>,
        id: u32,
    ) -> Result<v8::Local<'a, v8::Value>, SignalGraphError> {
        let node = self
            .nodes
            .get(id as usize)
            .ok_or(SignalGraphError::InvalidId(id))?;

        match node {
            SignalNode::Signal { value, .. } => {
                let local = v8::Local::new(scope, value);

                // Track dependency if a subscriber is active
                if let Some(subscriber_id) = self.tracking_subscriber {
                    self.track_dependency(id, subscriber_id);
                }

                Ok(local)
            }
            SignalNode::Computed { .. } => {
                // Delegate to read_computed for transparent computed reads
                self.read_computed(scope, id)
            }
            SignalNode::Empty { hmr_key } => Err(SignalGraphError::NodeDisposed {
                id,
                hmr_key: hmr_key.clone(),
            }),
            SignalNode::Effect { .. } => Err(SignalGraphError::InvalidId(id)),
        }
    }

    /// Read a computed value. If dirty, re-evaluates by calling the compute function.
    /// Uses lazy evaluation — only recomputes when dirty AND accessed.
    pub fn read_computed<'a>(
        &mut self,
        scope: &mut v8::HandleScope<'a>,
        id: u32,
    ) -> Result<v8::Local<'a, v8::Value>, SignalGraphError> {
        let node = self
            .nodes
            .get(id as usize)
            .ok_or(SignalGraphError::InvalidId(id))?;

        match node {
            SignalNode::Computed { state, .. } => {
                match *state {
                    ComputedState::Computing => {
                        return Err(SignalGraphError::CycleDetected(id));
                    }
                    ComputedState::Clean => {
                        // Return cached value without re-evaluating
                        if let SignalNode::Computed {
                            cached_value: Some(cached),
                            ..
                        } = &self.nodes[id as usize]
                        {
                            let local = v8::Local::new(scope, cached);

                            // Track dependency if a subscriber is active
                            if let Some(subscriber_id) = self.tracking_subscriber {
                                self.track_dependency(id, subscriber_id);
                            }

                            return Ok(local);
                        }
                    }
                    ComputedState::Dirty => {
                        // Fall through to re-evaluate
                    }
                }
            }
            SignalNode::Empty { hmr_key } => {
                return Err(SignalGraphError::NodeDisposed {
                    id,
                    hmr_key: hmr_key.clone(),
                })
            }
            _ => return Err(SignalGraphError::InvalidId(id)),
        }

        // Re-evaluate the computed node
        self.evaluate_computed(scope, id)
    }

    /// Re-evaluate a computed node's function and update its cached value.
    fn evaluate_computed<'a>(
        &mut self,
        scope: &mut v8::HandleScope<'a>,
        id: u32,
    ) -> Result<v8::Local<'a, v8::Value>, SignalGraphError> {
        // 1. Set state to Computing (cycle detection)
        if let SignalNode::Computed { state, .. } = &mut self.nodes[id as usize] {
            *state = ComputedState::Computing;
        }

        // 2. Clear old sources: remove self from each source's subscribers list
        let old_sources: SmallVec<[u32; 2]> =
            if let SignalNode::Computed { sources, .. } = &self.nodes[id as usize] {
                sources.clone()
            } else {
                SmallVec::new()
            };

        for source_id in &old_sources {
            match &mut self.nodes[*source_id as usize] {
                SignalNode::Signal { subscribers, .. }
                | SignalNode::Computed { subscribers, .. } => {
                    subscribers.retain(|s| *s != id);
                }
                _ => {}
            }
        }

        // Clear the computed's own sources list
        if let SignalNode::Computed { sources, .. } = &mut self.nodes[id as usize] {
            sources.clear();
        }

        // 3. Save and set tracking_subscriber to this computed's ID
        let prev_subscriber = self.tracking_subscriber;
        self.tracking_subscriber = Some(id);

        // 4. Call compute_fn in V8
        let compute_fn_global =
            if let SignalNode::Computed { compute_fn, .. } = &self.nodes[id as usize] {
                compute_fn.clone()
            } else {
                self.tracking_subscriber = prev_subscriber;
                return Err(SignalGraphError::InvalidId(id));
            };

        let compute_fn_local = v8::Local::new(scope, &compute_fn_global);
        let undefined = v8::undefined(scope).into();
        let result = compute_fn_local.call(scope, undefined, &[]);

        // 5. Restore previous tracking_subscriber
        self.tracking_subscriber = prev_subscriber;

        let new_value = result.unwrap_or_else(|| v8::undefined(scope).into());

        // 6. Check if value changed (Object.is) and decide whether to notify
        let value_changed = if let SignalNode::Computed {
            cached_value: Some(old_cached),
            ..
        } = &self.nodes[id as usize]
        {
            let old_local = v8::Local::new(scope, old_cached);
            !old_local.same_value(new_value)
        } else {
            true // No cached value yet — always "changed"
        };

        // Cache new value
        let new_global = v8::Global::new(scope, new_value);
        if let SignalNode::Computed {
            cached_value,
            state,
            ..
        } = &mut self.nodes[id as usize]
        {
            *cached_value = Some(new_global);
            // 8. Set state to Clean
            *state = ComputedState::Clean;
        }

        // 7. If value changed, notify own subscribers
        if value_changed {
            let subscribers: SmallVec<[u32; 2]> =
                if let SignalNode::Computed { subscribers, .. } = &self.nodes[id as usize] {
                    subscribers.clone()
                } else {
                    SmallVec::new()
                };

            for subscriber_id in subscribers {
                self.schedule_notify(subscriber_id);
            }
        }

        // Track dependency from outer subscriber (if any)
        if let Some(subscriber_id) = self.tracking_subscriber {
            self.track_dependency(id, subscriber_id);
        }

        // Return the cached local value
        if let SignalNode::Computed {
            cached_value: Some(cached),
            ..
        } = &self.nodes[id as usize]
        {
            Ok(v8::Local::new(scope, cached))
        } else {
            Err(SignalGraphError::InvalidId(id))
        }
    }

    /// Write a new value to a signal. Uses `Object.is()` semantics
    /// (V8's `same_value()`) for equality — skips if unchanged.
    ///
    /// Auto-batches: if no explicit batch is active, wraps the write
    /// in an implicit batch so effects flush after notification.
    pub fn write_signal(
        &mut self,
        scope: &mut v8::HandleScope,
        id: u32,
        new_value: v8::Local<v8::Value>,
    ) -> Result<(), SignalGraphError> {
        let node = self
            .nodes
            .get(id as usize)
            .ok_or(SignalGraphError::InvalidId(id))?;

        match node {
            SignalNode::Signal { value, .. } => {
                let old_local = v8::Local::new(scope, value);
                // Object.is() semantics: NaN === NaN, +0 !== -0
                if old_local.same_value(new_value) {
                    return Ok(());
                }

                // Auto-batch: wrap in implicit batch if not already batching
                let auto_batch = self.batch_depth == 0;
                if auto_batch {
                    self.batch_start();
                }

                // Update the stored value
                let new_global = v8::Global::new(scope, new_value);
                if let SignalNode::Signal { value, .. } = &mut self.nodes[id as usize] {
                    *value = new_global;
                }

                // Notify subscribers
                let subscribers: SmallVec<[u32; 2]> =
                    if let SignalNode::Signal { subscribers, .. } = &self.nodes[id as usize] {
                        subscribers.clone()
                    } else {
                        SmallVec::new()
                    };

                for subscriber_id in subscribers {
                    self.schedule_notify(subscriber_id);
                }

                // End auto-batch (flushes effects)
                if auto_batch {
                    self.batch_end(scope)?;
                }

                Ok(())
            }
            SignalNode::Computed { .. } | SignalNode::Effect { .. } => {
                Err(SignalGraphError::InvalidId(id))
            }
            SignalNode::Empty { hmr_key } => Err(SignalGraphError::NodeDisposed {
                id,
                hmr_key: hmr_key.clone(),
            }),
        }
    }

    /// Begin an explicit batch. Nested batches are supported.
    pub fn batch_start(&mut self) {
        self.batch_depth += 1;
    }

    /// End an explicit batch. If this is the outermost batch, flush pending effects.
    pub fn batch_end(&mut self, scope: &mut v8::HandleScope) -> Result<(), SignalGraphError> {
        self.batch_depth = self.batch_depth.saturating_sub(1);
        if self.batch_depth == 0 {
            self.flush_effects(scope)?;
        }
        Ok(())
    }

    /// Flush all pending effects. Iterative: effects may trigger new signal writes,
    /// which queue more effects. Loop exits when no more effects are pending.
    fn flush_effects(&mut self, scope: &mut v8::HandleScope) -> Result<(), SignalGraphError> {
        loop {
            if self.pending_effects.is_empty() {
                break;
            }

            // Drain current batch of effects
            let effects: Vec<u32> = self.pending_effects.drain(..).collect();
            // Clear the scheduled bitset for the next iteration
            self.effect_scheduled.fill(false);

            for effect_id in effects {
                self.run_effect(scope, effect_id);
            }
        }
        Ok(())
    }

    /// Run a single effect: clear old sources, set tracking, call function, restore.
    fn run_effect(&mut self, scope: &mut v8::HandleScope, id: u32) {
        // Check if disposed
        if let Some(SignalNode::Effect { disposed, .. }) = self.nodes.get(id as usize) {
            if *disposed {
                return;
            }
        } else {
            return;
        }

        // 1. Clear old sources: remove self from each source's subscribers
        let old_sources: SmallVec<[u32; 2]> =
            if let SignalNode::Effect { sources, .. } = &self.nodes[id as usize] {
                sources.clone()
            } else {
                return;
            };

        for source_id in &old_sources {
            match &mut self.nodes[*source_id as usize] {
                SignalNode::Signal { subscribers, .. }
                | SignalNode::Computed { subscribers, .. } => {
                    subscribers.retain(|s| *s != id);
                }
                _ => {}
            }
        }

        // Clear effect's own sources
        if let SignalNode::Effect { sources, .. } = &mut self.nodes[id as usize] {
            sources.clear();
        }

        // 2. Set tracking_subscriber to this effect
        let prev_subscriber = self.tracking_subscriber;
        self.tracking_subscriber = Some(id);

        // 3. Call effect_fn in V8
        let effect_fn_global =
            if let SignalNode::Effect { effect_fn, .. } = &self.nodes[id as usize] {
                effect_fn.clone()
            } else {
                self.tracking_subscriber = prev_subscriber;
                return;
            };

        let effect_fn_local = v8::Local::new(scope, &effect_fn_global);
        let undefined = v8::undefined(scope).into();
        let _ = effect_fn_local.call(scope, undefined, &[]);

        // 4. Restore tracking_subscriber
        self.tracking_subscriber = prev_subscriber;
    }

    /// Schedule a subscriber notification.
    /// Computed subscribers are marked dirty synchronously.
    /// Effect subscribers are queued for batch flush.
    fn schedule_notify(&mut self, subscriber_id: u32) {
        match self.nodes.get(subscriber_id as usize) {
            Some(SignalNode::Computed { state, .. }) => {
                if *state != ComputedState::Dirty {
                    self.mark_computed_dirty(subscriber_id);
                }
            }
            Some(SignalNode::Effect { disposed, .. }) => {
                if !disposed && !self.effect_scheduled[subscriber_id as usize] {
                    self.effect_scheduled.set(subscriber_id as usize, true);
                    self.pending_effects.push(subscriber_id);
                }
            }
            _ => {}
        }
    }

    /// Mark a computed as dirty and propagate to its own subscribers.
    fn mark_computed_dirty(&mut self, id: u32) {
        if let SignalNode::Computed {
            state, subscribers, ..
        } = &mut self.nodes[id as usize]
        {
            if *state == ComputedState::Dirty {
                return; // Already dirty — dedup
            }
            *state = ComputedState::Dirty;

            // Propagate to own subscribers
            let own_subscribers = subscribers.clone();
            for sub_id in own_subscribers {
                self.schedule_notify(sub_id);
            }
        }
    }

    // ── Reentrant-safe split methods (for ops layer) ──
    //
    // These methods split V8-calling operations into pre/post phases
    // so the ops layer can release RefCell borrows before V8 callbacks.
    // The existing monolithic methods (`evaluate_computed`, `run_effect`,
    // `flush_effects`) remain for direct use in unit tests.

    /// Try to read a signal or computed value without calling V8.
    /// Returns `Ready` for signals and clean computeds, `NeedsEval` for dirty computeds.
    /// Dependencies are tracked in the `Ready` case.
    pub fn try_read<'a>(
        &mut self,
        scope: &mut v8::HandleScope<'a>,
        id: u32,
    ) -> Result<ReadOutcome<'a>, SignalGraphError> {
        let node = self
            .nodes
            .get(id as usize)
            .ok_or(SignalGraphError::InvalidId(id))?;

        match node {
            SignalNode::Signal { value, .. } => {
                let local = v8::Local::new(scope, value);
                // NLL: node/value borrow ends here
                if let Some(sub) = self.tracking_subscriber {
                    self.track_dependency(id, sub);
                }
                Ok(ReadOutcome::Ready(local))
            }
            SignalNode::Computed {
                state: ComputedState::Clean,
                cached_value: Some(cached),
                ..
            } => {
                let local = v8::Local::new(scope, cached);
                if let Some(sub) = self.tracking_subscriber {
                    self.track_dependency(id, sub);
                }
                Ok(ReadOutcome::Ready(local))
            }
            SignalNode::Computed {
                state: ComputedState::Dirty,
                ..
            }
            | SignalNode::Computed {
                state: ComputedState::Clean,
                cached_value: None,
                ..
            } => Ok(ReadOutcome::NeedsEval),
            SignalNode::Computed {
                state: ComputedState::Computing,
                ..
            } => Err(SignalGraphError::CycleDetected(id)),
            SignalNode::Empty { hmr_key } => Err(SignalGraphError::NodeDisposed {
                id,
                hmr_key: hmr_key.clone(),
            }),
            SignalNode::Effect { .. } => Err(SignalGraphError::InvalidId(id)),
        }
    }

    /// Prepare a computed node for evaluation. Sets state to Computing,
    /// clears old source subscriptions, and saves/sets tracking_subscriber.
    /// Does NOT call V8.
    pub fn begin_evaluate_computed(
        &mut self,
        id: u32,
    ) -> Result<ComputedEvalPrep, SignalGraphError> {
        // Check for cycle
        match self.nodes.get(id as usize) {
            Some(SignalNode::Computed {
                state: ComputedState::Computing,
                ..
            }) => return Err(SignalGraphError::CycleDetected(id)),
            Some(SignalNode::Computed { .. }) => {}
            _ => return Err(SignalGraphError::InvalidId(id)),
        }

        // Set state to Computing
        if let SignalNode::Computed { state, .. } = &mut self.nodes[id as usize] {
            *state = ComputedState::Computing;
        }

        // Clear old sources: remove self from each source's subscribers list
        let old_sources: SmallVec<[u32; 2]> =
            if let SignalNode::Computed { sources, .. } = &self.nodes[id as usize] {
                sources.clone()
            } else {
                SmallVec::new()
            };

        for source_id in &old_sources {
            if let Some(
                SignalNode::Signal { subscribers, .. } | SignalNode::Computed { subscribers, .. },
            ) = self.nodes.get_mut(*source_id as usize)
            {
                subscribers.retain(|s| *s != id);
            }
        }

        if let SignalNode::Computed { sources, .. } = &mut self.nodes[id as usize] {
            sources.clear();
        }

        // Save and set tracking_subscriber
        let old_tracking = self.tracking_subscriber;
        self.tracking_subscriber = Some(id);

        // Clone compute function
        let compute_fn = if let SignalNode::Computed { compute_fn, .. } = &self.nodes[id as usize] {
            compute_fn.clone()
        } else {
            self.tracking_subscriber = old_tracking;
            return Err(SignalGraphError::InvalidId(id));
        };

        Ok(ComputedEvalPrep {
            compute_fn,
            old_tracking,
        })
    }

    /// Complete a computed evaluation with the V8-produced value.
    /// Restores tracking_subscriber, caches value, notifies if changed.
    /// Does NOT call V8.
    pub fn complete_evaluate_computed<'a>(
        &mut self,
        scope: &mut v8::HandleScope<'a>,
        id: u32,
        new_value: v8::Local<'a, v8::Value>,
        prep: ComputedEvalPrep,
    ) -> Result<v8::Local<'a, v8::Value>, SignalGraphError> {
        // Restore tracking_subscriber
        self.tracking_subscriber = prep.old_tracking;

        // Check if value changed (Object.is)
        let value_changed = if let SignalNode::Computed {
            cached_value: Some(old),
            ..
        } = &self.nodes[id as usize]
        {
            let old_local = v8::Local::new(scope, old);
            !old_local.same_value(new_value)
        } else {
            true // No cached value yet
        };

        // Cache new value and set Clean
        let new_global = v8::Global::new(scope, new_value);
        if let SignalNode::Computed {
            cached_value,
            state,
            ..
        } = &mut self.nodes[id as usize]
        {
            *cached_value = Some(new_global);
            *state = ComputedState::Clean;
        }

        // Notify subscribers if changed
        if value_changed {
            let subscribers: SmallVec<[u32; 2]> =
                if let SignalNode::Computed { subscribers, .. } = &self.nodes[id as usize] {
                    subscribers.clone()
                } else {
                    SmallVec::new()
                };

            for sub_id in subscribers {
                self.schedule_notify(sub_id);
            }
        }

        // Track dependency from outer subscriber
        if let Some(sub_id) = self.tracking_subscriber {
            self.track_dependency(id, sub_id);
        }

        // Return cached value
        if let SignalNode::Computed {
            cached_value: Some(cached),
            ..
        } = &self.nodes[id as usize]
        {
            Ok(v8::Local::new(scope, cached))
        } else {
            Err(SignalGraphError::InvalidId(id))
        }
    }

    /// Write a signal value without auto-batch flush. Notifies subscribers
    /// (marks computeds dirty, queues effects) but does NOT flush effects.
    /// Returns `true` if the value changed.
    pub fn write_signal_no_flush(
        &mut self,
        scope: &mut v8::HandleScope,
        id: u32,
        new_value: v8::Local<v8::Value>,
    ) -> Result<bool, SignalGraphError> {
        let node = self
            .nodes
            .get(id as usize)
            .ok_or(SignalGraphError::InvalidId(id))?;

        match node {
            SignalNode::Signal { value, .. } => {
                let old_local = v8::Local::new(scope, value);
                if old_local.same_value(new_value) {
                    return Ok(false);
                }

                let new_global = v8::Global::new(scope, new_value);
                if let SignalNode::Signal { value, .. } = &mut self.nodes[id as usize] {
                    *value = new_global;
                }

                let subscribers: SmallVec<[u32; 2]> =
                    if let SignalNode::Signal { subscribers, .. } = &self.nodes[id as usize] {
                        subscribers.clone()
                    } else {
                        SmallVec::new()
                    };

                for subscriber_id in subscribers {
                    self.schedule_notify(subscriber_id);
                }

                Ok(true)
            }
            SignalNode::Computed { .. } | SignalNode::Effect { .. } => {
                Err(SignalGraphError::InvalidId(id))
            }
            SignalNode::Empty { hmr_key } => Err(SignalGraphError::NodeDisposed {
                id,
                hmr_key: hmr_key.clone(),
            }),
        }
    }

    /// Prepare an effect for execution. Clears old sources, sets tracking.
    /// Returns `None` if the effect is disposed or invalid.
    /// Does NOT call V8.
    pub fn begin_run_effect(&mut self, id: u32) -> Option<EffectRunPrep> {
        // Check if disposed
        match self.nodes.get(id as usize) {
            Some(SignalNode::Effect { disposed, .. }) if !disposed => {}
            _ => return None,
        }

        // Clear old sources
        let old_sources: SmallVec<[u32; 2]> =
            if let SignalNode::Effect { sources, .. } = &self.nodes[id as usize] {
                sources.clone()
            } else {
                return None;
            };

        for source_id in &old_sources {
            if let Some(
                SignalNode::Signal { subscribers, .. } | SignalNode::Computed { subscribers, .. },
            ) = self.nodes.get_mut(*source_id as usize)
            {
                subscribers.retain(|s| *s != id);
            }
        }

        if let SignalNode::Effect { sources, .. } = &mut self.nodes[id as usize] {
            sources.clear();
        }

        // Save and set tracking
        let old_tracking = self.tracking_subscriber;
        self.tracking_subscriber = Some(id);

        // Clone effect function
        let effect_fn = if let SignalNode::Effect { effect_fn, .. } = &self.nodes[id as usize] {
            effect_fn.clone()
        } else {
            self.tracking_subscriber = old_tracking;
            return None;
        };

        Some(EffectRunPrep {
            effect_fn,
            old_tracking,
        })
    }

    /// Complete an effect execution. Restores tracking_subscriber.
    /// Does NOT call V8.
    pub fn complete_run_effect(&mut self, prep: EffectRunPrep) {
        self.tracking_subscriber = prep.old_tracking;
    }

    /// Check if there are pending effects to flush.
    pub fn has_pending_effects(&self) -> bool {
        !self.pending_effects.is_empty()
    }

    /// Drain pending effects for flushing. Returns effect IDs and clears the bitset.
    pub fn drain_pending_effects(&mut self) -> Vec<u32> {
        let effects: Vec<u32> = self.pending_effects.drain(..).collect();
        self.effect_scheduled.fill(false);
        effects
    }

    /// Dispose a single node, dropping its V8 Global handle.
    /// Preserves `hmr_key` for error messages on subsequent access.
    pub fn dispose(&mut self, id: u32) {
        if id as usize >= self.nodes.len() {
            return;
        }

        // Collect sources to clean up (for computed/effect nodes)
        let old_sources: SmallVec<[u32; 2]> = match &self.nodes[id as usize] {
            SignalNode::Computed { sources, .. } | SignalNode::Effect { sources, .. } => {
                sources.clone()
            }
            _ => SmallVec::new(),
        };

        // Remove self from all sources' subscriber lists
        for source_id in &old_sources {
            if let Some(
                SignalNode::Signal { subscribers, .. } | SignalNode::Computed { subscribers, .. },
            ) = self.nodes.get_mut(*source_id as usize)
            {
                subscribers.retain(|s| *s != id);
            }
        }

        // Preserve hmr_key for error messages
        let hmr_key = if let SignalNode::Signal { hmr_key, .. } = &mut self.nodes[id as usize] {
            hmr_key.take()
        } else {
            None
        };

        self.nodes[id as usize] = SignalNode::Empty { hmr_key };
        self.free_list.push(id);
    }

    /// Mark an effect as disposed so it won't run again.
    pub fn dispose_effect(&mut self, id: u32) {
        if let Some(SignalNode::Effect { disposed, .. }) = self.nodes.get_mut(id as usize) {
            *disposed = true;
        }
        self.dispose(id);
    }

    /// Dispose all nodes. Called by `Drop`.
    pub fn dispose_all(&mut self) {
        for node in &mut self.nodes {
            *node = SignalNode::Empty { hmr_key: None };
        }
        self.free_list.clear();
        self.pending_effects.clear();
        self.effect_scheduled.fill(false);
    }

    /// Returns the number of live (non-empty) nodes.
    #[cfg(test)]
    fn live_node_count(&self) -> usize {
        self.nodes
            .iter()
            .filter(|n| !matches!(n, SignalNode::Empty { .. }))
            .count()
    }
}

impl Drop for SignalGraph {
    fn drop(&mut self) {
        self.dispose_all();
    }
}

#[cfg(test)]
#[path = "signal_graph_tests.rs"]
mod tests;
