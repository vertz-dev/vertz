# Runtime Feature Parity Report

Maps every checklist row from `plans/runtime-parity-tests.md` to its test location and status.

## Included Features

| # | Feature | Test Location | Status |
|---|---------|---------------|--------|
| 1 | Server starts on configured port | static_serving.rs::test_serves_index_html | EXISTING |
| 2 | Port auto-increment on conflict | static_serving.rs::test_port_conflict_auto_increment | EXISTING |
| 3 | SPA fallback routing | client_render.rs::test_html_shell_for_root_page | EXISTING |
| 4 | JSON Accept header returns 404 | client_render.rs::test_json_api_request_does_not_return_html | EXISTING |
| 5 | API route delegation | parity/http_serving.rs::api_routes_delegated_to_api_handler | NEW |
| 6 | API proxy via .vertzrc rules | parity/http_serving.rs::api_proxy_forwards_request_per_vertzrc_rules | NEW |
| 7 | Request logging middleware | parity/http_serving.rs::request_logging_middleware_is_applied | NEW |
| 8 | Serves files from public/ | static_serving.rs::test_serves_index_html | EXISTING |
| 9 | Correct Content-Type headers | static_serving.rs::test_serves_css_with_correct_content_type | EXISTING |
| 10 | Subdirectory asset serving | static_serving.rs::test_serves_assets_from_subdirectory | EXISTING |
| 11 | 404 for missing static files | static_serving.rs::test_missing_file_returns_404 | EXISTING |
| 12 | Path traversal prevention | static_serving.rs::test_path_traversal_returns_404 | EXISTING |
| 13 | Cache-Control headers | client_render.rs::test_cache_control_headers | EXISTING |
| 14 | TSX/JSX to JS compilation | client_render.rs::test_compile_app_tsx_for_browser | EXISTING |
| 15 | TypeScript type stripping | client_render.rs::test_compile_app_tsx_for_browser | EXISTING |
| 16 | Import specifier rewriting | client_render.rs::test_import_rewriting_in_compiled_output | EXISTING |
| 17 | Source map generation | client_render.rs::test_source_map_generated | EXISTING |
| 18 | Compilation caching | client_render.rs::test_compilation_cache_works | EXISTING |
| 19 | import.meta.env replacement | parity/compilation.rs::import_meta_env_replaced_with_values | NEW |
| 20 | CSS to JS module conversion | parity/compilation.rs::css_file_served_as_js_module | NEW |
| 21 | Error module generation | client_render.rs::test_compile_nonexistent_file_returns_error_module | EXISTING |
| 22 | tsconfig.json path alias resolution | parity/compilation.rs::tsconfig_path_aliases_resolved_in_imports | NEW |
| 23 | Dependency pre-bundling serving | parity/compilation.rs::deps_endpoint_serves_prebundled_dependencies | NEW |
| 24 | CSS virtual module serving | parity/compilation.rs::css_virtual_modules_served_at_css_endpoint | NEW |
| 25 | Theme CSS auto-discovery | parity/compilation.rs::theme_css_auto_discovered_and_injected_in_html | NEW |
| 26 | SSR HTML document structure | ssr_render.rs::test_full_ssr_document_structure | EXISTING |
| 27 | DOM shim APIs | ssr_render.rs::test_dom_shim_provides_complete_environment | EXISTING |
| 28 | CSS collection during SSR | ssr_render.rs::test_css_collection_end_to_end | EXISTING |
| 29 | Session extraction from cookies | ssr_render.rs::test_session_extraction_and_install | EXISTING |
| 30 | Hydration data embedding | ssr_render.rs::test_ssr_render_full_pipeline | EXISTING |
| 31 | Framework SSR via ssrRenderSinglePass | ssr_render.rs::test_ssr_render_fixture_app | EXISTING |
| 32 | Legacy DOM-scraping fallback | ssr_render.rs::plain_js_app_uses_legacy_render_when_no_framework | EXISTING |
| 33 | Framework detection errors | ssr_render.rs::framework_app_without_ui_server_errors_instead_of_legacy_fallback | EXISTING |
| 34 | SSR redirect handling | parity/ssr.rs::ssr_enabled_server_returns_html_shell_for_page_routes | NEW |
| 35 | WebSocket connection on /__vertz_hmr | client_render.rs::test_websocket_hmr_endpoint_accepts_upgrade | EXISTING |
| 36 | Initial connected message | client_render.rs::test_websocket_hmr_endpoint_accepts_upgrade | EXISTING |
| 37 | File change triggers update message | parity/hmr.rs::hmr_update_message_delivered_to_websocket_client | NEW |
| 38 | CSS-only update | parity/hmr.rs::hmr_css_update_message_delivered_without_full_reload | NEW |
| 39 | Full reload for entry file changes | parity/hmr.rs::entry_file_change_triggers_full_reload | NEW |
| 40 | Module graph dependency tracking | parity/hmr.rs::dependency_change_invalidates_transitive_dependents | NEW |
| 41 | Error categorization | error_overlay.rs::test_error_categories_ordered_by_priority | EXISTING |
| 42 | Priority-based error suppression | error_overlay.rs::test_build_error_suppresses_runtime_in_state | EXISTING |
| 43 | WebSocket error broadcasting | error_overlay.rs::test_error_broadcast_to_connected_clients | EXISTING |
| 44 | Error auto-recovery | error_overlay.rs::test_error_fix_cycle_clears_overlay | EXISTING |
| 45 | Source map resolution | error_overlay.rs::test_source_mapper_resolves_compiled_position | EXISTING |
| 46 | Config change detection | error_overlay.rs::test_config_change_detected_as_restart_trigger | EXISTING |
| 47 | Client error reporting | parity/error_overlay.rs::client_error_reported_via_post_endpoint | NEW |
| 48 | Diagnostics JSON health snapshot | error_overlay.rs::test_diagnostics_returns_valid_json | EXISTING |
| 49 | Health fields | error_overlay.rs::test_diagnostics_includes_active_errors | EXISTING |
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
