import { Router } from 'express';
import * as controller from '../controllers/products.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  createProductSchema,
  productListSchema,
  productParamsSchema,
  updateProductSchema,
} from '../validators/product.validator.js';

const router = Router();
router.use(authenticate);
router.get(
  '/',
  requirePermission('products.read'),
  validate(productListSchema, 'query'),
  controller.list,
);
router.post(
  '/',
  requirePermission('products.create'),
  validate(createProductSchema),
  controller.create,
);
router.get(
  '/barcode/:barcode',
  requirePermission('products.read'),
  controller.barcode,
);
router.get(
  '/:id',
  requirePermission('products.read'),
  validate(productParamsSchema, 'params'),
  controller.getById,
);
router.patch(
  '/:id',
  requirePermission('products.update'),
  validate(productParamsSchema, 'params'),
  validate(updateProductSchema),
  controller.update,
);
router.delete(
  '/:id',
  requirePermission('products.archive'),
  validate(productParamsSchema, 'params'),
  controller.archive,
);

export default router;
