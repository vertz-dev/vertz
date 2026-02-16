import { createMiddleware, UnauthorizedException } from '@vertz/server';
export const authMiddleware = createMiddleware({
  name: 'auth',
  handler: (ctx) => {
    const headers = ctx.headers;
    const authHeader = headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required');
    }
    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid token format');
    }
    const userId = authHeader.slice('Bearer '.length);
    return { user: { id: userId, role: 'user' } };
  },
});
//# sourceMappingURL=auth.js.map
