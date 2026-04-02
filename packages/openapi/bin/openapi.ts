#!/usr/bin/env bun
import { runCLI } from '../dist/cli.js';

const result = await runCLI(process.argv.slice(2));

if (result.message) {
  if (result.exitCode === 0) {
    console.log(result.message);
  } else {
    console.error(result.message);
  }
}

process.exit(result.exitCode);
