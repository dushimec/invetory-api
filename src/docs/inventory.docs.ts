const auth = [{ bearerAuth: [] }];
const pagination = [
  {
    in: 'query',
    name: 'page',
    schema: { type: 'integer', minimum: 1, default: 1 },
  },
  {
    in: 'query',
    name: 'pageSize',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
  {
    in: 'query',
    name: 'warehouseId',
    schema: { type: 'string', format: 'uuid' },
  },
  {
    in: 'query',
    name: 'productId',
    schema: { type: 'string', format: 'uuid' },
  },
];
const idempotency = [{ $ref: '#/components/parameters/IdempotencyKey' }];
const movementBody = {
  type: 'object',
  required: ['productId', 'warehouseId', 'quantity'],
  additionalProperties: false,
  properties: {
    productId: { type: 'string', format: 'uuid' },
    warehouseId: { type: 'string', format: 'uuid' },
    locationId: { type: 'string', format: 'uuid' },
    quantity: {
      type: 'string',
      description:
        'Decimal string; adjustment accepts a signed non-zero quantity.',
    },
    unitCost: {
      type: 'string',
      description: 'Required for receipt; decimal string.',
    },
    reason: { type: 'string', maxLength: 500 },
  },
};

export const inventoryPaths = {
  '/inventory/balances': {
    get: {
      tags: ['Inventory'],
      security: auth,
      summary: 'List on-hand, reserved, and available balances',
      parameters: pagination,
      responses: {
        '200': {
          description:
            'Paginated balances with product, warehouse, and location details',
        },
      },
    },
  },
  '/inventory/movements': {
    get: {
      tags: ['Inventory'],
      security: auth,
      summary: 'List immutable inventory ledger movements',
      parameters: pagination,
      responses: { '200': { description: 'Paginated movement ledger' } },
    },
  },
  '/inventory/reconciliation': {
    get: {
      tags: ['Inventory'],
      security: auth,
      summary:
        'Compare denormalized inventory balances to movement-ledger aggregates',
      responses: {
        '200': {
          description:
            'Reconciliation status and up to 100 mismatches; does not modify balances',
        },
      },
    },
  },
  '/inventory/receive': {
    post: {
      tags: ['Inventory'],
      security: auth,
      summary: 'Receive stock atomically and update weighted-average cost',
      parameters: idempotency,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: movementBody } },
      },
      responses: {
        '201': { description: 'Stock movement posted' },
        '400': { $ref: '#/components/responses/BadRequest' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/inventory/issue': {
    post: {
      tags: ['Inventory'],
      security: auth,
      summary:
        'Issue available stock without reducing below reserved quantities',
      parameters: idempotency,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: movementBody } },
      },
      responses: {
        '201': { description: 'Stock movement posted' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/inventory/adjustments': {
    post: {
      tags: ['Inventory'],
      security: auth,
      summary:
        'Post an immediate reasoned stock adjustment for authorized users',
      parameters: idempotency,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: movementBody } },
      },
      responses: {
        '201': { description: 'Adjustment movement posted' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
};
