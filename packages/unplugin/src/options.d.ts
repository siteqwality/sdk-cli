import type { UploadOptions } from '@siteqwality/cli';
export interface Options extends Partial<UploadOptions> {
  /** Defaults to true. Use false for local injection without network requests. */
  upload?: boolean;
}
