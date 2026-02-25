export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const html = await fetch("https://raw.githubusercontent.com/vertz-dev/vertz/refs/heads/main/sites/landing/index.html").then(r => r.text());
    
    return new Response(html, {
      headers: {
        "content-type": "text/html;charset=UTF-8",
        "cache-control": "public, max-age=3600",
      },
    });
  },
} satisfies ExportedHandler;
