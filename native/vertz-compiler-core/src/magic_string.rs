use std::fmt;

/// A simple text mutation utility inspired by MagicString.
/// Collects edits (insertions, replacements, overwrites) and applies them in one pass.
pub struct MagicString {
    original: String,
    edits: Vec<Edit>,
}

#[derive(Debug, Clone)]
enum Edit {
    /// Overwrite a range [start, end) with new text.
    Overwrite {
        start: usize,
        end: usize,
        text: String,
    },
    /// Insert text before position.
    InsertBefore { pos: usize, text: String },
    /// Insert text after position.
    InsertAfter { pos: usize, text: String },
}

impl MagicString {
    pub fn new(source: &str) -> Self {
        Self {
            original: source.to_string(),
            edits: Vec::new(),
        }
    }

    /// Overwrite the range [start, end) with replacement text.
    pub fn overwrite(&mut self, start: u32, end: u32, text: &str) {
        self.edits.push(Edit::Overwrite {
            start: start as usize,
            end: end as usize,
            text: text.to_string(),
        });
    }

    /// Insert text immediately before position.
    pub fn prepend_left(&mut self, pos: u32, text: &str) {
        self.edits.push(Edit::InsertBefore {
            pos: pos as usize,
            text: text.to_string(),
        });
    }

    /// Insert text immediately after position.
    pub fn append_right(&mut self, pos: u32, text: &str) {
        self.edits.push(Edit::InsertAfter {
            pos: pos as usize,
            text: text.to_string(),
        });
    }

    /// Prepend text at the very beginning of the file.
    pub fn prepend(&mut self, text: &str) {
        self.edits.push(Edit::InsertBefore {
            pos: 0,
            text: text.to_string(),
        });
    }

    /// Append text at the very end of the file.
    pub fn append(&mut self, text: &str) {
        self.edits.push(Edit::InsertAfter {
            pos: self.original.len(),
            text: text.to_string(),
        });
    }

    /// Length of the original source in bytes.
    pub fn len(&self) -> u32 {
        self.original.len() as u32
    }

    pub fn is_empty(&self) -> bool {
        self.original.is_empty()
    }

    /// Get a slice of the original source.
    pub fn slice(&self, start: u32, end: u32) -> &str {
        &self.original[start as usize..end as usize]
    }

    /// Get a slice of the source WITH queued mutations applied.
    /// This is essential for the JSX transformer which needs to read expression text
    /// that includes `.value` additions from signal/computed transforms.
    pub fn get_transformed_slice(&self, start: u32, end: u32) -> String {
        let start = start as usize;
        let end = end as usize;

        // Collect edits that fall within or affect [start, end)
        let mut events: Vec<EditEvent> = Vec::new();
        for (idx, edit) in self.edits.iter().enumerate() {
            match edit {
                Edit::Overwrite {
                    start: es,
                    end: ee,
                    text,
                } => {
                    // Include if the overwrite overlaps with our range
                    if *es < end && *ee > start {
                        events.push(EditEvent {
                            pos: *es,
                            kind: EditEventKind::OverwriteStart {
                                end: *ee,
                                text: text.clone(),
                                idx,
                            },
                        });
                    }
                }
                Edit::InsertBefore { pos, text } => {
                    if *pos >= start && *pos <= end {
                        events.push(EditEvent {
                            pos: *pos,
                            kind: EditEventKind::InsertBefore {
                                text: text.clone(),
                                idx,
                            },
                        });
                    }
                }
                Edit::InsertAfter { pos, text } => {
                    // Use <= end to include appends at the end boundary
                    // (e.g., .value appended right after an identifier that ends at `end`)
                    if *pos >= start && *pos <= end {
                        events.push(EditEvent {
                            pos: *pos,
                            kind: EditEventKind::InsertAfter {
                                text: text.clone(),
                                idx,
                            },
                        });
                    }
                }
            }
        }

        if events.is_empty() {
            return self.original[start..end].to_string();
        }

        // Sort same as Display impl
        events.sort_by(|a, b| {
            a.pos.cmp(&b.pos).then_with(|| {
                let priority = |e: &EditEvent| match &e.kind {
                    EditEventKind::InsertBefore { .. } => 0,
                    EditEventKind::InsertAfter { .. } => 1,
                    EditEventKind::OverwriteStart { .. } => 2,
                };
                priority(a).cmp(&priority(b)).then_with(|| {
                    let idx_a = match &a.kind {
                        EditEventKind::InsertBefore { idx, .. }
                        | EditEventKind::InsertAfter { idx, .. }
                        | EditEventKind::OverwriteStart { idx, .. } => *idx,
                    };
                    let idx_b = match &b.kind {
                        EditEventKind::InsertBefore { idx, .. }
                        | EditEventKind::InsertAfter { idx, .. }
                        | EditEventKind::OverwriteStart { idx, .. } => *idx,
                    };
                    idx_a.cmp(&idx_b)
                })
            })
        });

        let mut result = String::new();
        let mut cursor = start;

        for event in &events {
            // Skip events at positions the cursor has already passed
            if event.pos < cursor {
                if let EditEventKind::OverwriteStart { end: oe_end, .. } = &event.kind {
                    cursor = cursor.max(*oe_end);
                }
                continue;
            }

            match &event.kind {
                EditEventKind::InsertBefore { text, .. } => {
                    if cursor < event.pos {
                        result.push_str(&self.original[cursor..event.pos]);
                        cursor = event.pos;
                    }
                    result.push_str(text);
                }
                EditEventKind::OverwriteStart {
                    end: oe_end, text, ..
                } => {
                    if cursor < event.pos {
                        result.push_str(&self.original[cursor..event.pos]);
                    }
                    result.push_str(text);
                    cursor = cursor.max(*oe_end);
                }
                EditEventKind::InsertAfter { text, .. } => {
                    if cursor <= event.pos && event.pos <= end {
                        let copy_end = event.pos.min(end);
                        if cursor < copy_end {
                            result.push_str(&self.original[cursor..copy_end]);
                        }
                        cursor = event.pos;
                    }
                    result.push_str(text);
                }
            }
        }

        if cursor < end {
            result.push_str(&self.original[cursor..end]);
        }

        result
    }
}

