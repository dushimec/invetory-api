import type { RequestHandler } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../config/db.js';
import { AppError } from '../utils/app-error.js';

type AccessClaims = JwtPayload & {
  sub: string;
  org: string;
  sid: string;
  typ: 'access';
};

export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
    }
    const decoded = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET);
    if (
      typeof decoded === 'string' ||
      decoded.typ !== 'access' ||
      typeof decoded.sub !== 'string' ||
      typeof decoded.org !== 'string' ||
      typeof decoded.sid !== 'string'
    ) {
      throw new AppError('Invalid access token', 401, 'INVALID_TOKEN');
    }
    const claims = decoded as AccessClaims;
    const membership = await prisma.organizationMembership.findFirst({
      where: {
        userId: claims.sub,
        organizationId: claims.org,
        status: 'ACTIVE',
        user: { isActive: true },
      },
      include: {
        user: { select: { mustChangePassword: true } },
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });
    const session = await prisma.userSession.findFirst({
      where: {
        id: claims.sid,
        userId: claims.sub,
        organizationId: claims.org,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!membership || !session) {
      throw new AppError('Access denied', 401, 'INVALID_SESSION');
    }
    req.auth = {
      userId: claims.sub,
      organizationId: claims.org,
      sessionId: claims.sid,
      mustChangePassword: membership.user.mustChangePassword,
      permissions: membership.user.mustChangePassword
        ? []
        : membership.role.permissions.map((item) => item.permission.key),
    };
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    if (
      error instanceof jwt.JsonWebTokenError ||
      error instanceof jwt.TokenExpiredError
    ) {
      next(
        new AppError('Invalid or expired access token', 401, 'INVALID_TOKEN'),
      );
      return;
    }
    next(error);
  }
};
