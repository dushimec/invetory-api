const auth = [{ bearerAuth: [] }];

export const adminPaths = {
  '/roles': {
    get: {
      tags: ['Users'],
      security: auth,
      summary: 'List available operational roles and their permissions',
      description:
        'Returns organization and shared system roles with explicit duties and permissions. Requires roles.manage.',
      responses: {
        '200': { description: 'Operational roles and permission sets' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
      },
    },
    post: {
      tags: ['Users'],
      security: auth,
      summary: 'Create a custom operational role',
      description:
        'Provide the role duties and select permissions from the available permission catalog. Built-in roles remain protected.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'duties'],
              additionalProperties: false,
              properties: {
                name: { type: 'string', minLength: 2, maxLength: 80 },
                description: { type: 'string', maxLength: 500 },
                duties: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 20,
                  items: { type: 'string', minLength: 3, maxLength: 200 },
                },
                permissions: {
                  type: 'array',
                  uniqueItems: true,
                  items: { type: 'string' },
                },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Custom role created' },
        '400': { $ref: '#/components/responses/BadRequest' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/roles/{id}': {
    patch: {
      tags: ['Users'],
      security: auth,
      summary: 'Update a custom role and its permissions',
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              minProperties: 1,
              additionalProperties: false,
              properties: {
                name: { type: 'string', minLength: 2, maxLength: 80 },
                description: { type: 'string', maxLength: 500 },
                duties: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 20,
                  items: { type: 'string', minLength: 3, maxLength: 200 },
                },
                permissions: {
                  type: 'array',
                  uniqueItems: true,
                  items: { type: 'string' },
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Custom role updated' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
    delete: {
      tags: ['Users'],
      security: auth,
      summary: 'Delete an unassigned custom role',
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '200': { description: 'Custom role deleted' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': { $ref: '#/components/responses/NotFound' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/organization/settings': {
    get: {
      tags: ['Organization'],
      security: auth,
      summary: 'Get the authenticated organization business settings',
      responses: {
        '200': {
          description: 'Business profile, currency and inventory policies',
        },
        '403': { $ref: '#/components/responses/Forbidden' },
      },
    },
    patch: {
      tags: ['Organization'],
      security: auth,
      summary: 'Update the business profile and organization policies',
      description:
        'Updates are scoped to the authenticated organization and written to the audit log.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/OrganizationSettingsUpdate' },
          },
        },
      },
      responses: {
        '200': { description: 'Organization settings updated' },
        '400': { $ref: '#/components/responses/BadRequest' },
        '403': { $ref: '#/components/responses/Forbidden' },
      },
    },
  },
  '/users': {
    get: {
      tags: ['Users'],
      security: auth,
      summary:
        'List organization memberships; never returns password or token fields',
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
          name: 'search',
          schema: { type: 'string', maxLength: 100 },
        },
        {
          in: 'query',
          name: 'status',
          schema: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'INVITED'] },
        },
      ],
      responses: {
        '200': { description: 'Paginated organization users and roles' },
        '403': { $ref: '#/components/responses/Forbidden' },
      },
    },
    post: {
      tags: ['Users'],
      security: auth,
      summary: 'Create a staff account and assign an operational role',
      description:
        'The administrator supplies a temporary password. The new user must change it before accessing organization features.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['fullName', 'email', 'temporaryPassword', 'roleId'],
              additionalProperties: false,
              properties: {
                fullName: { type: 'string', minLength: 2, maxLength: 120 },
                email: { type: 'string', format: 'email', maxLength: 254 },
                temporaryPassword: {
                  type: 'string',
                  minLength: 12,
                  maxLength: 128,
                  writeOnly: true,
                },
                roleId: { type: 'string', format: 'uuid' },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Staff account created with forced password change' },
        '400': { $ref: '#/components/responses/BadRequest' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    },
  },
  '/users/{id}': {
    patch: {
      tags: ['Users'],
      security: auth,
      summary: 'Update a user membership status or assign an organization role',
      description:
        'The path id is the user UUID. Owner memberships and owner-role assignment are protected.',
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              minProperties: 1,
              additionalProperties: false,
              properties: {
                status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED'] },
                roleId: { type: 'string', format: 'uuid' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Membership updated and change audited' },
        '400': { $ref: '#/components/responses/BadRequest' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/audit-logs': {
    get: {
      tags: ['Audit'],
      security: auth,
      summary:
        'Search immutable audit entries within the authenticated organization',
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
          name: 'actorId',
          schema: { type: 'string', format: 'uuid' },
        },
        {
          in: 'query',
          name: 'entityType',
          schema: { type: 'string', maxLength: 100 },
        },
        {
          in: 'query',
          name: 'entityId',
          schema: { type: 'string', format: 'uuid' },
        },
        {
          in: 'query',
          name: 'action',
          schema: { type: 'string', maxLength: 120 },
        },
        {
          in: 'query',
          name: 'from',
          schema: { type: 'string', format: 'date-time' },
        },
        {
          in: 'query',
          name: 'to',
          schema: { type: 'string', format: 'date-time' },
        },
      ],
      responses: {
        '200': { description: 'Paginated audit entries' },
        '400': { $ref: '#/components/responses/BadRequest' },
        '403': { $ref: '#/components/responses/Forbidden' },
      },
    },
  },
};