impl fmt::Display for MagicString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.edits.is_empty() {
            return f.write_str(&self.original);
        }

        // Collect all edit events sorted by position
        let mut events: Vec<EditEvent> = Vec::new();

        for (idx, edit) in self.edits.iter().enumerate() {
            match edit {
                Edit::Overwrite { start, end, text } => {
                    events.push(EditEvent {
                        pos: *start,
                        kind: EditEventKind::OverwriteStart {
                            end: *end,
                            text: text.clone(),
                            idx,
                        },
                    });
                }
                Edit::InsertBefore { pos, text } => {
                    events.push(EditEvent {
                        pos: *pos,
                        kind: EditEventKind::InsertBefore {
                            text: text.clone(),
                            idx,
                        },
                    });
                }
                Edit::InsertAfter { pos, text } => {
                    events.push(EditEvent {
                        pos: *pos,
                        kind: EditEventKind::InsertAfter {
                            text: text.clone(),
                            idx,
                        },
                    });
                }
            }
        }

        // Sort by position. For same position:
        // InsertBefore comes first, then InsertAfter, then Overwrite.
        // InsertAfter before Overwrite ensures .value insertions at an identifier's end
        // are emitted before an Overwrite that removes trailing TS syntax (as T, !, satisfies T).
        events.sort_by(|a, b| {
            a.pos.cmp(&b.pos).then_with(|| {
                let priority = |e: &EditEvent| match &e.kind {
                    EditEventKind::InsertBefore { .. } => 0,
                    EditEventKind::InsertAfter { .. } => 1,
                    EditEventKind::OverwriteStart { .. } => 2,
                };
                priority(a).cmp(&priority(b)).then_with(|| {
                    // For same priority, preserve insertion order
                    let idx_a = match &a.kind {
                        EditEventKind::InsertBefore { idx, .. }
                        | EditEventKind::InsertAfter { idx, .. }
                        | EditEventKind::OverwriteStart { idx, .. } => *idx,
                    };
                    let idx_b = match &b.kind {
                        EditEventKind::InsertBefore { idx, .. }
                        | EditEventKind::InsertAfter { idx, .. }
                        | EditEventKind::OverwriteStart { idx, .. } => *idx,
                    };
                    idx_a.cmp(&idx_b)
                })
            })
        });

        let bytes = self.original.as_bytes();
        let mut cursor = 0;

        for event in &events {
            // Skip events at positions the cursor has already passed
            // (they fall within a larger overwrite that already replaced that range)
            if event.pos < cursor {
                // Still track nested overwrite ends to prevent cursor going backward
                if let EditEventKind::OverwriteStart { end, .. } = &event.kind {
                    cursor = cursor.max(*end);
                }
                continue;
            }

            match &event.kind {
                EditEventKind::InsertBefore { text, .. } => {
                    if cursor < event.pos {
                        f.write_str(&self.original[cursor..event.pos])?;
                        cursor = event.pos;
                    }
                    f.write_str(text)?;
                }
                EditEventKind::OverwriteStart { end, text, .. } => {
                    if cursor < event.pos {
                        f.write_str(&self.original[cursor..event.pos])?;
                    }
                    f.write_str(text)?;
                    cursor = cursor.max(*end);
                }
                EditEventKind::InsertAfter { text, .. } => {
                    if cursor <= event.pos && event.pos <= bytes.len() {
                        f.write_str(&self.original[cursor..event.pos])?;
                        cursor = event.pos;
                    }
                    f.write_str(text)?;
                }
            }
        }

        if cursor < self.original.len() {
            f.write_str(&self.original[cursor..])?;
        }

        Ok(())
    }
}

struct EditEvent {
    pos: usize,
    kind: EditEventKind,
}

enum EditEventKind {
    InsertBefore {
        text: String,
        idx: usize,
    },
    OverwriteStart {
        end: usize,
        text: String,
        idx: usize,
    },
    InsertAfter {
        text: String,
        idx: usize,
    },
}
