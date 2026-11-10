const auth = [{ bearerAuth: [] }];
const id = [
  {
    in: 'path',
    name: 'id',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  },
];

export const stockCountPaths = {
  '/inventory/stock-counts': {
    get: {
      tags: ['Stock Counts'],
      security: auth,
      summary: 'List stock-count sessions',
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1 } },
        { in: 'query', name: 'pageSize', schema: { type: 'integer', minimum: 1, maximum: 100 } },
        {
          in: 'query',
          name: 'status',
          schema: { type: 'string', enum: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'POSTED'] },
        },
        { in: 'query', name: 'warehouseId', schema: { type: 'string', format: 'uuid' } },
      ],
      responses: { '200': { description: 'Paginated stock-count sessions' } },
    },
    post: {
      tags: ['Stock Counts'],
      security: auth,
      summary: 'Create a count session and capture current system quantities',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['warehouseId', 'items'],
              additionalProperties: false,
              properties: {
                warehouseId: { type: 'string', format: 'uuid' },
                reason: { type: 'string', maxLength: 1000 },
                items: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 500,
                  items: {
                    type: 'object',
                    required: ['productId'],
                    additionalProperties: false,
                    properties: {
                      productId: { type: 'string', format: 'uuid' },
                      locationId: { type: 'string', format: 'uuid' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: { '201': { description: 'Draft stock-count session' } },
    },
  },
  '/inventory/stock-counts/{id}': {
    get: {
      tags: ['Stock Counts'],
      security: auth,
      summary: 'Get stock-count lines, system quantities, and discrepancies',
      parameters: id,
      responses: { '200': { description: 'Stock-count session' } },
    },
  },
  '/inventory/stock-counts/{id}/items/{itemId}': {
    patch: {
      tags: ['Stock Counts'],
      security: auth,
      summary: 'Record a physical count quantity on a draft session',
      parameters: [
        ...id,
        { in: 'path', name: 'itemId', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['countedQuantity'],
              additionalProperties: false,
              properties: {
                countedQuantity: { type: 'string', pattern: '^\\d{1,16}(\\.\\d{1,3})?$' },
              },
            },
          },
        },
      },
      responses: { '200': { description: 'Updated stock count with discrepancy' } },
    },
  },
  '/inventory/stock-counts/{id}/submit': {
    post: {
      tags: ['Stock Counts'],
      security: auth,
      summary: 'Submit a complete physical count for review',
      parameters: id,
      responses: { '200': { description: 'Submitted stock count' } },
    },
  },
  '/inventory/stock-counts/{id}/approve': {
    post: {
      tags: ['Stock Counts'],
      security: auth,
      summary: 'Approve a submitted count, subject to separation of duties',
      parameters: id,
      responses: { '200': { description: 'Approved stock count' } },
    },
  },
  '/inventory/stock-counts/{id}/reject': {
    post: {
      tags: ['Stock Counts'],
      security: auth,
      summary: 'Reject a submitted count with a reason',
      parameters: id,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['reason'],
              additionalProperties: false,
              properties: { reason: { type: 'string', minLength: 3, maxLength: 1000 } },
            },
          },
        },
      },
      responses: { '200': { description: 'Rejected stock count' } },
    },
  },
  '/inventory/stock-counts/{id}/post': {
    post: {
      tags: ['Stock Counts'],
      security: auth,
      summary: 'Post approved count corrections atomically to stock and movement history',
      parameters: id,
      responses: { '200': { description: 'Posted stock count' } },
    },
  },
};
