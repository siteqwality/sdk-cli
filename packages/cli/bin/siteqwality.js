#!/usr/bin/env node
import { Command, InvalidArgumentError } from 'commander';
import { ApiClient, injectDirectory, uploadDirectory } from '../src/index.js';

const program = new Command()
  .name('siteqwality')
  .version('0.1.0')
  .description('SiteQwality Debug ID source maps and releases');
const integer = (value) => {
  if (!/^\d+$/.test(value)) throw new InvalidArgumentError('Expected an integer');
  return Number(value);
};
function authenticated(command) {
  return command
    .option('--app <uuid>', 'Application UUID', process.env.SITEQWALITY_APP_ID)
    .option('--api-url <url>', 'SiteQwality API base URL', process.env.SITEQWALITY_API_URL)
    .option('--retries <count>', 'Transient retries per request, 0 to 5', integer, 2)
    .option('--timeout <ms>', 'Request timeout, 1 to 300000 milliseconds', integer, 30000);
}
function options(command) {
  return {
    ...command,
    apiKey: process.env.SITEQWALITY_API_KEY,
    apiBase: command.apiUrl,
    timeoutMs: command.timeout,
  };
}
const print = (result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
const maps = program
  .command('sourcemaps')
  .description('Inject Debug IDs and upload matching external source maps');
maps
  .command('inject <directory>')
  .description('Inject deterministic IDs into JavaScript and matching maps')
  .action(async (directory) => print(await injectDirectory(directory)));
authenticated(
  maps
    .command('upload <directory>')
    .description('Gzip, presign, PUT and confirm previously injected maps'),
)
  .option(
    '--release <version>',
    'Product release; defaults to __debug_id__',
    process.env.SITEQWALITY_RELEASE,
  )
  .option('--commit <sha>', 'Release commit SHA')
  .option('--env <environment>', 'Release environment')
  .option('--concurrency <count>', 'Parallel PUT requests, 1 to 16', integer, 4)
  .option('--delete-after', 'Delete maps only after every upload is confirmed', false)
  .action(async (directory, opts) => print(await uploadDirectory(directory, options(opts))));
const releases = program.command('releases').description('Manage app-scoped releases');
authenticated(releases.command('new <version>').description('Create or update a release'))
  .option('--commit <sha>', 'Commit SHA')
  .option('--env <environment>', 'Release environment')
  .action(async (version, opts) =>
    print(await new ApiClient(options(opts)).createRelease(version, opts)),
  );
authenticated(
  releases
    .command('deploy <version>')
    .description('Record server deployment time for an existing release'),
)
  .option('--env <environment>', 'Release environment')
  .action(async (version, opts) =>
    print(await new ApiClient(options(opts)).deployRelease(version, opts.env)),
  );
authenticated(releases.command('list').description('List releases, newest created first')).action(
  async (opts) => print(await new ApiClient(options(opts)).listReleases()),
);
try {
  await program.parseAsync();
} catch (error) {
  process.stderr.write(`siteqwality: ${error.message}\n`);
  process.exitCode = 1;
}
