import type { Options } from './options.js';
/** Structurally compatible with Vite Plugin, without requiring other bundler types. */
export default function vite(options?: Options): { name: string; enforce: 'post'; apply: 'build' };
