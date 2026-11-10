import type { RequestHandler } from 'express';
import { z } from 'zod';
import {
  customerOutstandingReport,
  deliveryTrackingReport,
  importProcurementReport,
  inventoryValuation,
  lowStockReport,
  movementReport,
} from '../services/reports.service.js';
import { success } from '../utils/api-response.js';

const reportQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    warehouseId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
  })
  .strict();

const importReportQuerySchema = reportQuerySchema
  .omit({ productId: true })
  .extend({
    status: z
      .enum([
        'DRAFT',
        'SUBMITTED',
        'APPROVED',
        'PARTIALLY_RECEIVED',
        'FULLY_RECEIVED',
        'CANCELLED',
        'REJECTED',
        'CLOSED',
      ])
      .optional(),
  });

const deliveryReportQuerySchema = reportQuerySchema
  .omit({ productId: true })
  .extend({
    status: z.enum(['IN_TRANSIT', 'DELIVERED', 'FAILED']).optional(),
  });

export const valuation: RequestHandler = async (req, res) => {
  success(
    res,
    'Inventory valuation report retrieved',
    await inventoryValuation(
      req.auth!.organizationId,
      reportQuerySchema.parse(req.query),
    ),
  );
};

export const movements: RequestHandler = async (req, res) => {
  success(
    res,
    'Inventory movement report retrieved',
    await movementReport(
      req.auth!.organizationId,
      reportQuerySchema.parse(req.query),
    ),
  );
};

export const lowStock: RequestHandler = async (req, res) => {
  success(
    res,
    'Low-stock report retrieved',
    await lowStockReport(
      req.auth!.organizationId,
      reportQuerySchema.parse(req.query),
    ),
  );
};

export const imports: RequestHandler = async (req, res) => {
  success(
    res,
    'Import procurement report retrieved',
    await importProcurementReport(
      req.auth!.organizationId,
      importReportQuerySchema.parse(req.query),
    ),
  );
};

export const deliveries: RequestHandler = async (req, res) => {
  success(
    res,
    'Delivery tracking report retrieved',
    await deliveryTrackingReport(
      req.auth!.organizationId,
      deliveryReportQuerySchema.parse(req.query),
    ),
  );
};

export const customerOutstanding: RequestHandler = async (req, res) => {
  success(
    res,
    'Customer outstanding balances report retrieved',
    await customerOutstandingReport(
      req.auth!.organizationId,
      reportQuerySchema
        .omit({ warehouseId: true, productId: true })
        .parse(req.query),
    ),
  );
};
