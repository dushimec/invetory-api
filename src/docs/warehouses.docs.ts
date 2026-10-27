const auth = [{ bearerAuth: [] }];
const uuid = { type: 'string', format: 'uuid' };

export const warehousePaths = {
  '/warehouses': {
    get: {
      tags: ['Warehouses'],
      security: auth,
      summary: 'List active organization warehouses and their active locations',
      responses: { '200': { description: 'Warehouse list' } },
    },
    post: {
      tags: ['Warehouses'],
      security: auth,
      summary: 'Create a warehouse and its default MAIN location',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'code'],
              additionalProperties: false,
              properties: {
                name: { type: 'string', minLength: 1, maxLength: 120 },
                code: { type: 'string', minLength: 1, maxLength: 30 },
                address: { type: 'string', nullable: true, maxLength: 500 },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Warehouse created with a MAIN location' },
        '400': { $ref: '#/components/responses/BadRequest' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/warehouses/{id}/stock': {
    get: {
      tags: ['Warehouses'],
      security: auth,
      summary: 'List stock balances for a warehouse in the active organization',
      parameters: [{ in: 'path', name: 'id', required: true, schema: uuid }],
      responses: {
        '200': { description: 'Warehouse stock by product and location' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/suppliers': {
    get: {
      tags: ['Contacts'],
      security: auth,
      summary: 'List and search suppliers',
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1 } },
        {
          in: 'query',
          name: 'pageSize',
          schema: { type: 'integer', minimum: 1, maximum: 100 },
        },
        {
          in: 'query',
          name: 'search',
          schema: { type: 'string', maxLength: 100 },
        },
      ],
      responses: { '200': { description: 'Paginated suppliers' } },
    },
    post: {
      tags: ['Contacts'],
      security: auth,
      summary: 'Create a supplier in the active organization',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CounterpartyInput' },
          },
        },
      },
      responses: {
        '201': { description: 'Supplier created' },
        '400': { $ref: '#/components/responses/BadRequest' },
      },
    },
  },
  '/suppliers/{id}': {
    get: {
      tags: ['Contacts'],
      security: auth,
      summary: 'Get supplier details',
      parameters: [{ in: 'path', name: 'id', required: true, schema: uuid }],
      responses: {
        '200': { description: 'Supplier details' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
    patch: {
      tags: ['Contacts'],
      security: auth,
      summary: 'Update supplier details',
      parameters: [{ in: 'path', name: 'id', required: true, schema: uuid }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CounterpartyUpdate' },
          },
        },
      },
      responses: {
        '200': { description: 'Supplier updated' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/suppliers/{id}/purchases': {
    get: {
      tags: ['Contacts'],
      security: auth,
      summary: 'List purchase history for a supplier',
      parameters: [{ in: 'path', name: 'id', required: true, schema: uuid }],
      responses: {
        '200': { description: 'Supplier purchase history' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/customers': {
    get: {
      tags: ['Contacts'],
      security: auth,
      summary: 'List and search customers',
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1 } },
        {
          in: 'query',
          name: 'pageSize',
          schema: { type: 'integer', minimum: 1, maximum: 100 },
        },
        {
          in: 'query',
          name: 'search',
          schema: { type: 'string', maxLength: 100 },
        },
      ],
      responses: { '200': { description: 'Paginated customers' } },
    },
    post: {
      tags: ['Contacts'],
      security: auth,
      summary: 'Create a customer in the active organization',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CounterpartyInput' },
          },
        },
      },
      responses: {
        '201': { description: 'Customer created' },
        '400': { $ref: '#/components/responses/BadRequest' },
      },
    },
  },
  '/customers/{id}': {
    get: {
      tags: ['Contacts'],
      security: auth,
      summary: 'Get customer details',
      parameters: [{ in: 'path', name: 'id', required: true, schema: uuid }],
      responses: {
        '200': { description: 'Customer details' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
    patch: {
      tags: ['Contacts'],
      security: auth,
      summary: 'Update customer details',
      parameters: [{ in: 'path', name: 'id', required: true, schema: uuid }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CounterpartyUpdate' },
          },
        },
      },
      responses: {
        '200': { description: 'Customer updated' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/customers/{id}/sales': {
    get: {
      tags: ['Contacts'],
      security: auth,
      summary: 'List sales history for a customer',
      parameters: [{ in: 'path', name: 'id', required: true, schema: uuid }],
      responses: {
        '200': { description: 'Customer sales history' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
  },
};
