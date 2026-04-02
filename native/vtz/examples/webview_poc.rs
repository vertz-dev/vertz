//! POC: Validate thread model (event loop on main, tokio on background)
//! and hidden webview JavaScript execution.
//!
//! Run with: cargo run --example webview_poc --features desktop

use std::time::Instant;

use axum::routing::get;
use axum::Router;
use tokio::net::TcpListener;
use vertz_runtime::webview::{eval_script_event, UserEvent, WebviewApp, WebviewOptions};

const TEST_HTML: &str = r#"<!DOCTYPE html>
<html>
<head><title>VTZ POC</title></head>
<body><h1>Hello from VTZ</h1></body>
</html>"#;

fn main() {
    let start = Instant::now();

    // 1. Create WebviewApp on main thread (hidden mode for POC)
    let (app, _shutdown_rx) = WebviewApp::new(WebviewOptions {
        title: "VTZ POC".to_string(),
        hidden: true,
        devtools: false,
        ..Default::default()
    })
    .expect("failed to create webview app");

    let proxy = app.proxy();
    let proxy_clone = proxy.clone();

    println!(
        "[poc] WebviewApp created in {:.1}ms",
        start.elapsed().as_secs_f64() * 1000.0
    );

    // 2. Spawn background thread with tokio runtime
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("failed to create tokio runtime");

        rt.block_on(async move {
            // 3. Start a minimal axum server
            let server_start = Instant::now();
            let app = Router::new().route("/", get(|| async { axum::response::Html(TEST_HTML) }));
            let listener = TcpListener::bind("127.0.0.1:0")
                .await
                .expect("failed to bind");
            let port = listener.local_addr().unwrap().port();

            println!(
                "[poc] axum server bound to port {} in {:.1}ms",
                port,
                server_start.elapsed().as_secs_f64() * 1000.0
            );

            // Spawn server in background
            tokio::spawn(async move {
                axum::serve(listener, app).await.ok();
            });

            // 4. Tell webview to load the page
            let _ = proxy_clone.send_event(UserEvent::ServerReady { port });

            // Wait for page to load
            tokio::time::sleep(std::time::Duration::from_millis(1500)).await;

            // 5. Evaluate JS and measure round-trip
            let eval_start = Instant::now();
            let (tx, rx) = tokio::sync::oneshot::channel();
            let _ = proxy_clone.send_event(eval_script_event("document.title".to_string(), tx));

            match tokio::time::timeout(std::time::Duration::from_secs(5), rx).await {
                Ok(Ok(result)) => {
                    let elapsed = eval_start.elapsed();
                    println!("[poc] evaluate_script result: {:?}", result);
                    println!(
                        "[poc] round-trip latency: {:.1}ms",
                        elapsed.as_secs_f64() * 1000.0
                    );

                    if result.contains("VTZ POC") {
                        println!("[poc] SUCCESS: hidden webview executes JS correctly");
                    } else {
                        println!(
                            "[poc] UNEXPECTED: got {:?}, expected something containing 'VTZ POC'",
                            result
                        );
                    }
                }
                Ok(Err(_)) => {
                    println!("[poc] FAIL: oneshot channel closed (sender dropped)");
                }
                Err(_) => {
                    println!("[poc] FAIL: evaluate_script timed out after 5s");
                }
            }

            // 6. Measure memory
            print_memory_usage();

            println!(
                "[poc] total elapsed: {:.1}ms",
                start.elapsed().as_secs_f64() * 1000.0
            );

            // 7. Quit
            let _ = proxy_clone.send_event(UserEvent::Quit);
        });
    });

    // Main thread runs the event loop (blocks forever)
    app.run();
}

/// Print process RSS memory on macOS using mach APIs.
fn print_memory_usage() {
    #[cfg(target_os = "macos")]
    {
        use std::mem;
        extern "C" {
            fn mach_task_self() -> u32;
            fn task_info(
                target_task: u32,
                flavor: u32,
                task_info_out: *mut libc::c_void,
                task_info_outCnt: *mut u32,
            ) -> i32;
        }

        #[repr(C)]
        struct MachTaskBasicInfo {
            virtual_size: u64,
            resident_size: u64,
            resident_size_max: u64,
            user_time: [u32; 2],
            system_time: [u32; 2],
            policy: i32,
            suspend_count: i32,
        }

        let mut info: MachTaskBasicInfo = unsafe { mem::zeroed() };
        let mut count = (mem::size_of::<MachTaskBasicInfo>() / mem::size_of::<u32>()) as u32;

        // SAFETY: Calling macOS mach API to get task memory info.
        // We pass a zeroed struct of the correct size and let the kernel fill it.
        let result = unsafe {
            task_info(
                mach_task_self(),
                20, // MACH_TASK_BASIC_INFO
                &mut info as *mut _ as *mut libc::c_void,
                &mut count,
            )
        };

        if result == 0 {
            let rss_mb = info.resident_size as f64 / (1024.0 * 1024.0);
            println!("[poc] RSS memory: {:.1} MB", rss_mb);
        } else {
            println!("[poc] failed to read memory info (kern_return: {})", result);
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        println!("[poc] memory measurement not implemented for this platform");
    }
}
