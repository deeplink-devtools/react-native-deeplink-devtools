#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { banner } from './banner.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name: string;
  version: string;
};

console.log(banner(pkg.name, pkg.version));
