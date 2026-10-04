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
export interface ApiOptions {
  app: string;
  apiKey: string;
  apiBase?: string;
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
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

export function sourceMapReference(code: string): string | undefined;
