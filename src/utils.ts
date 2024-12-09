import {dependencyTypes} from './options.js';

export function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && !!val && !Array.isArray(val);
}

export const formats = ['text', 'json', 'csv'] as const;
export type Format = (typeof formats)[number];

export function isFormat(val: unknown): val is Format {
  return typeof val === 'string' && (formats as readonly string[]).includes(val);
}

export interface NpmLockFileV3 {
  lockfileVersion: number;
  packages: {
    '': {
      name: string;
      version: string;
      dependencies?: Record<string, string | undefined>;
      devDependencies?: Record<string, string | undefined>;
      optionalDependencies?: Record<string, string | undefined>;
      peerDependencies?: Record<string, string | undefined>;
    };
    [key: string]:
      | undefined
      | {
          version: string;
          dev?: boolean;
          optional?: boolean;
          peer?: boolean;
        };
  };
}

export function isNpmLockFileV3(val: unknown): val is NpmLockFileV3 {
  const base = isRecord(val) && val.lockfileVersion === 3;
  if (!base) return false;

  const packages = isRecord(val.packages) ? val.packages : undefined;
  if (!packages) return false;

  const thisPackage = isRecord(packages['']) ? packages[''] : undefined;
  if (!thisPackage) return false;

  for (const dependencyType of dependencyTypes) {
    const depName = `${dependencyType}Dependencies`;
    const dependencies = thisPackage[depName];
    if (dependencies === undefined) continue;
    if (
      !isRecord(dependencies) ||
      !Object.entries(dependencies).every(
        ([name, version]) => typeof name === 'string' && typeof version === 'string'
      )
    ) {
      return false;
    }
  }

  const otherPackages = Object.entries(packages).filter(([key]) => key !== '');
  for (const otherPackage of otherPackages) {
    const details = otherPackage[1];
    if (!isRecord(details)) return false;
    if (typeof details.version !== 'string') return false;
    if (details.dev !== undefined && typeof details.dev !== 'boolean') return false;
    if (details.optional !== undefined && typeof details.optional !== 'boolean') return false;
    if (details.peer !== undefined && typeof details.peer !== 'boolean') return false;
  }

  return true;
}
