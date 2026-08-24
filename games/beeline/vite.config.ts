import { defineGameConfig } from '@ucgames/config/vite';

export default defineGameConfig({
  slug: 'beeline',
  overrides: {
    // `assets/` is both the Vite public directory and the folder the license
    // checker scans, so every shipped asset is necessarily accounted for in
    // assets/LICENSES.md. Keeping them the same directory is what makes the
    // gate impossible to route around.
    publicDir: 'assets',
  },
});
