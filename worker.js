export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Serve the static customer website through Cloudflare Workers Assets.
    // Root and extensionless paths fall back to index.html for SPA-style navigation.
    let response = await env.ASSETS.fetch(request);
    if (response.status === 404 && !url.pathname.includes('.')) {
      const indexUrl = new URL('/index.html', request.url);
      response = await env.ASSETS.fetch(new Request(indexUrl, request));
    }
    return response;
  }
};
