# Runtime Feature Parity Report

Maps every checklist row from `plans/runtime-parity-tests.md` to its test location and status.

## Included Features

| # | Feature | Test Location | Status |
|---|---------|---------------|--------|
| 1 | Server starts on configured port | static_serving.rs::test_html_served | EXISTING |
| 2 | Port auto-increment on conflict | static_serving.rs::test_port_auto_increment | EXISTING |
| 3 | SPA fallback routing | client_render.rs::test_spa_routes_return_html_shell | EXISTING |
| 4 | JSON Accept header returns 404 | client_render.rs::test_json_accept_returns_404 | EXISTING |
| 5 | API route delegation | parity/http_serving.rs::api_routes_delegated_to_api_handler | NEW |
| 6 | API proxy via .vertzrc rules | parity/http_serving.rs::api_proxy_forwards_request_per_vertzrc_rules | NEW |
| 7 | Request logging middleware | parity/http_serving.rs::request_logging_middleware_is_applied | NEW |
| 8 | Serves files from public/ | static_serving.rs::test_html_served | EXISTING |
| 9 | Correct Content-Type headers | static_serving.rs::test_css_content_type | EXISTING |
| 10 | Subdirectory asset serving | static_serving.rs::test_subdirectory_asset | EXISTING |
| 11 | 404 for missing static files | static_serving.rs::test_missing_file_returns_404 | EXISTING |
| 12 | Path traversal prevention | static_serving.rs::test_path_traversal_blocked | EXISTING |
| 13 | Cache-Control headers | static_serving.rs::test_cache_control_headers | EXISTING |
| 14 | TSX/JSX to JS compilation | client_render.rs::test_tsx_compilation | EXISTING |
| 15 | TypeScript type stripping | client_render.rs::test_typescript_stripped | EXISTING |
| 16 | Import specifier rewriting | client_render.rs::test_import_rewriting | EXISTING |
| 17 | Source map generation | client_render.rs::test_source_map_generation | EXISTING |
| 18 | Compilation caching | client_render.rs::test_compilation_cache | EXISTING |
| 19 | import.meta.env replacement | parity/compilation.rs::import_meta_env_replaced_with_values | NEW |
| 20 | CSS to JS module conversion | parity/compilation.rs::css_file_served_as_js_module | NEW |
| 21 | Error module generation | client_render.rs::test_error_module | EXISTING |
| 22 | tsconfig.json path alias resolution | parity/compilation.rs::tsconfig_path_aliases_resolved_in_imports | NEW |
| 23 | Dependency pre-bundling serving | parity/compilation.rs::deps_endpoint_serves_prebundled_dependencies | NEW |
| 24 | CSS virtual module serving | parity/compilation.rs::css_virtual_modules_served_at_css_endpoint | NEW |
| 25 | Theme CSS auto-discovery | parity/compilation.rs::theme_css_auto_discovered_and_injected_in_html | NEW |
| 26 | SSR HTML document structure | ssr_render.rs::test_full_ssr_document | EXISTING |
| 27 | DOM shim APIs | ssr_render.rs::test_dom_shim_globals | EXISTING |
| 28 | CSS collection during SSR | ssr_render.rs::test_css_collection | EXISTING |
| 29 | Session extraction from cookies | ssr_render.rs::test_session_extraction | EXISTING |
| 30 | Hydration data embedding | ssr_render.rs::test_hydration_data | EXISTING |
| 31 | Framework SSR via ssrRenderSinglePass | ssr_render.rs::test_framework_ssr | EXISTING |
| 32 | Legacy DOM-scraping fallback | ssr_render.rs::test_legacy_fallback | EXISTING |
| 33 | Framework detection errors | ssr_render.rs::test_framework_detection_errors | EXISTING |
| 34 | SSR redirect handling | parity/ssr.rs::ssr_redirect_returns_302_with_location_header | NEW |
| 35 | WebSocket connection on /__vertz_hmr | client_render.rs::test_hmr_websocket_connection | EXISTING |
| 36 | Initial connected message | client_render.rs::test_hmr_connected_message | EXISTING |
| 37 | File change triggers update message | parity/hmr.rs::hmr_update_message_delivered_to_websocket_client | NEW |
| 38 | CSS-only update | parity/hmr.rs::hmr_css_update_message_delivered_without_full_reload | NEW |
| 39 | Full reload for entry file changes | parity/hmr.rs::entry_file_change_triggers_full_reload | NEW |
| 40 | Module graph dependency tracking | parity/hmr.rs::dependency_change_invalidates_transitive_dependents | NEW |
| 41 | Error categorization | error_overlay.rs::test_error_categories | EXISTING |
| 42 | Priority-based error suppression | error_overlay.rs::test_priority_suppression | EXISTING |
| 43 | WebSocket error broadcasting | error_overlay.rs::test_error_broadcast | EXISTING |
| 44 | Error auto-recovery | error_overlay.rs::test_auto_recovery | EXISTING |
| 45 | Source map resolution | error_overlay.rs::test_source_map_resolution | EXISTING |
| 46 | Config change detection | error_overlay.rs::test_config_change_detection | EXISTING |
| 47 | Client error reporting | parity/error_overlay.rs::client_error_reported_via_post_endpoint | NEW |
| 48 | Diagnostics JSON health snapshot | error_overlay.rs::test_diagnostics_endpoint | EXISTING |
| 49 | Health fields | error_overlay.rs::test_diagnostics_fields | EXISTING |
| 50 | Console log ring buffer | parity/diagnostics.rs::console_log_endpoint_returns_log_entries | NEW |
| 51 | MCP Streamable HTTP | parity/diagnostics.rs::mcp_streamable_http_responds_to_tools_list | NEW |
| 52 | MCP tool invocation | parity/diagnostics.rs::mcp_tool_call_returns_diagnostics | NEW |
| 53 | MCP event push WebSocket | parity/diagnostics.rs::mcp_events_websocket_receives_server_events | NEW |
| 54 | Auto-install missing packages | parity/auto_features.rs::auto_installer_detects_missing_package | NEW |
| 55 | Upstream dependency watching | parity/auto_features.rs::dep_watcher_detects_linked_package_changes | NEW |

## Deferred Features

| # | Feature | Status | Reference |
|---|---------|--------|-----------|
| D1 | Font fallback extraction | DEFERRED | next-steps 4.1 |
| D2 | Image proxy / optimization | DEFERRED | next-steps 4.2 |
| D3 | OpenAPI spec serving | DEFERRED | next-steps 4.3 |
| D4 | Theme-from-request | DEFERRED | next-steps 4.5 |
| D5 | Prefetch manifest endpoint | DEFERRED | Bun server feature |
| D6 | AOT manifest management | DEFERRED | Bun server feature |
| D7 | Nav pre-fetch SSE endpoint | DEFERRED | Bun server feature |
| D8 | Stale bundler detection + auto-restart | DEFERRED | Bun server feature |
| D9 | Ready gate system | DEFERRED | Bun server feature |
| D10 | Build check endpoint | DEFERRED | Bun-specific architecture |
| D11 | Favicon auto-detection | DEFERRED | Bun server feature |
| D12 | Kill stale process on startup | DEFERRED | Bun server feature |
