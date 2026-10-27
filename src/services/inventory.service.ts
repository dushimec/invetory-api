import { createHash } from 'node:crypto';
import { MovementType, Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { AppError } from '../utils/app-error.js';

export type StockOperation = 'receive' | 'issue' | 'adjust';

export interface StockInput {
  organizationId: string;
  actorId: string;
  productId: string;
  warehouseId: string;
  locationId?: string;
  quantity: string;
  unitCost?: string;
  reason?: string;
  idempotencyKey: string;
  operation: StockOperation;
  requestId?: string;
}

const movementTypes: Record<StockOperation, MovementType> = {
  receive: MovementType.PURCHASE_RECEIPT,
  issue: MovementType.SALE_ISSUE,
  adjust: MovementType.POSITIVE_ADJUSTMENT,
};

const payloadHash = (input: StockInput) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        operation: input.operation,
        productId: input.productId,
        warehouseId: input.warehouseId,
        locationId: input.locationId ?? null,
        quantity: input.quantity,
        unitCost: input.unitCost ?? null,
        reason: input.reason ?? null,
      }),
    )
    .digest('hex');

export async function postStockMovement(input: StockInput) {
  const suppliedAmount = new Prisma.Decimal(input.quantity);
  const signedDelta =
    input.operation === 'issue'
      ? suppliedAmount.abs().negated()
      : input.operation === 'adjust'
        ? suppliedAmount
        : suppliedAmount.abs();
  const amount = signedDelta.abs();
  if (
    !suppliedAmount.isFinite() ||
    amount.lte(0) ||
    (input.operation !== 'adjust' && suppliedAmount.lte(0))
  ) {
    throw new AppError(
      'Quantity must be greater than zero',
      400,
      'INVALID_QUANTITY',
    );
  }

  if (!input.idempotencyKey || input.idempotencyKey.length > 120) {
    throw new AppError(
      'A valid Idempotency-Key header is required',
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
    );
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        const [product, warehouse, settings] = await Promise.all([
          tx.product.findFirst({
            where: {
              id: input.productId,
              organizationId: input.organizationId,
              isActive: true,
            },
            select: { id: true },
          }),
          tx.warehouse.findFirst({
            where: {
              id: input.warehouseId,
              organizationId: input.organizationId,
              isActive: true,
            },
            select: { id: true },
          }),
          tx.organizationSettings.findUnique({
            where: { organizationId: input.organizationId },
            select: { allowNegativeStock: true },
          }),
        ]);
        if (!product || !warehouse || !settings) {
          throw new AppError(
            'Product or warehouse does not belong to this organization',
            404,
            'INVALID_REFERENCE',
          );
        }
        const location = input.locationId
          ? await tx.warehouseLocation.findFirst({
              where: {
                id: input.locationId,
                warehouseId: warehouse.id,
                isActive: true,
              },
              select: { id: true },
            })
          : await tx.warehouseLocation.findFirst({
              where: {
                warehouseId: warehouse.id,
                code: 'MAIN',
                isActive: true,
              },
              select: { id: true },
            });
        if (!location)
          throw new AppError(
            'Active location not found in this warehouse',
            400,
            'INVALID_LOCATION',
          );

        const key = {
          organizationId: input.organizationId,
          productId: product.id,
          warehouseId: warehouse.id,
          locationId: location.id,
        };
        await tx.inventoryBalance.upsert({
          where: { organizationId_productId_warehouseId_locationId: key },
          create: { ...key, onHand: 0, reserved: 0, averageCost: 0 },
          update: {},
        });
        await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "InventoryBalance"
        WHERE "organizationId" = ${input.organizationId}::uuid
          AND "productId" = ${product.id}::uuid
          AND "warehouseId" = ${warehouse.id}::uuid
          AND "locationId" = ${location.id}::uuid
        FOR UPDATE
      `);
        const balance = await tx.inventoryBalance.findUniqueOrThrow({
          where: { organizationId_productId_warehouseId_locationId: key },
        });
        const duplicate = await tx.inventoryMovement.findFirst({
          where: {
            organizationId: input.organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        });
        if (duplicate) {
          if (duplicate.requestHash !== payloadHash(input)) {
            throw new AppError(
              'Idempotency key was already used with a different request',
              409,
              'IDEMPOTENCY_CONFLICT',
            );
          }
          return duplicate;
        }
        if (input.operation === 'issue') {
          const available = balance.onHand.sub(balance.reserved);
          if (
            (balance.reserved.gt(0) &&
              balance.onHand.sub(amount).lt(balance.reserved)) ||
            (!settings.allowNegativeStock && available.lt(amount))
          ) {
            throw new AppError(
              'Insufficient available stock',
              409,
              'INSUFFICIENT_STOCK',
            );
          }
        }

        if (input.operation === 'adjust' && !input.reason?.trim()) {
          throw new AppError(
            'A reason is required for stock adjustments',
            400,
            'REASON_REQUIRED',
          );
        }
        const after = balance.onHand.add(signedDelta);
        if (
          input.operation === 'adjust' &&
          signedDelta.lt(0) &&
          after.lt(balance.reserved)
        ) {
          throw new AppError(
            'Adjustment cannot reduce stock below reserved quantities',
            409,
            'RESERVED_STOCK',
          );
        }
        if (!settings.allowNegativeStock && after.lt(0)) {
          throw new AppError('Stock cannot be negative', 409, 'NEGATIVE_STOCK');
        }
        const unitCost =
          input.operation === 'receive'
            ? new Prisma.Decimal(input.unitCost ?? '0')
            : balance.averageCost;
        if (!unitCost.isFinite() || unitCost.lt(0)) {
          throw new AppError(
            'Unit cost must be a non-negative decimal amount',
            400,
            'INVALID_COST',
          );
        }
        const averageCost =
          input.operation === 'receive' && after.gt(0)
            ? balance.onHand.gt(0)
              ? balance.onHand
                  .mul(balance.averageCost)
                  .add(amount.mul(unitCost))
                  .div(after)
              : unitCost
            : balance.averageCost;
        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: { onHand: after, averageCost },
        });
        const movement = await tx.inventoryMovement.create({
          data: {
            ...key,
            type:
              input.operation === 'adjust' && signedDelta.lt(0)
                ? MovementType.NEGATIVE_ADJUSTMENT
                : movementTypes[input.operation],
            quantityDelta: signedDelta,
            quantityBefore: balance.onHand,
            quantityAfter: after,
            unitCost,
            idempotencyKey: input.idempotencyKey,
            requestHash: payloadHash(input),
            reason: input.reason,
            actorId: input.actorId,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: input.organizationId,
            actorId: input.actorId,
            action: `inventory.${input.operation}`,
            entityType: 'inventory_movement',
            entityId: movement.id,
            requestId: input.requestId,
            changes: {
              productId: product.id,
              warehouseId: warehouse.id,
              quantityDelta: signedDelta.toString(),
              quantityBefore: balance.onHand.toString(),
              quantityAfter: after.toString(),
              payloadHash: payloadHash(input),
            },
            reason: input.reason,
          },
        });
        return movement;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await prisma.inventoryMovement.findFirst({
        where: {
          organizationId: input.organizationId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (existing) {
        if (existing.requestHash === payloadHash(input)) return existing;
        throw new AppError(
          'Idempotency key was already used with a different request',
          409,
          'IDEMPOTENCY_CONFLICT',
        );
      }
    }
    throw error;
  }
}

export async function reconcileInventory(organizationId: string) {
  return prisma.$queryRaw<
    Array<{
      productId: string;
      warehouseId: string;
      locationId: string;
      ledgerOnHand: Prisma.Decimal;
      balanceOnHand: Prisma.Decimal;
      mismatchCount: bigint;
    }>
  >(Prisma.sql`
    WITH ledger AS (
      SELECT "organizationId", "productId", "warehouseId", "locationId",
        SUM("quantityDelta") AS "ledgerOnHand"
      FROM "InventoryMovement"
      WHERE "organizationId" = ${organizationId}::uuid
      GROUP BY "organizationId", "productId", "warehouseId", "locationId"
    ),
    balances AS (
      SELECT "organizationId", "productId", "warehouseId", "locationId", "onHand" AS "balanceOnHand"
      FROM "InventoryBalance"
      WHERE "organizationId" = ${organizationId}::uuid
    ),
    mismatches AS (
      SELECT
        COALESCE(ledger."productId", balances."productId") AS "productId",
        COALESCE(ledger."warehouseId", balances."warehouseId") AS "warehouseId",
        COALESCE(ledger."locationId", balances."locationId") AS "locationId",
        COALESCE(ledger."ledgerOnHand", 0) AS "ledgerOnHand",
        COALESCE(balances."balanceOnHand", 0) AS "balanceOnHand"
      FROM ledger
      FULL OUTER JOIN balances USING ("organizationId", "productId", "warehouseId", "locationId")
      WHERE COALESCE(ledger."ledgerOnHand", 0) IS DISTINCT FROM COALESCE(balances."balanceOnHand", 0)
    )
    SELECT *, COUNT(*) OVER() AS "mismatchCount"
    FROM mismatches
    ORDER BY "productId", "warehouseId", "locationId"
    LIMIT 100
  `);
}
