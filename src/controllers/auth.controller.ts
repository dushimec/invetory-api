import type { RequestHandler } from 'express';
import { prisma } from '../config/db.js';
import * as authService from '../services/auth.service.js';
import { success } from '../utils/api-response.js';
import { AppError } from '../utils/app-error.js';

export const register: RequestHandler = async (req, res) => {
  const result = await authService.register(req.body);
  success(res, 'Organization registered successfully', result, 201);
};

export const login: RequestHandler = async (req, res) => {
  const result = await authService.login(
    req.body.email,
    req.body.password,
    req.body.organizationSlug,
  );
  success(res, 'Signed in successfully', result);
};

export const refresh: RequestHandler = async (req, res) => {
  success(
    res,
    'Access token refreshed successfully',
    await authService.refresh(req.body.refreshToken),
  );
};

export const logout: RequestHandler = async (req, res) => {
  await authService.logout(req.auth!.sessionId);
  await prisma.auditLog.create({
    data: {
      organizationId: req.auth!.organizationId,
      actorId: req.auth!.userId,
      action: 'auth.logout',
      entityType: 'user_session',
      entityId: req.auth!.sessionId,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    },
  });
  success(res, 'Signed out successfully', null);
};

export const me: RequestHandler = async (req, res) => {
  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userId: req.auth!.userId,
      organizationId: req.auth!.organizationId,
      status: 'ACTIVE',
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          createdAt: true,
          mustChangePassword: true,
        },
      },
      role: { select: { id: true, name: true } },
      organization: {
        select: { id: true, name: true, slug: true, settings: true },
      },
    },
  });
  if (!membership) throw new AppError('Membership not found', 404, 'NOT_FOUND');
  success(res, 'Current user retrieved successfully', {
    user: membership.user,
    organization: membership.organization,
    role: membership.role,
    permissions: req.auth!.permissions,
    mustChangePassword: req.auth!.mustChangePassword,
  });
};

export const changePassword: RequestHandler = async (req, res) => {
  await authService.changePassword({
    userId: req.auth!.userId,
    organizationId: req.auth!.organizationId,
    sessionId: req.auth!.sessionId,
    currentPassword: req.body.currentPassword,
    newPassword: req.body.newPassword,
  });
  success(res, 'Password changed successfully', null);
};
