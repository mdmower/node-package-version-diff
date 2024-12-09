import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {DependencyType, dependencyTypes, Options} from './options.js';
import util from 'node:util';
import {exec} from 'node:child_process';
import {isNpmLockFileV3, NpmLockFileV3} from './utils.js';
import {lockfileWalker, LockfileWalkerStep} from '@pnpm/lockfile.walker';
import {LockfileObject, readWantedLockfile} from '@pnpm/lockfile.fs';
import {ProjectId} from '@pnpm/lockfile.utils';
import {dirname, join as pathJoin} from 'node:path';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';

export interface DiffResult {
  path: string[];
  name: string;
  version: {
    from: string | undefined;
    to: string | undefined;
  };
}

interface ConsolidatedDiffItem {
  path: string[];
  name: string;
  version: string;
}

interface ConsolidatedDiff {
  from: ConsolidatedDiffItem[];
  to: ConsolidatedDiffItem[];
}

const pexec = util.promisify(exec);

const defaultLockName: Record<Options['mode'], string> = {
  npm: 'package-lock.json',
  pnpm: 'pnpm-lock.yaml',
};

function filterTypes({include, omit}: Options) {
  let types = dependencyTypes.slice();
  if (include) {
    types = include;
  } else if (omit) {
    types = types.filter((type) => type === 'prod' || !omit.includes(type));
  }
  return types;
}

async function readLockFiles(from: string, to: string, {mode, git, gitLockFile}: Options) {
  let fromDoc = '';
  let toDoc = '';
  if (git) {
    const lockFilePath = gitLockFile ?? defaultLockName[mode];
    const [fromExec, toExec] = await Promise.all([
      pexec(`git show ${from}:${lockFilePath}`, {maxBuffer: 10 * 1024 * 1024}),
      pexec(`git show ${to}:${lockFilePath}`, {maxBuffer: 10 * 1024 * 1024}),
    ]);
    fromDoc = fromExec.stdout;
    toDoc = toExec.stdout;
  } else {
    [fromDoc, toDoc] = await Promise.all([readFile(from, 'utf-8'), readFile(to, 'utf-8')]);
  }

  return [fromDoc, toDoc];
}

