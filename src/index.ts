import {diffPackages, DiffResult} from './diff.js';
import {Format} from './utils.js';
import {stringify as csvStringify} from 'csv-stringify';

export {diffPackages};
export type {DiffResult};

export async function formatDiff(
  changes: DiffResult[],
  format: Format,
  options?: {
    jsonSpaces?: number;
  }
): Promise<string> {
  if (format === 'text') {
    return changes
      .map((change) => {
        const textPath = change.path.length > 1 ? ` [${change.path.join(' > ')}]` : '';
        const textVersion = `${change.version.from ?? '(added)'} -> ${change.version.to ?? '(removed)'}`;
        return `${change.name}${textPath}: ${textVersion}`;
      })
      .join('\n');
  } else if (format === 'csv') {
    const records = changes.map((change) => [
      change.name,
      change.path.join(' > '),
      change.version.from ?? '',
      change.version.to ?? '',
    ]);
    return new Promise((resolve, reject) =>
      csvStringify(
        records,
        {columns: ['name', 'path', 'from version', 'to version'], header: true},
        (err, output) => (err ? reject(err) : resolve(output))
      )
    );
  }

  return JSON.stringify(changes, undefined, options?.jsonSpaces);
}
