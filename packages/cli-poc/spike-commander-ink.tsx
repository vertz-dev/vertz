/**
 * Spike 1: Commander + Ink Coexistence
 *
 * Goal: Verify that Commander can parse arguments, then hand off
 * to an Ink component for rendering — without stdout conflicts.
 *
 * Tests:
 * 1. Does Commander parse --port and --verbose correctly?
 * 2. Can Ink render after Commander finishes parsing?
 * 3. Does Commander's --help work without conflicting with Ink?
 * 4. Is there any stdout conflict?
 */

import { Command } from "commander";
import { render, Text, Box } from "ink";
import React from "react";

// ── Ink Component ──────────────────────────────────────────────────

interface ServerStatusProps {
  port: number;
  verbose: boolean;
}

function ServerStatus({ port, verbose }: ServerStatusProps) {
  return (
    <Box flexDirection="column" padding={1}>
      <Text color="cyan" bold>
        vertz dev server (spike)
      </Text>
      <Text>
        <Text color="green">{">"}</Text> Port: <Text bold>{port}</Text>
      </Text>
      <Text>
        <Text color="green">{">"}</Text> Verbose:{" "}
        <Text bold>{verbose ? "on" : "off"}</Text>
      </Text>
      <Text dimColor>
        {"\n"}Commander parsed args successfully, Ink rendered after.
      </Text>
    </Box>
  );
}

// ── Commander Setup ────────────────────────────────────────────────

function main() {
  const program = new Command();

  program
    .name("vertz-spike")
    .description("Spike: Commander + Ink coexistence test")
    .version("0.0.1");

  program
    .command("dev")
    .description("Start dev server (spike)")
    .option("-p, --port <port>", "Server port", "3000")
    .option("-v, --verbose", "Enable verbose output", false)
    .action((options) => {
      const port = parseInt(options.port, 10);
      const verbose = options.verbose as boolean;

      console.log("[Commander] Parsed options:", { port, verbose });
      console.log("[Commander] Handing off to Ink...\n");

      // Render Ink component with parsed values
      const { unmount } = render(
        <ServerStatus port={port} verbose={verbose} />
      );

      // Auto-unmount after 2 seconds to exit cleanly
      setTimeout(() => {
        unmount();
      }, 2000);
    });

  // Test: run with different argument combinations
  const args = process.argv;
  console.log("[Spike 1] Raw argv:", args.slice(2));
  console.log("");

  program.parse(args);
}

main();
