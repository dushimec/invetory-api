import type { RequestHandler } from 'express';
import {
  getOrganizationSettings,
  updateOrganizationSettings,
} from '../services/organization.service.js';
import { success } from '../utils/api-response.js';

export const getSettings: RequestHandler = async (req, res) => {
  success(
    res,
    'Organization settings retrieved successfully',
    await getOrganizationSettings(req.auth!.organizationId),
  );
};

export const updateSettings: RequestHandler = async (req, res) => {
  success(
    res,
    'Organization settings updated successfully',
    await updateOrganizationSettings(
      req.auth!.organizationId,
      req.auth!.userId,
      req.body,
      req.requestId,
    ),
  );
};
