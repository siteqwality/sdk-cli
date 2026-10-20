export interface SourceMap {
  version: 3;
  file?: string;
  sourceRoot?: string;
  sources: string[];
  names: string[];
  mappings: string;
  sourcesContent?: (string | null)[];
  debugId?: string;
  [key: string]: unknown;
}
export interface AccountApiOptions {
  apiKey: string;
  apiBase?: string;
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}
export interface ApiOptions extends AccountApiOptions {
  app: string;
}
export interface ReleaseMetadata {
  commit?: string;
  env?: string;
}
export interface UploadOptions extends ApiOptions, ReleaseMetadata {
  release?: string;
  concurrency?: number;
  deleteAfter?: boolean;
}
export interface Release {
  id: string;
  application_id: string;
  version: string;
  created_at: string;
  source_map_count: number;
  commit_sha: string | null;
  env: string | null;
  deployed_at: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
}
export interface UploadFile {
  filename: string;
  debug_id: string;
  size_bytes: number;
  content_type: 'application/json';
  content_encoding: 'gzip';
}
export interface PresignedFile extends UploadFile {
  id: string;
  upload_url: string;
  s3_key: string;
  expires_in_seconds: number;
  headers: Record<string, string>;
}
export interface ConfirmedFile {
  id: string;
  status: 'ready';
  debug_id: string;
  size_bytes: number;
}
export interface UploadResult {
  uploaded: number;
  debugIds: string[];
}
export interface FilePair {
  jsPath: string;
  mapPath: string;
  filename: string;
  code: string;
  rawMap: string;
}
export function validateMap(map: unknown): asserts map is SourceMap;
export function inject(
  code: string,
  inputMap: SourceMap | string,
): { code: string; map: SourceMap; debugId: string };
export function collectPairs(directory: string): Promise<FilePair[]>;
export function injectDirectory(
  directory: string,
): Promise<{ filename: string; debugId: string }[]>;
export function uploadMaps(
  maps: { filename: string; map: SourceMap }[],
  options: UploadOptions,
): Promise<UploadResult>;
export function uploadDirectory(directory: string, options: UploadOptions): Promise<UploadResult>;
export class ApiClient {
  constructor(options: ApiOptions);
  createRelease(version: string, metadata?: ReleaseMetadata): Promise<Release>;
  deployRelease(version: string, env?: string): Promise<Release>;
  listReleases(): Promise<Release[]>;
  presign(version: string, files: UploadFile[]): Promise<{ files: PresignedFile[] }>;
  confirm(ids: string[]): Promise<{ files: ConfirmedFile[] }>;
  put(url: string, headers: Record<string, string>, body: Uint8Array): Promise<void>;
}

export interface Incident {
  id: string;
  title: string;
  severity: 'minor' | 'major' | 'critical';
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  responder_status: 'triggered' | 'acknowledged' | 'resolved';
  service_id: string | null;
  [key: string]: unknown;
}
export class IncidentClient {
  constructor(options: AccountApiOptions);
  listIncidents(options?: {
    status?: 'active' | 'resolved' | 'all';
    limit?: number;
    offset?: number;
  }): Promise<{ data: Incident[]; total: number }>;
  acknowledgeIncident(id: string, acknowledgedBy: string): Promise<Incident>;
  resolveIncident(
    id: string,
    options?: { message?: string; notifySubscribers?: boolean },
  ): Promise<Incident>;
  updateIncident(
    id: string,
    changes: {
      title?: string;
      severity?: 'minor' | 'major' | 'critical';
      serviceId?: string | null;
    },
  ): Promise<Incident>;
}

export interface OnCallShift {
  schedule_id?: string;
  schedule_name?: string;
  user_id?: string;
  source: 'override' | 'layer' | 'gap';
  layer_id?: string;
  layer_number?: number;
  override_id?: string;
  starts_at?: string;
  ends_at?: string;
}
export interface OnCallNow {
  schedule_id: string;
  at: string;
  timezone: string;
  on_call: OnCallShift;
  next?: OnCallShift;
}
export class OnCallClient {
  constructor(options: AccountApiOptions);
  onCallNow(options: { scheduleId: string; at?: string }): Promise<OnCallNow>;
  onCallNow(options?: { at?: string }): Promise<OnCallShift[]>;
  listShifts(
    scheduleId: string,
    range?: { since?: string; until?: string },
  ): Promise<{
    schedule_id: string;
    since: string;
    until: string;
    timezone: string;
    shifts: OnCallShift[];
  }>;
  listMemberShifts(
    userId: string,
    range?: { since?: string; until?: string },
  ): Promise<OnCallShift[]>;
}

export function sourceMapReference(code: string): string | undefined;
