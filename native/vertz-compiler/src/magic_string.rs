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

    /// Get a slice of the original source.
    pub fn slice(&self, start: u32, end: u32) -> &str {
        &self.original[start as usize..end as usize]
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
        // InsertBefore comes first, then Overwrite, then InsertAfter
        events.sort_by(|a, b| {
            a.pos.cmp(&b.pos).then_with(|| {
                let priority = |e: &EditEvent| match &e.kind {
                    EditEventKind::InsertBefore { .. } => 0,
                    EditEventKind::OverwriteStart { .. } => 1,
                    EditEventKind::InsertAfter { .. } => 2,
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
                    cursor = *end;
                }
                EditEventKind::InsertAfter { text, .. } => {
                    if cursor <= event.pos && event.pos < bytes.len() {
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