function diffNpmLockFileV3(
  from: NpmLockFileV3,
  to: NpmLockFileV3,
  options: Options
): ConsolidatedDiff {
  const {directOnly} = options;
  const includeTypes = filterTypes(options);

  const readVersions = (lockFile: NpmLockFileV3) => {
    const {'': thisPackage, ...otherPackages} = lockFile.packages;
    const directDependencyNames = [
      ...(thisPackage.dependencies ? Object.entries(thisPackage.dependencies) : []),
      ...(thisPackage.devDependencies ? Object.entries(thisPackage.devDependencies) : []),
      ...(thisPackage.optionalDependencies ? Object.entries(thisPackage.optionalDependencies) : []),
      ...(thisPackage.peerDependencies ? Object.entries(thisPackage.peerDependencies) : []),
    ].map(([name]) => `node_modules/${name}`);

    const otherEntries = Object.entries(otherPackages);
    const filteredEntries = otherEntries.filter(([name, entry]) => {
      if (!entry) return false;

      const {dev, optional, peer} = entry;
      const types: DependencyType[] = [];
      if (!dev && !optional && !peer) types.push('prod');
      if (dev) types.push('dev');
      if (optional) types.push('optional');
      if (peer) types.push('peer');

      return (
        types.some((type) => includeTypes.includes(type)) &&
        (!directOnly || directDependencyNames.includes(name))
      );
    });

    return filteredEntries.map(([dir, details]) => {
      const path = dir.split(/\/?node_modules\//).slice(1);
      return {
        path,
        name: path[path.length - 1],
        version: details?.version ?? '',
      };
    });
  };

  return {
    from: readVersions(from),
    to: readVersions(to),
  };
}

function diffPnpmLockFile(
  from: LockfileObject,
  to: LockfileObject,
  options: Options
): ConsolidatedDiff {
  const {directOnly} = options;
  const includeTypes = filterTypes(options);

  const readVersions = (lockFile: LockfileObject) => {
    // TODO: Multiple project support
    // const projectIds = Object.keys(lockFile.importers) as ProjectId[];
    // for (const projectId of projectIds) {}

    const walker = lockfileWalker(lockFile, ['.' as ProjectId], {
      include: {
        dependencies: includeTypes.includes('prod'),
        devDependencies: includeTypes.includes('dev'),
        optionalDependencies: includeTypes.includes('optional'),
      },
    });

    const diffItems: ConsolidatedDiffItem[] = [];
    const walk = (step: LockfileWalkerStep, root: string[]) => {
      for (const lockDep of step.dependencies) {
        const nameVersion = lockDep.depPath.toString().replace(/\(.+/, '');
        const idx = nameVersion.lastIndexOf('@');
        const name = nameVersion.substring(0, idx);
        const version = nameVersion.substring(idx + 1);
        const path = [...root, name];
        diffItems.push({path, name, version});
        if (!directOnly) {
          walk(lockDep.next(), path);
        }
      }
    };

    walk(walker.step, []);
    return diffItems;
  };

  return {
    from: readVersions(from),
    to: readVersions(to),
  };
}

export async function diffPackages(
  from: string,
  to: string,
  options: Options
): Promise<DiffResult[]> {
  const {mode} = options;

  const [fromDoc, toDoc] = await readLockFiles(from, to, options);

  const changes: DiffResult[] = [];
  let diff: ConsolidatedDiff = {from: [], to: []};

  if (mode === 'npm') {
    const fromJson = JSON.parse(fromDoc) as unknown;
    const toJson = JSON.parse(toDoc) as unknown;
    if (!isNpmLockFileV3(fromJson)) {
      throw new Error("Could not parse 'from' npm package lock file");
    }
    if (!isNpmLockFileV3(toJson)) {
      throw new Error("Could not parse 'to' npm package lock file");
    }

    diff = diffNpmLockFileV3(fromJson, toJson, options);
  } else if (mode === 'pnpm') {
    // readWantedLockfile() expects a directory containing pnpm-lock.yaml
    const tmp = await mkdtemp(pathJoin(tmpdir(), 'npvd-'));
    try {
      const fromLockFilePath = pathJoin(tmp, 'from/pnpm-lock.yaml');
      const toLockFilePath = pathJoin(tmp, 'to/pnpm-lock.yaml');
      await mkdir(dirname(fromLockFilePath));
      await mkdir(dirname(toLockFilePath));
      await writeFile(fromLockFilePath, fromDoc, 'utf-8');
      await writeFile(toLockFilePath, toDoc, 'utf-8');

      const fromLockFile = await readWantedLockfile(dirname(fromLockFilePath), {
        ignoreIncompatible: false,
        useGitBranchLockfile: false,
      });
      const toLockFile = await readWantedLockfile(dirname(toLockFilePath), {
        ignoreIncompatible: false,
        useGitBranchLockfile: false,
      });
      if (!fromLockFile) {
        throw new Error("Could not parse 'from' pnpm package lock file");
      }
      if (!toLockFile) {
        throw new Error("Could not parse 'to' pnpm package lock file");
      }

      diff = diffPnpmLockFile(fromLockFile, toLockFile, options);
    } finally {
      await rm(tmp, {recursive: true, force: true});
    }
  }

  const intersectionIdxs: number[] = [];
  for (const f of diff.from) {
    const tIdx = diff.to.findIndex((t) => t.path.join('/') === f.path.join('/'));
    if (tIdx >= 0) {
      intersectionIdxs.push(tIdx);
      const t = diff.to[tIdx];
      if (t.version !== f.version) {
        changes.push({
          path: t.path,
          name: t.name,
          version: {from: f.version, to: t.version},
        });
      }
    } else {
      changes.push({
        path: f.path,
        name: f.name,
        version: {from: f.version, to: undefined},
      });
    }
  }
  for (const t of diff.to.filter((_, i) => !intersectionIdxs.includes(i))) {
    changes.push({
      path: t.path,
      name: t.name,
      version: {from: undefined, to: t.version},
    });
  }

  return changes.sort((a, b) => a.name.localeCompare(b.name));
}
