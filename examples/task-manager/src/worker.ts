// Temporary worker entry point
// Will be replaced by @vertz/cloudflare adapter (see issue #381)
// For now, serves a simple status page

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    
    return new Response(`
      <!DOCTYPE html>
      <html>
        <head><title>Vertz Task Manager</title></head>
        <body>
          <h1>Vertz Task Manager</h1>
          <p>SSR coming soon via @vertz/cloudflare adapter</p>
          <p>Path: ${url.pathname}</p>
        </body>
      </html>
    `, { headers: { 'content-type': 'text/html' } })
  }
}
