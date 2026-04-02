#!/usr/bin/env bun
import { runCLI } from '../src/cli';

const result = await runCLI(process.argv.slice(2));

if (result.message) {
  if (result.exitCode === 0) {
    console.log(result.message);
  } else {
    console.error(result.message);
  }
}

process.exit(result.exitCode);
