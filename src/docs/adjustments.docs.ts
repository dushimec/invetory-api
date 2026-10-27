const auth = [{ bearerAuth: [] }];
const id = [
  {
    in: 'path',
    name: 'id',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  },
];

export const adjustmentPaths = {
  '/inventory/adjustment-requests': {
    get: {
      tags: ['Adjustments'],
      security: auth,
      summary: 'List staged stock adjustment requests',
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
              'POSTED',
              'CANCELLED',
              'REVERSED',
            ],
          },
        },
      ],
      responses: { '200': { description: 'Paginated adjustment requests' } },
    },
    post: {
      tags: ['Adjustments'],
      security: auth,
      summary: 'Create a draft adjustment request with signed, non-zero deltas',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['warehouseId', 'reason', 'items'],
              additionalProperties: false,
              properties: {
                warehouseId: { type: 'string', format: 'uuid' },
                reason: { type: 'string', minLength: 3, maxLength: 1000 },
                items: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 200,
                  items: {
                    type: 'object',
                    required: ['productId', 'delta'],
                    additionalProperties: false,
                    properties: {
                      productId: { type: 'string', format: 'uuid' },
                      locationId: { type: 'string', format: 'uuid' },
                      delta: {
                        type: 'string',
                        pattern: '^-?\\d{1,16}(\\.\\d{1,3})?$',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Draft adjustment request' },
        '400': { $ref: '#/components/responses/BadRequest' },
      },
    },
  },
  '/inventory/adjustment-requests/{id}': {
    get: {
      tags: ['Adjustments'],
      security: auth,
      summary: 'Get an adjustment request and lines',
      parameters: id,
      responses: {
        '200': { description: 'Adjustment details' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/inventory/adjustment-requests/{id}/submit': {
    post: {
      tags: ['Adjustments'],
      security: auth,
      summary: 'Submit a draft adjustment for approval',
      parameters: id,
      responses: {
        '200': { description: 'Adjustment submitted' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/inventory/adjustment-requests/{id}/approve': {
    post: {
      tags: ['Adjustments'],
      security: auth,
      summary:
        'Approve an adjustment; separation of duties may prohibit self-approval',
      parameters: id,
      responses: {
        '200': { description: 'Adjustment approved' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/inventory/adjustment-requests/{id}/post': {
    post: {
      tags: ['Adjustments'],
      security: auth,
      summary: 'Post an approved adjustment atomically to balances and ledger',
      parameters: id,
      responses: {
        '200': { description: 'Adjustment posted' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/inventory/adjustment-requests/{id}/cancel': {
    post: {
      tags: ['Adjustments'],
      security: auth,
      summary: 'Cancel an adjustment before posting',
      parameters: id,
      responses: {
        '200': { description: 'Adjustment cancelled' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
};
