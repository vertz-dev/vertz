import { createMiddleware, UnauthorizedException } from '@vertz/server';

export const authMiddleware = createMiddleware({
  name: 'auth',
  handler: (ctx): Record<string, unknown> => {
    const headers = ctx.headers as Record<string, string>;
    const authHeader = headers.authorization as string | undefined;

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
