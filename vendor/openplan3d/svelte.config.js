import adapter from '@sveltejs/adapter-static';

// PoC OpenPlan3D (BuildSmart /labs/openplan3d) — trocado de adapter-node
// (SSR, como o upstream roda em produção) para adapter-static (SPA), porque
// este bundle é servido como asset estático same-origin do Next.js, no
// mesmo padrão do vendor/axonometra. Ver VENDOR.md.
/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			fallback: 'index.html',
			strict: false
		}),
		paths: {
			base: process.env.OPENPLAN3D_BASE_PATH ?? ''
		}
	}
};

export default config;
