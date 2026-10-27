const auth = [{ bearerAuth: [] }];

export const catalogPaths = {
  '/categories': {
    get: {
      tags: ['Category'],
      security: auth,
      summary: 'List product categories for the active organization',
      responses: { '200': { description: 'Organization categories' } },
    },
    post: {
      tags: ['Category'],
      security: auth,
      summary: 'Create a product category',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              additionalProperties: false,
              properties: {
                name: { type: 'string', minLength: 1, maxLength: 120 },
                parentId: { type: 'string', format: 'uuid', nullable: true },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Category created' },
        '400': { $ref: '#/components/responses/BadRequest' },
      },
    },
  },
  '/categories/{id}': {
    get: {
      tags: ['Category'],
      security: auth,
      summary: 'Get a product category by ID',
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Category details' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
    patch: {
      tags: ['Category'],
      security: auth,
      summary: 'Update a product category',
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', minLength: 1, maxLength: 120 },
                parentId: { type: 'string', format: 'uuid', nullable: true },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Category updated' },
        '400': { $ref: '#/components/responses/BadRequest' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
    delete: {
      tags: ['Category'],
      security: auth,
      summary: 'Delete a product category',
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Category deleted' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/units': {
    get: {
      tags: ['Category'],
      security: auth,
      summary: 'List units of measure for the active organization',
      responses: { '200': { description: 'Organization units' } },
    },
    post: {
      tags: ['Category'],
      security: auth,
      summary: 'Create a unit of measure',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'symbol'],
              additionalProperties: false,
              properties: {
                name: { type: 'string', minLength: 1, maxLength: 80 },
                symbol: { type: 'string', minLength: 1, maxLength: 16 },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Unit created' },
        '400': { $ref: '#/components/responses/BadRequest' },
      },
    },
  },
  '/units/{id}': {
    get: {
      tags: ['Category'],
      security: auth,
      summary: 'Get a unit of measure by ID',
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Unit details' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
    patch: {
      tags: ['Category'],
      security: auth,
      summary: 'Update a unit of measure',
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', minLength: 1, maxLength: 80 },
                symbol: { type: 'string', minLength: 1, maxLength: 16 },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Unit updated' },
        '400': { $ref: '#/components/responses/BadRequest' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
    delete: {
      tags: ['Category'],
      security: auth,
      summary: 'Delete a unit of measure',
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Unit deleted' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
  },
};

export const CategoryPaths = catalogPaths;

export const counterpartySchema = {
  type: 'object',
  required: ['code', 'name'],
  additionalProperties: false,
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 40 },
    name: { type: 'string', minLength: 1, maxLength: 160 },
    email: { type: 'string', format: 'email', nullable: true },
    phone: { type: 'string', maxLength: 40, nullable: true },
    address: { type: 'string', maxLength: 500, nullable: true },
    country: { type: 'string', maxLength: 100, default: 'Rwanda' },
    taxId: { type: 'string', maxLength: 100, nullable: true },
    notes: { type: 'string', maxLength: 2000, nullable: true },
    contactName: { type: 'string', maxLength: 160, nullable: true },
    paymentTerms: { type: 'string', nullable: true },
  },
};
