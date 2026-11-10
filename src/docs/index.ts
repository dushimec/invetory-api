import { authPaths } from './auth.docs.js';
import { inventoryPaths } from './inventory.docs.js';
import { productPaths } from './products.docs.js';
import { purchasePaths } from './purchases.docs.js';
import { reportPaths } from './reports.docs.js';
import { salesPaths } from './sales.docs.js';
import { transferPaths } from './transfers.docs.js';
import { warehousePaths } from './warehouses.docs.js';
import { returnPaths } from './returns.docs.js';
import { adjustmentPaths } from './adjustments.docs.js';
import { adminPaths } from './admin.docs.js';
import { catalogPaths } from './Category.docs.js';
import { stockCountPaths } from './stock-counts.docs.js';

export const apiPaths = {
  ...authPaths,
  ...catalogPaths,
  ...productPaths,
  ...warehousePaths,
  ...inventoryPaths,
  ...purchasePaths,
  ...salesPaths,
  ...transferPaths,
  ...adjustmentPaths,
  ...stockCountPaths,
  ...returnPaths,
  ...reportPaths,
  ...adminPaths,
};
