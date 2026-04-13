use std::io::Write;
use std::sync::Arc;
use std::sync::Mutex;

use deno_core::op2;
use deno_core::OpDecl;
use deno_core::OpState;

use crate::runtime::js_runtime::CapturedOutput;

/// State for console operations.
pub struct ConsoleState {
    pub capture: bool,
    pub captured: Arc<Mutex<CapturedOutput>>,
}

#[op2(fast)]
pub fn op_console_log(state: &mut OpState, #[string] msg: String) {
    let console_state = state.borrow::<ConsoleState>();
    if console_state.capture {
        console_state.captured.lock().unwrap().stdout.push(msg);
    } else {
        println!("{}", msg);
    }
}

#[op2(fast)]
pub fn op_console_warn(state: &mut OpState, #[string] msg: String) {
    let console_state = state.borrow::<ConsoleState>();
    if console_state.capture {
        console_state
            .captured
            .lock()
            .unwrap()
            .stderr
            .push(format!("\x1b[33m{}\x1b[0m", msg));
    } else {
        eprintln!("\x1b[33m{}\x1b[0m", msg);
    }
}

#[op2(fast)]
pub fn op_console_error(state: &mut OpState, #[string] msg: String) {
    let console_state = state.borrow::<ConsoleState>();
    if console_state.capture {
        console_state
            .captured
            .lock()
            .unwrap()
            .stderr
            .push(format!("\x1b[31m{}\x1b[0m", msg));
    } else {
        eprintln!("\x1b[31m{}\x1b[0m", msg);
    }
}

#[op2(fast)]
pub fn op_console_info(state: &mut OpState, #[string] msg: String) {
    let console_state = state.borrow::<ConsoleState>();
    if console_state.capture {
        console_state.captured.lock().unwrap().stdout.push(msg);
    } else {
        println!("{}", msg);
    }
}

/// Write raw string to stdout without a trailing newline.
/// Matches Node.js `process.stdout.write()` semantics.
#[op2(fast)]
pub fn op_stdout_write(state: &mut OpState, #[string] msg: String) -> bool {
    let console_state = state.borrow::<ConsoleState>();
    if console_state.capture {
        console_state.captured.lock().unwrap().stdout.push(msg);
    } else {
        let _ = std::io::stdout().write_all(msg.as_bytes());
        let _ = std::io::stdout().flush();
    }
    true
}

/// Write raw string to stderr without a trailing newline.
/// Matches Node.js `process.stderr.write()` semantics.
#[op2(fast)]
pub fn op_stderr_write(state: &mut OpState, #[string] msg: String) -> bool {
    let console_state = state.borrow::<ConsoleState>();
    if console_state.capture {
        console_state.captured.lock().unwrap().stderr.push(msg);
    } else {
        let _ = std::io::stderr().write_all(msg.as_bytes());
        let _ = std::io::stderr().flush();
    }
    true
}

/// Get the op declarations for console ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![
        op_console_log(),
        op_console_warn(),
        op_console_error(),
        op_console_info(),
        op_stdout_write(),
        op_stderr_write(),
    ]
}

