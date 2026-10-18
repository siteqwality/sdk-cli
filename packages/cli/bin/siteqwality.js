#!/usr/bin/env node
import { Command, InvalidArgumentError } from 'commander';
import { ApiClient, IncidentClient, injectDirectory, uploadDirectory } from '../src/index.js';

const program = new Command()
  .name('siteqwality')
  .version('0.1.2')
  .description('Site Qwality source maps, releases and incidents');
const integer = (value) => {
  if (!/^\d+$/.test(value)) throw new InvalidArgumentError('Expected an integer');
  return Number(value);
};
function accountAuthenticated(command) {
  return command
    .option('--api-url <url>', 'Site Qwality API base URL', process.env.SITEQWALITY_API_URL)
    .option('--retries <count>', 'Transient retries per request, 0 to 5', integer, 2)
    .option('--timeout <ms>', 'Request timeout, 1 to 300000 milliseconds', integer, 30000);
}
function authenticated(command) {
  return accountAuthenticated(command).option(
    '--app <uuid>',
    'Application UUID',
    process.env.SITEQWALITY_APP_ID,
  );
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
const incidents = program.command('incidents').description('List and manage account incidents');
accountAuthenticated(
  incidents.command('list').description('List one page, with the total matching count'),
)
  .option('--status <status>', 'active, resolved or all', 'active')
  .option('--limit <count>', 'Page size, 1 to 100', integer, 50)
  .option('--offset <count>', 'Row offset', integer, 0)
  .action(async (opts) => print(await new IncidentClient(options(opts)).listIncidents(opts)));
accountAuthenticated(
  incidents
    .command('ack <incident>')
    .description('Acknowledge as an account member and stop escalation'),
)
  .requiredOption('--by <uuid>', 'Acknowledging member UUID, required for API keys')
  .action(async (id, opts) =>
    print(await new IncidentClient(options(opts)).acknowledgeIncident(id, opts.by)),
  );
accountAuthenticated(
  incidents
    .command('resolve <incident>')
    .description('Resolve; published incidents get a public resolution'),
)
  .option('--message <text>', 'Public resolution text')
  .option(
    '--no-notify-subscribers',
    'Suppress subscriber email; the public resolution is still posted',
  )
  .action(async (id, opts) =>
    print(await new IncidentClient(options(opts)).resolveIncident(id, opts)),
  );
accountAuthenticated(
  incidents.command('update <incident>').description('Change title, severity or service'),
)
  .option('--title <text>', 'Incident title')
  .option('--severity <severity>', 'minor, major or critical')
  .option('--service <uuid>', 'Move to a service, which may start paging')
  .option('--clear-service', 'Detach the incident from its service')
  .action(async (id, opts) => {
    if (opts.service && opts.clearService) throw new Error('Choose --service or --clear-service');
    print(
      await new IncidentClient(options(opts)).updateIncident(id, {
        title: opts.title,
        severity: opts.severity,
        serviceId: opts.clearService ? null : opts.service,
      }),
    );
  });
try {
  await program.parseAsync();
} catch (error) {
  process.stderr.write(`siteqwality: ${error.message}\n`);
  process.exitCode = 1;
}
