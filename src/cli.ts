#!/usr/bin/env node

import {program} from 'commander';
import {
  includeTypes,
  isOptionInclude,
  isOptionMode,
  isOptionOmit,
  modes,
  omitTypes,
  Options,
} from './options.js';
import {diffPackages, formatDiff} from './index.js';
import {formats, isFormat} from './utils.js';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import packageJson from '../package.json' with {type: 'json'};

async function run() {
  program
    .name('npvd')
    .argument('<from>', 'From lock file or git commit')
    .argument('<to>', 'To lock file or git commit')
    .option('-m, --mode <pkgmgr>', `Package manager (${modes.join(', ')})`, 'npm')
    .option('--include <deptype>', `Dependency types to include (${includeTypes.join(', ')})`)
    .option('--omit <deptype>', `Dependency types to omit (${omitTypes.join(', ')})`)
    .option('-d, --direct-only', 'Only include direct dependencies')
    .option('--git', 'Interpret <from> and <to> as git commits')
    .option('--git-lock-file <path>', 'Path to lock file relative to repository root')
    .option('-f, --format <format>', `Output format (${formats.join(', ')})`, 'text')
    .option('--json-spaces <num>', 'Number of spaces to use for indentated JSON output', parseInt)
    .option('--eol <eol>', 'End of line to use for file output (LF, CRLF)', 'LF')
    .option('-o, --out-file <path>', 'File path including file name where output should be written')
    .version(packageJson.version, '-v, --version')
    .parse();

  const options: Options = {mode: 'npm'};
  const cliOptions = program.opts();
  const {
    mode: cliMode,
    include: cliInclude,
    omit: cliOmit,
    git: cliGit,
    gitLockFile: cliGitLockFile,
    directOnly: cliDirectOnly,
    format,
    jsonSpaces: cliJsonSpaces,
    eol: cliEol,
    outFile: cliOutFile,
  } = cliOptions;

  if (!isFormat(format)) {
    throw new Error('Invalid value for option: --format');
  }

  let eol = '\n';
  if (cliEol !== undefined) {
    if (cliEol === 'LF') {
      eol = '\n';
    } else if (cliEol === 'CRLF') {
      eol = '\r\n';
    } else {
      throw new Error('Invalid value for option: --eol');
    }
  }

  let jsonSpaces = 0;
  if (cliJsonSpaces !== undefined) {
    if (cliJsonSpaces >= 0) {
      jsonSpaces = cliJsonSpaces as number;
    } else {
      throw new Error('Invalid value for option: --json-spaces');
    }
  }

  let outFile: string | undefined = undefined;
  if (cliOutFile !== undefined) {
    if (typeof cliOutFile !== 'string') {
      throw new Error('Invalid value for option: --out-file');
    }

    const resolvedOutFile = path.resolve(cliOutFile);
    const outDir = path.dirname(resolvedOutFile);
    if (!existsSync(outDir)) {
      throw new Error(`Output directory does not exist: ${outDir}`);
    }
    outFile = resolvedOutFile;
  }

  if (!isOptionMode(cliMode)) {
    throw new Error('Invalid value for option: --mode');
  }
  options.mode = cliMode;

  if (cliInclude !== undefined) {
    const include = (cliInclude as string).split(',');
    if (!isOptionInclude(include)) {
      throw new Error('Invalid value for option: --include');
    }
    options.include = include;
  }

  if (cliOmit !== undefined) {
    const omit = (cliOmit as string).split(',');
    if (!isOptionOmit(omit)) {
      throw new Error('Invalid value for option: --omit');
    }
    options.omit = omit;
  }

  if (cliDirectOnly !== undefined) {
    options.directOnly = !!cliDirectOnly;
  }
  if (cliGit !== undefined) {
    options.git = !!cliGit;
  }
  if (cliGitLockFile !== undefined) {
    options.gitLockFile = cliGitLockFile as string;
  }

  const [from, to] = program.args;
  const diff = await diffPackages(from, to, options);
  const formattedDiff = await formatDiff(diff, format, {jsonSpaces});
  if (outFile) {
    const outContent = formattedDiff.replace(/\r?\n/g, eol);
    await writeFile(outFile, outContent, 'utf-8');
  } else {
    console.log(formattedDiff);
  }
}

try {
  run().catch((err) => {
    console.error(err instanceof Error ? err.message : 'Unexpected startup failure');
    process.exitCode = 1;
  });
} catch (ex) {
  console.error(ex instanceof Error ? ex.message : 'Unexpected application failure');
  process.exitCode = 1;
}
