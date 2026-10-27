import { Router } from 'express';
import * as controller from '../controllers/categories.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';

const categories = Router();
categories.use(authenticate);
categories.get(
  '/',
  requirePermission('products.read'),
  controller.listCategories,
);
categories.post(
  '/',
  requirePermission('settings.manage'),
  validate(controller.categoryCreateSchema),
  controller.createCategory,
);
categories.get(
  '/:id',
  requirePermission('products.read'),
  validate(controller.categoryIdSchema, 'params'),
  controller.getCategoryById,
);
categories.patch(
  '/:id',
  requirePermission('settings.manage'),
  validate(controller.categoryIdSchema, 'params'),
  validate(controller.categoryUpdateSchema),
  controller.updateCategory,
);
categories.delete(
  '/:id',
  requirePermission('settings.manage'),
  validate(controller.categoryIdSchema, 'params'),
  controller.deleteCategory,
);

const units = Router();
units.use(authenticate);
units.get('/', requirePermission('products.read'), controller.listUnits);
units.post(
  '/',
  requirePermission('settings.manage'),
  validate(controller.unitCreateSchema),
  controller.createUnit,
);
units.get(
  '/:id',
  requirePermission('products.read'),
  validate(controller.unitIdSchema, 'params'),
  controller.getUnitById,
);
units.patch(
  '/:id',
  requirePermission('settings.manage'),
  validate(controller.unitIdSchema, 'params'),
  validate(controller.unitUpdateSchema),
  controller.updateUnit,
);
units.delete(
  '/:id',
  requirePermission('settings.manage'),
  validate(controller.unitIdSchema, 'params'),
  controller.deleteUnit,
);

export { categories, units };
