// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import svelte from '@astrojs/svelte';

const devDownloadsRoot = fileURLToPath(
	new URL('../../datasets/publish/downloads', import.meta.url),
);

/** Serve published dataset CSVs in dev; production uses Caddy `/downloads`. */
function publishedDownloadsPlugin() {
	return {
		name: 'published-downloads',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use('/downloads', (req, res, next) => {
				const rawPath = (req.url ?? '/').split('?')[0];
				const basename = path.basename(rawPath);
				if (!basename || basename.includes('..')) {
					res.statusCode = 400;
					res.end('Bad request');
					return;
				}

				const filePath = path.join(devDownloadsRoot, basename);
				if (!filePath.startsWith(devDownloadsRoot)) {
					res.statusCode = 400;
					res.end('Bad request');
					return;
				}

				fs.readFile(filePath, (err, data) => {
					if (err) {
						if (err.code === 'ENOENT') {
							res.statusCode = 404;
							res.end('Not found');
							return;
						}
						next(err);
						return;
					}
					if (basename.endsWith('.csv')) {
						res.setHeader('Content-Type', 'text/csv; charset=utf-8');
					}
					res.end(data);	
				});
			});
		},
	};
}

// https://astro.build/config
export default defineConfig({
	vite: {
		plugins: [tailwindcss(), publishedDownloadsPlugin()],
	},

	integrations: [svelte()],
});
