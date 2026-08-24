/**
 * Build-time constants injected by Vite's `define` (see packages/config/src/vite.base.ts).
 *
 * These are replaced with string/boolean literals before minification, which is
 * what lets the unused portal adapters get tree-shaken out of the bundle.
 */
declare const __UCGAMES_PORTAL__: 'local' | 'crazygames' | 'poki' | 'gamedistribution';
declare const __UCGAMES_GAME_SLUG__: string;
declare const __UCGAMES_DEV__: boolean;
