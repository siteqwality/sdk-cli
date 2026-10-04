import type { Options } from './options.js';
export default function esbuild(options?: Options): { name: string; setup(build: unknown): void };