/// JavaScript bootstrap code for console globals.
pub const CONSOLE_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  function formatArg(arg) {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'object') {
      try { return JSON.stringify(arg); } catch { return String(arg); }
    }
    return String(arg);
  }

  function formatArgs(args) {
    return args.map(formatArg).join(' ');
  }

  globalThis.console = {
    log: (...args) => Deno.core.ops.op_console_log(formatArgs(args)),
    warn: (...args) => Deno.core.ops.op_console_warn(formatArgs(args)),
    error: (...args) => Deno.core.ops.op_console_error(formatArgs(args)),
    info: (...args) => Deno.core.ops.op_console_info(formatArgs(args)),
    debug: (...args) => Deno.core.ops.op_console_log(formatArgs(args)),
    trace: (...args) => Deno.core.ops.op_console_log(formatArgs(args)),
  };
})(globalThis);
"#;

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    fn create_capturing_runtime() -> VertzJsRuntime {
        VertzJsRuntime::new(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap()
    }

    #[test]
    fn test_console_log_string() {
        let mut rt = create_capturing_runtime();
        rt.execute_script_void("<test>", "console.log('hello', 'world');")
            .unwrap();
        let output = rt.captured_output();
        assert_eq!(output.stdout, vec!["hello world"]);
    }

    #[test]
    fn test_console_log_numbers_and_mixed() {
        let mut rt = create_capturing_runtime();
        rt.execute_script_void("<test>", "console.log(1, 'two', true);")
            .unwrap();
        let output = rt.captured_output();
        assert_eq!(output.stdout, vec!["1 two true"]);
    }

    #[test]
    fn test_console_log_object() {
        let mut rt = create_capturing_runtime();
        rt.execute_script_void("<test>", "console.log({ a: 1 });")
            .unwrap();
        let output = rt.captured_output();
        assert_eq!(output.stdout, vec![r#"{"a":1}"#]);
    }

    #[test]
    fn test_console_error_to_stderr() {
        let mut rt = create_capturing_runtime();
        rt.execute_script_void("<test>", "console.error('fail');")
            .unwrap();
        let output = rt.captured_output();
        assert!(output.stdout.is_empty());
        assert_eq!(output.stderr.len(), 1);
        assert!(output.stderr[0].contains("fail"));
        assert!(output.stderr[0].contains("\x1b[31m"));
    }

    #[test]
    fn test_console_warn_to_stderr() {
        let mut rt = create_capturing_runtime();
        rt.execute_script_void("<test>", "console.warn('careful');")
            .unwrap();
        let output = rt.captured_output();
        assert!(output.stdout.is_empty());
        assert_eq!(output.stderr.len(), 1);
        assert!(output.stderr[0].contains("careful"));
        assert!(output.stderr[0].contains("\x1b[33m"));
    }

    #[test]
    fn test_console_info_to_stdout() {
        let mut rt = create_capturing_runtime();
        rt.execute_script_void("<test>", "console.info('info msg');")
            .unwrap();
        let output = rt.captured_output();
        assert_eq!(output.stdout, vec!["info msg"]);
    }

    #[test]
    fn test_console_log_null_and_undefined() {
        let mut rt = create_capturing_runtime();
        rt.execute_script_void("<test>", "console.log(null, undefined);")
            .unwrap();
        let output = rt.captured_output();
        assert_eq!(output.stdout, vec!["null undefined"]);
    }

    #[test]
    fn test_console_multiple_calls() {
        let mut rt = create_capturing_runtime();
        rt.execute_script_void(
            "<test>",
            r#"
            console.log('first');
            console.log('second');
            console.error('err');
        "#,
        )
        .unwrap();
        let output = rt.captured_output();
        assert_eq!(output.stdout, vec!["first", "second"]);
        assert_eq!(output.stderr.len(), 1);
    }

    #[test]
    fn test_stdout_write_no_newline() {
        let mut rt = create_capturing_runtime();
        rt.execute_script_void("<test>", "Deno.core.ops.op_stdout_write('hello');")
            .unwrap();
        let output = rt.captured_output();
        assert_eq!(output.stdout, vec!["hello"]);
    }

    #[test]
    fn test_stderr_write_no_newline() {
        let mut rt = create_capturing_runtime();
        rt.execute_script_void("<test>", "Deno.core.ops.op_stderr_write('hello');")
            .unwrap();
        let output = rt.captured_output();
        // stderr.write should NOT add ANSI color codes (unlike console.error)
        assert_eq!(output.stderr, vec!["hello"]);
    }

    #[test]
    fn test_stdout_write_returns_true() {
        let mut rt = create_capturing_runtime();
        let result = rt
            .execute_script("<test>", "Deno.core.ops.op_stdout_write('test')")
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_stderr_write_returns_true() {
        let mut rt = create_capturing_runtime();
        let result = rt
            .execute_script("<test>", "Deno.core.ops.op_stderr_write('test')")
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_process_stdout_write_uses_raw_op() {
        let mut rt = create_capturing_runtime();
        // Set up process.stdout the same way the CJS bootstrap does
        rt.execute_script_void(
            "<test>",
            r#"
            if (!globalThis.process) globalThis.process = {};
            globalThis.process.stdout = { write: (s) => Deno.core.ops.op_stdout_write(String(s)) };
            process.stdout.write('a');
            process.stdout.write('b');
        "#,
        )
        .unwrap();
        let output = rt.captured_output();
        // Each write should be captured separately, without newlines
        assert_eq!(output.stdout, vec!["a", "b"]);
    }

    #[test]
    fn test_process_stderr_write_uses_raw_op() {
        let mut rt = create_capturing_runtime();
        // Set up process.stderr the same way the CJS bootstrap does
        rt.execute_script_void(
            "<test>",
            r#"
            if (!globalThis.process) globalThis.process = {};
            globalThis.process.stderr = { write: (s) => Deno.core.ops.op_stderr_write(String(s)) };
            process.stderr.write('err1');
            process.stderr.write('err2');
        "#,
        )
        .unwrap();
        let output = rt.captured_output();
        // stderr.write should NOT add ANSI color codes (unlike console.error)
        assert_eq!(output.stderr, vec!["err1", "err2"]);
    }
}
