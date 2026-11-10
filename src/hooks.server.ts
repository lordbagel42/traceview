import type { Handle } from '@sveltejs/kit/hooks';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'no-referrer');
	response.headers.set('X-Frame-Options', 'DENY');
	if (event.url.pathname.startsWith('/s/')) {
		response.headers.set('Cache-Control', 'no-store');
		response.headers.set('X-Robots-Tag', 'noindex, nofollow');
	}
	return response;
};
