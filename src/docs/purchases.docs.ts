const auth = [{ bearerAuth: [] }];
const id = [
  {
    in: 'path',
    name: 'id',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  },
];

export const purchasePaths = {
  '/purchase-orders': {
    get: {
      tags: ['Purchasing'],
      security: auth,
      summary: 'List purchase orders with optional status and supplier filters',
      parameters: [
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
          name: 'status',
          schema: {
            type: 'string',
            enum: [
              'DRAFT',
              'SUBMITTED',
              'APPROVED',
              'PARTIALLY_RECEIVED',
              'FULLY_RECEIVED',
              'CANCELLED',
              'REJECTED',
              'CLOSED',
            ],
          },
        },
        {
          in: 'query',
          name: 'supplierId',
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '200': { description: 'Paginated purchase orders' },
        '403': { $ref: '#/components/responses/Forbidden' },
      },
    },
    post: {
      tags: ['Purchasing'],
      security: auth,
      summary:
        'Create a local or import purchase order; server calculates totals and import charges',
      description:
        'Import purchase and landed-cost amounts are entered in the order currency. Exchange rates are base-currency units per order-currency unit; landed charges are allocated by item purchase value and included in inventory cost when receipts are posted.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/PurchaseOrderInput' },
          },
        },
      },
      responses: {
        '201': { description: 'Draft purchase order created' },
        '400': { $ref: '#/components/responses/BadRequest' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/purchase-orders/{id}': {
    get: {
      tags: ['Purchasing'],
      security: auth,
      summary: 'Get a purchase order and its lines',
      parameters: id,
      responses: {
        '200': { description: 'Purchase order details' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/purchase-orders/{id}/submit': {
    post: {
      tags: ['Purchasing'],
      security: auth,
      summary: 'Submit a draft purchase order for approval',
      parameters: id,
      responses: {
        '200': { description: 'Purchase order submitted' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/purchase-orders/{id}/approve': {
    post: {
      tags: ['Purchasing'],
      security: auth,
      summary: 'Approve a submitted order; separation-of-duties policy applies',
      parameters: id,
      responses: {
        '200': { description: 'Purchase order approved' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/purchase-orders/{id}/reject': {
    post: {
      tags: ['Purchasing'],
      security: auth,
      summary: 'Reject a submitted purchase order',
      parameters: id,
      responses: {
        '200': { description: 'Purchase order rejected' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/purchase-orders/{id}/cancel': {
    post: {
      tags: ['Purchasing'],
      security: auth,
      summary: 'Cancel an eligible purchase order',
      parameters: id,
      responses: {
        '200': { description: 'Purchase order cancelled' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/purchase-orders/{id}/receipts': {
    post: {
      tags: ['Purchasing'],
      security: auth,
      summary: 'Create a draft goods receipt without changing inventory',
      description:
        'Receipt unitCost overrides, if provided, are entered in the purchase-order currency. Posting converts the recorded unit cost and allocated import charges to the organization base currency.',
      parameters: id,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['items'],
              additionalProperties: false,
              properties: {
                invoiceNumber: { type: 'string', maxLength: 100 },
                deliveryNote: { type: 'string', maxLength: 100 },
                items: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 500,
                  items: {
                    type: 'object',
                    required: ['purchaseOrderItemId', 'quantity'],
                    additionalProperties: false,
                    properties: {
                      purchaseOrderItemId: { type: 'string', format: 'uuid' },
                      quantity: {
                        $ref: '#/components/schemas/DecimalQuantity',
                      },
                      locationId: { type: 'string', format: 'uuid' },
                      unitCost: { $ref: '#/components/schemas/DecimalMoney' },
                      batchNumber: { type: 'string', maxLength: 100 },
                      expiryDate: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Draft goods receipt created' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/goods-receipts': {
    get: {
      tags: ['Purchasing'],
      security: auth,
      summary: 'List goods receipts',
      parameters: [
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
      ],
      responses: { '200': { description: 'Paginated goods receipts' } },
    },
  },
  '/goods-receipts/{id}': {
    get: {
      tags: ['Purchasing'],
      security: auth,
      summary: 'Get goods receipt details',
      parameters: id,
      responses: {
        '200': { description: 'Goods receipt and lines' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/goods-receipts/{id}/post': {
    post: {
      tags: ['Purchasing'],
      security: auth,
      summary:
        'Post a draft receipt atomically to inventory and the movement ledger',
      description:
        'Reposting an already-posted receipt does not post stock twice.',
      parameters: id,
      responses: {
        '200': { description: 'Goods receipt posted' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
};
