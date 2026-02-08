#!/usr/bin/env node
import { createCLI } from '../src/cli';

const program = createCLI();
program.parse();
