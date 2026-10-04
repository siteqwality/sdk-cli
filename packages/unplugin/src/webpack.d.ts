import type { Options } from './options.js';
export default function webpack(options?: Options): { apply(compiler: unknown): void };
