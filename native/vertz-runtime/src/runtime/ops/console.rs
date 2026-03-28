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

/// Get the op declarations for console ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![
        op_console_log(),
        op_console_warn(),
        op_console_error(),
        op_console_info(),
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
}
