#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { openCommand } from './commands/open.js';
import { routesCommand } from './commands/routes.js';
import { validateCommand } from './commands/validate.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

const program = new Command()
  .name('rndl')
  .description(
    'Deep-link toolkit for React Native: inspect route tables, validate universal links and Android App Links, open links on devices.',
  )
  .version(pkg.version)
  .showHelpAfterError();

program.addCommand(routesCommand());
program.addCommand(validateCommand(pkg.version));
program.addCommand(openCommand());

await program.parseAsync();
