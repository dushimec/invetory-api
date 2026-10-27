import { Prisma } from '@prisma/client';
import { AppError } from './app-error.js';

export function landedUnitCostInBaseCurrency(
  receivedUnitCost: Prisma.Decimal,
  orderUnitCost: Prisma.Decimal,
  orderSubtotal: Prisma.Decimal,
  totalLandedCost: Prisma.Decimal,
  exchangeRate: Prisma.Decimal,
) {
  let allocatedLandedCost = new Prisma.Decimal(0);
  if (totalLandedCost.gt(0)) {
    if (!orderSubtotal.gt(0)) {
      throw new AppError(
        'Landed costs cannot be allocated by purchase value when all item values are zero',
        400,
        'LANDED_COST_ALLOCATION_UNAVAILABLE',
      );
    }
    allocatedLandedCost = totalLandedCost.mul(orderUnitCost).div(orderSubtotal);
  }
  return receivedUnitCost.add(allocatedLandedCost).mul(exchangeRate);
}
