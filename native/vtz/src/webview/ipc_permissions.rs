//! Re-export of `crate::ipc_permissions` for backward compatibility.
//!
//! The permissions module was moved to a shared location so it can be used
//! by both the webview IPC dispatcher and the HTTP binary file routes.

pub use crate::ipc_permissions::*;
