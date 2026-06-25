import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'IT Asset Management System API',
      version: '1.0.0',
      description:
        'Full REST API for managing IT assets, employees, licenses, maintenance, vendors, purchase orders, and reports.',
      contact: { name: 'ITAM Support' },
    },
    servers: [
      {
        url: 'https://it-asset-management-backend-mnpx.onrender.com',
        description: 'Production (Render)',
      },
      { url: 'http://localhost:3001', description: 'Local development' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Obtain a token via POST /api/auth/login then pass it as: Bearer <token>',
        },
      },
      schemas: {
        // ── Pagination wrapper ───────────────────────────────────────────────
        Pagination: {
          type: 'object',
          properties: {
            page:       { type: 'integer', example: 1 },
            limit:      { type: 'integer', example: 20 },
            total:      { type: 'integer', example: 100 },
            totalPages: { type: 'integer', example: 5 },
          },
        },
        Error: {
          type: 'object',
          properties: { error: { type: 'string' } },
          example: { error: 'Descriptive error message' },
        },
        // ── Auth ────────────────────────────────────────────────────────────
        RegisterRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email:    { type: 'string', format: 'email', example: 'admin@example.com' },
            password: { type: 'string', minLength: 6,   example: 'SecurePass123' },
            roleId:   { type: 'string', format: 'uuid', example: '9b07bd3e-2b01-407d-ae52-35e3b8c47e9e' },
          },
        },
        RegisterResponse: {
          type: 'object',
          properties: {
            id:        { type: 'string', format: 'uuid' },
            email:     { type: 'string', format: 'email' },
            roleId:    { type: 'string', format: 'uuid', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email:    { type: 'string', format: 'email', example: 'admin@example.com' },
            password: { type: 'string', example: 'SecurePass123' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            token: { type: 'string', example: 'eyJhbGci...' },
            user: {
              type: 'object',
              properties: {
                id:     { type: 'string', format: 'uuid' },
                email:  { type: 'string', format: 'email' },
                roleId: { type: 'string', format: 'uuid', nullable: true },
              },
            },
          },
        },
        // ── Asset ───────────────────────────────────────────────────────────
        Asset: {
          type: 'object',
          properties: {
            id:                  { type: 'string', format: 'uuid' },
            asset_id:            { type: 'string', example: 'ASSET-AB12CD34' },
            name:                { type: 'string', example: 'Dell Latitude 5520' },
            category_id:         { type: 'string', format: 'uuid', nullable: true },
            category_name:       { type: 'string', nullable: true },
            asset_type:          { type: 'string', enum: ['Laptop','Desktop','Server','Printer','Router','Switch','Mobile Device','Software License'] },
            serial_number:       { type: 'string', example: 'SN-00123456' },
            manufacturer:        { type: 'string', example: 'Dell' },
            model:               { type: 'string', example: 'Latitude 5520' },
            purchase_date:       { type: 'string', format: 'date', nullable: true },
            purchase_cost:       { type: 'number', format: 'float', nullable: true },
            warranty_expiry_date:{ type: 'string', format: 'date', nullable: true },
            status:              { type: 'string', enum: ['Available','Assigned','Under Maintenance','Lost','Retired','Disposed'] },
            barcode:             { type: 'string', nullable: true },
            qr_code:             { type: 'string', nullable: true },
            is_archived:         { type: 'boolean' },
            notes:               { type: 'string', nullable: true },
            created_at:          { type: 'string', format: 'date-time' },
            updated_at:          { type: 'string', format: 'date-time' },
          },
        },
        AssetCreateRequest: {
          type: 'object',
          required: ['name','categoryId','assetType','serialNumber','manufacturer','model','purchaseDate','purchaseCost','warrantyExpiryDate'],
          properties: {
            name:               { type: 'string', example: 'Dell Latitude 5520' },
            categoryId:         { type: 'string', format: 'uuid' },
            assetType:          { type: 'string', enum: ['Laptop','Desktop','Server','Printer','Router','Switch','Mobile Device','Software License'] },
            serialNumber:       { type: 'string', example: 'SN-00123456' },
            manufacturer:       { type: 'string', example: 'Dell' },
            model:              { type: 'string', example: 'Latitude 5520' },
            purchaseDate:       { type: 'string', format: 'date', example: '2024-01-15' },
            purchaseCost:       { type: 'number', example: 1200.00 },
            warrantyExpiryDate: { type: 'string', format: 'date', example: '2027-01-15' },
            barcode:            { type: 'string', nullable: true },
            qrCode:             { type: 'string', nullable: true },
            notes:              { type: 'string', nullable: true },
          },
        },
        // ── Employee ────────────────────────────────────────────────────────
        Employee: {
          type: 'object',
          properties: {
            id:              { type: 'string', format: 'uuid' },
            employee_number: { type: 'string', example: 'EMP-001' },
            full_name:       { type: 'string', example: 'John Doe' },
            email:           { type: 'string', format: 'email' },
            department_id:   { type: 'string', format: 'uuid', nullable: true },
            department_name: { type: 'string', nullable: true },
            job_title:       { type: 'string', nullable: true },
            is_active:       { type: 'boolean' },
            created_at:      { type: 'string', format: 'date-time' },
            updated_at:      { type: 'string', format: 'date-time' },
          },
        },
        EmployeeCreateRequest: {
          type: 'object',
          required: ['fullName','employeeNumber','email','departmentId','jobTitle'],
          properties: {
            fullName:       { type: 'string', example: 'John Doe' },
            employeeNumber: { type: 'string', example: 'EMP-001' },
            email:          { type: 'string', format: 'email', example: 'john@example.com' },
            departmentId:   { type: 'string', format: 'uuid' },
            jobTitle:       { type: 'string', example: 'Software Engineer' },
          },
        },
        // ── Department ──────────────────────────────────────────────────────
        Department: {
          type: 'object',
          properties: {
            id:         { type: 'string', format: 'uuid' },
            name:       { type: 'string', example: 'Engineering' },
            is_active:  { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        // ── Vendor ──────────────────────────────────────────────────────────
        Vendor: {
          type: 'object',
          properties: {
            id:             { type: 'string', format: 'uuid' },
            name:           { type: 'string', example: 'Acme Corp' },
            contact_person: { type: 'string', nullable: true },
            email:          { type: 'string', format: 'email', nullable: true },
            phone:          { type: 'string', nullable: true },
            address:        { type: 'string', nullable: true },
            is_active:      { type: 'boolean' },
            created_at:     { type: 'string', format: 'date-time' },
          },
        },
        // ── License ─────────────────────────────────────────────────────────
        License: {
          type: 'object',
          properties: {
            id:            { type: 'string', format: 'uuid' },
            software_name: { type: 'string', example: 'Microsoft Office 365' },
            vendor_id:     { type: 'string', format: 'uuid', nullable: true },
            vendor_name:   { type: 'string', nullable: true },
            license_key:   { type: 'string', example: 'XXXX-XXXX-XXXX-XXXX' },
            license_type:  { type: 'string', example: 'Perpetual' },
            total_seats:   { type: 'integer', example: 50 },
            used_seats:    { type: 'integer', example: 12 },
            purchase_date: { type: 'string', format: 'date', nullable: true },
            expiry_date:   { type: 'string', format: 'date', nullable: true },
            is_active:     { type: 'boolean' },
            created_at:    { type: 'string', format: 'date-time' },
          },
        },
        // ── Maintenance ─────────────────────────────────────────────────────
        MaintenanceRecord: {
          type: 'object',
          properties: {
            id:                       { type: 'string', format: 'uuid' },
            asset_id:                 { type: 'string', format: 'uuid' },
            asset_name:               { type: 'string' },
            issue_description:        { type: 'string' },
            status:                   { type: 'string', enum: ['Open','In Progress','Completed'] },
            requested_at:             { type: 'string', format: 'date-time' },
            scheduled_at:             { type: 'string', format: 'date-time', nullable: true },
            completed_at:             { type: 'string', format: 'date-time', nullable: true },
            estimated_cost:           { type: 'number', nullable: true },
            actual_cost:              { type: 'number', nullable: true },
            resolution_notes:         { type: 'string', nullable: true },
            recurrence_interval_days: { type: 'integer', nullable: true },
            created_at:               { type: 'string', format: 'date-time' },
          },
        },
        // ── Purchase Order ───────────────────────────────────────────────────
        PurchaseOrder: {
          type: 'object',
          properties: {
            id:                { type: 'string', format: 'uuid' },
            vendor_id:         { type: 'string', format: 'uuid', nullable: true },
            vendor_name:       { type: 'string', nullable: true },
            item_type:         { type: 'string', enum: ['Asset','License'] },
            item_description:  { type: 'string' },
            quantity:          { type: 'integer' },
            unit_cost:         { type: 'number' },
            total_cost:        { type: 'number' },
            order_date:        { type: 'string', format: 'date' },
            invoice_reference: { type: 'string' },
            status:            { type: 'string', enum: ['Pending','Received','Cancelled'] },
            received_at:       { type: 'string', format: 'date-time', nullable: true },
            created_at:        { type: 'string', format: 'date-time' },
          },
        },
        // ── Notification ─────────────────────────────────────────────────────
        Notification: {
          type: 'object',
          properties: {
            id:          { type: 'string', format: 'uuid' },
            user_id:     { type: 'string', format: 'uuid' },
            type:        { type: 'string' },
            title:       { type: 'string' },
            message:     { type: 'string', nullable: true },
            entity_type: { type: 'string', nullable: true },
            entity_id:   { type: 'string', format: 'uuid', nullable: true },
            is_read:     { type: 'boolean' },
            sent_at:     { type: 'string', format: 'date-time' },
          },
        },
        // ── Audit Log ────────────────────────────────────────────────────────
        AuditLog: {
          type: 'object',
          properties: {
            id:                { type: 'string', format: 'uuid' },
            entity_type:       { type: 'string' },
            entity_id:         { type: 'string', format: 'uuid', nullable: true },
            action:            { type: 'string' },
            acting_user_id:    { type: 'string', format: 'uuid', nullable: true },
            acting_user_email: { type: 'string', nullable: true },
            timestamp:         { type: 'string', format: 'date-time' },
            ip_address:        { type: 'string', nullable: true },
            changed_fields:    { type: 'object', nullable: true },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      // ═══════════════════════════════════════════════════════════════════════
      // AUTH
      // ═══════════════════════════════════════════════════════════════════════
      '/api/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Register a new user',
          security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } } } },
          responses: {
            201: { description: 'User created', content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterResponse' } } } },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            409: { description: 'Email already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login and receive a JWT',
          security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
          responses: {
            200: { description: 'Login successful', content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } } },
            400: { description: 'Validation error' },
            401: { description: 'Invalid credentials or account locked' },
          },
        },
      },
      '/api/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Logout (invalidates the current JWT)',
          responses: {
            200: { description: 'Logged out successfully' },
            401: { description: 'Not authenticated' },
          },
        },
      },
      // ═══════════════════════════════════════════════════════════════════════
      // ASSETS
      // ═══════════════════════════════════════════════════════════════════════
      '/api/assets': {
        get: {
          tags: ['Assets'],
          summary: 'List / search assets (paginated)',
          parameters: [
            { name: 'search',     in: 'query', schema: { type: 'string' }, description: 'Search by asset ID, serial number, name, or model' },
            { name: 'status',     in: 'query', schema: { type: 'string', enum: ['Available','Assigned','Under Maintenance','Lost','Retired','Disposed'] } },
            { name: 'categoryId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'assetType',  in: 'query', schema: { type: 'string', enum: ['Laptop','Desktop','Server','Printer','Router','Switch','Mobile Device','Software License'] } },
            { name: 'page',       in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit',      in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          ],
          responses: {
            200: {
              description: 'Paginated list of assets',
              content: { 'application/json': { schema: { type: 'object', properties: {
                data:       { type: 'array', items: { $ref: '#/components/schemas/Asset' } },
                pagination: { $ref: '#/components/schemas/Pagination' },
              } } } },
            },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden' },
          },
        },
        post: {
          tags: ['Assets'],
          summary: 'Create a new asset',
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AssetCreateRequest' } } } },
          responses: {
            201: { description: 'Asset created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Asset' } } } },
            400: { description: 'Validation error' },
            409: { description: 'Duplicate serial number' },
          },
        },
      },
      '/api/assets/{id}': {
        get: {
          tags: ['Assets'],
          summary: 'Get a single asset by ID',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: { description: 'Asset object', content: { 'application/json': { schema: { $ref: '#/components/schemas/Asset' } } } },
            404: { description: 'Asset not found' },
          },
        },
        put: {
          tags: ['Assets'],
          summary: 'Update an asset (partial update)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AssetCreateRequest' } } } },
          responses: {
            200: { description: 'Updated asset', content: { 'application/json': { schema: { $ref: '#/components/schemas/Asset' } } } },
            404: { description: 'Asset not found' },
          },
        },
        delete: {
          tags: ['Assets'],
          summary: 'Archive (soft-delete) an asset',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: { description: 'Asset archived' },
            400: { description: 'Asset is currently assigned' },
            404: { description: 'Asset not found' },
          },
        },
      },
      '/api/assets/{id}/status': {
        put: {
          tags: ['Assets'],
          summary: 'Transition asset status',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: {
              status: { type: 'string', enum: ['Available','Assigned','Under Maintenance','Lost','Retired','Disposed'] },
              notes:  { type: 'string' },
            } } } },
          },
          responses: {
            200: { description: 'Updated asset', content: { 'application/json': { schema: { $ref: '#/components/schemas/Asset' } } } },
            400: { description: 'Invalid transition' },
            404: { description: 'Asset not found' },
          },
        },
      },
      '/api/assets/{id}/assign': {
        post: {
          tags: ['Assets'],
          summary: 'Assign an asset to an employee',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['employeeId'], properties: {
              employeeId:   { type: 'string', format: 'uuid' },
              departmentId: { type: 'string', format: 'uuid' },
              location:     { type: 'string' },
            } } } },
          },
          responses: {
            201: { description: 'Assignment created' },
            400: { description: 'Asset not Available' },
            404: { description: 'Asset not found' },
          },
        },
      },
      '/api/assets/{id}/checkin': {
        post: {
          tags: ['Assets'],
          summary: 'Check in (return) an assigned asset',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: { description: 'Assignment closed, asset set to Available' },
            400: { description: 'No active assignment' },
            404: { description: 'Asset not found' },
          },
        },
      },
      '/api/assets/{id}/history': {
        get: {
          tags: ['Assets'],
          summary: 'Get assignment history for an asset',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: { description: 'Array of assignment records' },
            404: { description: 'Asset not found' },
          },
        },
      },
      // ═══════════════════════════════════════════════════════════════════════
      // EMPLOYEES
      // ═══════════════════════════════════════════════════════════════════════
      '/api/employees': {
        get: {
          tags: ['Employees'],
          summary: 'List / search employees (paginated)',
          parameters: [
            { name: 'search',       in: 'query', schema: { type: 'string' } },
            { name: 'departmentId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'isActive',     in: 'query', schema: { type: 'boolean' } },
            { name: 'page',         in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit',        in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            200: { description: 'Paginated employees', content: { 'application/json': { schema: { type: 'object', properties: {
              data: { type: 'array', items: { $ref: '#/components/schemas/Employee' } },
              pagination: { $ref: '#/components/schemas/Pagination' },
            } } } } },
          },
        },
        post: {
          tags: ['Employees'],
          summary: 'Create a new employee',
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/EmployeeCreateRequest' } } } },
          responses: {
            201: { description: 'Employee created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Employee' } } } },
            400: { description: 'Validation error' },
            409: { description: 'Duplicate email or employee number' },
          },
        },
      },
      '/api/employees/{id}': {
        get: {
          tags: ['Employees'],
          summary: 'Get employee with assignment history',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: { description: 'Employee with assignments array' },
            404: { description: 'Employee not found' },
          },
        },
        put: {
          tags: ['Employees'],
          summary: 'Update employee details',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: {
            fullName:       { type: 'string' },
            employeeNumber: { type: 'string' },
            email:          { type: 'string', format: 'email' },
            departmentId:   { type: 'string', format: 'uuid' },
            jobTitle:       { type: 'string' },
            isActive:       { type: 'boolean' },
          } } } } },
          responses: {
            200: { description: 'Updated employee' },
            404: { description: 'Employee not found' },
          },
        },
      },
      '/api/employees/{id}/deactivate': {
        put: {
          tags: ['Employees'],
          summary: 'Deactivate an employee (notifies admins if assets assigned)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: { description: 'Employee deactivated' },
            404: { description: 'Employee not found' },
          },
        },
      },
      // ═══════════════════════════════════════════════════════════════════════
      // DEPARTMENTS
      // ═══════════════════════════════════════════════════════════════════════
      '/api/departments': {
        get: {
          tags: ['Departments'],
          summary: 'List departments',
          parameters: [{ name: 'isActive', in: 'query', schema: { type: 'boolean' } }],
          responses: { 200: { description: 'Array of departments', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Department' } } } } } },
        },
        post: {
          tags: ['Departments'],
          summary: 'Create a department',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string', example: 'Engineering' } } } } } },
          responses: {
            201: { description: 'Department created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Department' } } } },
            409: { description: 'Department name already exists' },
          },
        },
      },
      '/api/departments/{id}': {
        put: {
          tags: ['Departments'],
          summary: 'Update a department',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, isActive: { type: 'boolean' } } } } } },
          responses: { 200: { description: 'Updated department' }, 404: { description: 'Not found' } },
        },
        delete: {
          tags: ['Departments'],
          summary: 'Soft-deactivate a department',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Department deactivated' }, 404: { description: 'Not found' } },
        },
      },
      // ═══════════════════════════════════════════════════════════════════════
      // VENDORS
      // ═══════════════════════════════════════════════════════════════════════
      '/api/vendors': {
        get: {
          tags: ['Vendors'],
          summary: 'List vendors',
          parameters: [{ name: 'isActive', in: 'query', schema: { type: 'boolean' } }],
          responses: { 200: { description: 'Array of vendors', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Vendor' } } } } } },
        },
        post: {
          tags: ['Vendors'],
          summary: 'Create a vendor',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name','contactPerson','email','phone','address'], properties: {
            name:          { type: 'string', example: 'Acme Corp' },
            contactPerson: { type: 'string', example: 'Jane Smith' },
            email:         { type: 'string', format: 'email' },
            phone:         { type: 'string', example: '+1-555-0100' },
            address:       { type: 'string' },
          } } } } },
          responses: { 201: { description: 'Vendor created' }, 400: { description: 'Validation error' } },
        },
      },
      '/api/vendors/{id}': {
        put: {
          tags: ['Vendors'],
          summary: 'Update a vendor',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: {
            name: { type: 'string' }, contactPerson: { type: 'string' }, email: { type: 'string' },
            phone: { type: 'string' }, address: { type: 'string' }, isActive: { type: 'boolean' },
          } } } } },
          responses: { 200: { description: 'Updated vendor' }, 404: { description: 'Not found' } },
        },
        delete: {
          tags: ['Vendors'],
          summary: 'Soft-deactivate a vendor',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Vendor deactivated' }, 404: { description: 'Not found' } },
        },
      },
      // ═══════════════════════════════════════════════════════════════════════
      // LICENSES
      // ═══════════════════════════════════════════════════════════════════════
      '/api/licenses': {
        get: {
          tags: ['Licenses'],
          summary: 'List software licenses (paginated)',
          parameters: [
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'page',   in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit',  in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: { 200: { description: 'Paginated licenses', content: { 'application/json': { schema: { type: 'object', properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/License' } },
            pagination: { $ref: '#/components/schemas/Pagination' },
          } } } } } },
        },
        post: {
          tags: ['Licenses'],
          summary: 'Create a software license',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['softwareName','vendorId','licenseKey','licenseType','totalSeats','purchaseDate','expiryDate'], properties: {
            softwareName: { type: 'string', example: 'Microsoft Office 365' },
            vendorId:     { type: 'string', format: 'uuid' },
            licenseKey:   { type: 'string', example: 'XXXX-XXXX-XXXX-XXXX' },
            licenseType:  { type: 'string', example: 'Subscription' },
            totalSeats:   { type: 'integer', example: 50 },
            purchaseDate: { type: 'string', format: 'date', example: '2024-01-01' },
            expiryDate:   { type: 'string', format: 'date', example: '2025-01-01' },
          } } } } },
          responses: { 201: { description: 'License created' }, 400: { description: 'Validation error' } },
        },
      },
      '/api/licenses/compliance': {
        get: {
          tags: ['Licenses'],
          summary: 'License compliance overview (all licenses with seat usage)',
          responses: { 200: { description: 'Array of license compliance records' } },
        },
      },
      '/api/licenses/{id}/install': {
        post: {
          tags: ['Licenses'],
          summary: 'Install a license on an asset',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['assetId'], properties: { assetId: { type: 'string', format: 'uuid' } } } } } },
          responses: {
            201: { description: 'License installed' },
            400: { description: 'Seat limit reached' },
            404: { description: 'License not found' },
          },
        },
      },
      '/api/licenses/{id}/install/{installId}': {
        delete: {
          tags: ['Licenses'],
          summary: 'Uninstall a license from an asset',
          parameters: [
            { name: 'id',        in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'installId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: { 200: { description: 'License uninstalled' }, 404: { description: 'Installation not found' } },
        },
      },
      // ═══════════════════════════════════════════════════════════════════════
      // MAINTENANCE
      // ═══════════════════════════════════════════════════════════════════════
      '/api/maintenance': {
        get: {
          tags: ['Maintenance'],
          summary: 'List maintenance records (paginated)',
          parameters: [
            { name: 'assetId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'status',  in: 'query', schema: { type: 'string', enum: ['Open','In Progress','Completed'] } },
            { name: 'page',    in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit',   in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: { 200: { description: 'Paginated maintenance records' } },
        },
        post: {
          tags: ['Maintenance'],
          summary: 'Create a maintenance record (sets asset to Under Maintenance)',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['assetId','issueDescription','requestedAt','estimatedCost'], properties: {
            assetId:                { type: 'string', format: 'uuid' },
            issueDescription:       { type: 'string', example: 'Screen flickering' },
            requestedAt:            { type: 'string', format: 'date-time' },
            estimatedCost:          { type: 'number', example: 150.00 },
            vendorId:               { type: 'string', format: 'uuid', nullable: true },
            vendorName:             { type: 'string', nullable: true },
            vendorContact:          { type: 'string', nullable: true },
            scheduledAt:            { type: 'string', format: 'date-time', nullable: true },
            recurrenceIntervalDays: { type: 'integer', nullable: true, example: 90 },
          } } } } },
          responses: { 201: { description: 'Maintenance record created' }, 400: { description: 'Validation error' } },
        },
      },
      '/api/maintenance/upcoming': {
        get: {
          tags: ['Maintenance'],
          summary: 'Upcoming maintenance within the next 3 days',
          responses: { 200: { description: 'Array of upcoming maintenance records' } },
        },
      },
      '/api/maintenance/{id}': {
        get: {
          tags: ['Maintenance'],
          summary: 'Get a single maintenance record',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Maintenance record' }, 404: { description: 'Not found' } },
        },
      },
      '/api/maintenance/{id}/complete': {
        put: {
          tags: ['Maintenance'],
          summary: 'Complete a maintenance record (sets asset back to Available)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', properties: {
            completedAt:     { type: 'string', format: 'date-time' },
            actualCost:      { type: 'number', example: 120.00 },
            resolutionNotes: { type: 'string', example: 'Replaced screen panel' },
          } } } } },
          responses: { 200: { description: 'Maintenance record completed' }, 404: { description: 'Not found' } },
        },
      },
      // ═══════════════════════════════════════════════════════════════════════
      // PURCHASE ORDERS
      // ═══════════════════════════════════════════════════════════════════════
      '/api/purchase-orders': {
        get: {
          tags: ['Purchase Orders'],
          summary: 'List purchase orders (paginated)',
          parameters: [
            { name: 'vendorId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'status',   in: 'query', schema: { type: 'string', enum: ['Pending','Received','Cancelled'] } },
            { name: 'page',     in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit',    in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: { 200: { description: 'Paginated purchase orders' } },
        },
        post: {
          tags: ['Purchase Orders'],
          summary: 'Create a purchase order',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['vendorId','itemType','itemDescription','quantity','unitCost','totalCost','orderDate','invoiceReference'], properties: {
            vendorId:         { type: 'string', format: 'uuid' },
            itemType:         { type: 'string', enum: ['Asset','License'] },
            itemDescription:  { type: 'string', example: '10x Dell Laptops' },
            quantity:         { type: 'integer', example: 10 },
            unitCost:         { type: 'number', example: 1200.00 },
            totalCost:        { type: 'number', example: 12000.00 },
            orderDate:        { type: 'string', format: 'date', example: '2024-06-01' },
            invoiceReference: { type: 'string', example: 'INV-2024-001' },
          } } } } },
          responses: { 201: { description: 'Purchase order created' }, 400: { description: 'Validation error' } },
        },
      },
      '/api/purchase-orders/{id}': {
        get: {
          tags: ['Purchase Orders'],
          summary: 'Get a single purchase order',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Purchase order object' }, 404: { description: 'Not found' } },
        },
      },
      '/api/purchase-orders/{id}/receive': {
        put: {
          tags: ['Purchase Orders'],
          summary: 'Mark purchase order as received',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Purchase order marked received' }, 404: { description: 'Not found' } },
        },
      },
      // ═══════════════════════════════════════════════════════════════════════
      // AUDIT LOGS
      // ═══════════════════════════════════════════════════════════════════════
      '/api/audit-logs': {
        get: {
          tags: ['Audit Logs'],
          summary: 'List audit log entries (paginated) — requires admin:manage',
          parameters: [
            { name: 'entityType',    in: 'query', schema: { type: 'string' }, example: 'asset' },
            { name: 'entityId',      in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'actingUserId',  in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'from',          in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Filter from this timestamp' },
            { name: 'to',            in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Filter up to this timestamp' },
            { name: 'page',          in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit',         in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: { 200: { description: 'Paginated audit logs', content: { 'application/json': { schema: { type: 'object', properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/AuditLog' } },
            pagination: { $ref: '#/components/schemas/Pagination' },
          } } } } } },
        },
      },
      // ═══════════════════════════════════════════════════════════════════════
      // NOTIFICATIONS
      // ═══════════════════════════════════════════════════════════════════════
      '/api/notifications': {
        get: {
          tags: ['Notifications'],
          summary: 'List notifications for the authenticated user',
          parameters: [
            { name: 'isRead', in: 'query', schema: { type: 'boolean' } },
            { name: 'page',   in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit',  in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: { 200: { description: 'Paginated notifications', content: { 'application/json': { schema: { type: 'object', properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/Notification' } },
            pagination: { $ref: '#/components/schemas/Pagination' },
          } } } } } },
        },
      },
      '/api/notifications/{id}/read': {
        put: {
          tags: ['Notifications'],
          summary: 'Mark a notification as read',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Notification marked read' }, 404: { description: 'Not found' } },
        },
      },
      // ═══════════════════════════════════════════════════════════════════════
      // REPORTS
      // ═══════════════════════════════════════════════════════════════════════
      '/api/reports/dashboard': {
        get: {
          tags: ['Reports'],
          summary: 'Dashboard summary (totals, status breakdown, warranty & license alerts)',
          responses: { 200: { description: 'Dashboard metrics object' } },
        },
      },
      '/api/reports/inventory': {
        get: {
          tags: ['Reports'],
          summary: 'Full inventory report (JSON or CSV)',
          parameters: [{ name: 'format', in: 'query', schema: { type: 'string', enum: ['json','csv'] }, description: 'csv returns a downloadable file' }],
          responses: {
            200: { description: 'Inventory data or CSV file' },
          },
        },
      },
      '/api/reports/maintenance': {
        get: {
          tags: ['Reports'],
          summary: 'Maintenance cost report with date range filter (JSON or CSV)',
          parameters: [
            { name: 'from',   in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'to',     in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'format', in: 'query', schema: { type: 'string', enum: ['json','csv'] } },
          ],
          responses: { 200: { description: 'Maintenance report' } },
        },
      },
      '/api/reports/utilization': {
        get: {
          tags: ['Reports'],
          summary: 'Asset utilization percentages over a date range',
          parameters: [
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Defaults to 30 days ago' },
            { name: 'to',   in: 'query', schema: { type: 'string', format: 'date' }, description: 'Defaults to today' },
          ],
          responses: { 200: { description: 'Array of { id, asset_id, name, utilizationPercent }' } },
        },
      },
      '/api/reports/disposal': {
        get: {
          tags: ['Reports'],
          summary: 'Disposal report — Retired and Disposed assets (JSON or CSV)',
          parameters: [{ name: 'format', in: 'query', schema: { type: 'string', enum: ['json','csv'] } }],
          responses: { 200: { description: 'Disposal report' } },
        },
      },
      '/api/reports/procurement': {
        get: {
          tags: ['Reports'],
          summary: 'Procurement report with vendor and date filters (JSON or CSV)',
          parameters: [
            { name: 'vendorId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'from',     in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'to',       in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'format',   in: 'query', schema: { type: 'string', enum: ['json','csv'] } },
          ],
          responses: { 200: { description: 'Procurement report' } },
        },
      },
      // ═══════════════════════════════════════════════════════════════════════
      // ADMIN
      // ═══════════════════════════════════════════════════════════════════════
      '/api/admin/users': {
        get: {
          tags: ['Admin'],
          summary: 'List all users with role names — requires admin:manage',
          responses: { 200: { description: 'Array of user objects' } },
        },
      },
      '/api/admin/users/{userId}/role': {
        put: {
          tags: ['Admin'],
          summary: 'Assign a role to a user',
          parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['roleId'], properties: { roleId: { type: 'string', format: 'uuid' } } } } } },
          responses: { 200: { description: 'Role assigned' }, 404: { description: 'User or role not found' } },
        },
      },
      '/api/admin/categories': {
        get: {
          tags: ['Admin'],
          summary: 'List asset categories',
          responses: { 200: { description: 'Array of categories' } },
        },
        post: {
          tags: ['Admin'],
          summary: 'Create an asset category',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: {
            name:                  { type: 'string', example: 'Laptops' },
            lowInventoryThreshold: { type: 'integer', example: 5 },
          } } } } },
          responses: { 201: { description: 'Category created' } },
        },
      },
      '/api/admin/categories/{id}': {
        put: {
          tags: ['Admin'],
          summary: 'Update an asset category',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: {
            name: { type: 'string' }, lowInventoryThreshold: { type: 'integer' }, isActive: { type: 'boolean' },
          } } } } },
          responses: { 200: { description: 'Updated category' }, 404: { description: 'Not found' } },
        },
        delete: {
          tags: ['Admin'],
          summary: 'Soft-deactivate an asset category',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Category deactivated' }, 404: { description: 'Not found' } },
        },
      },
      '/api/admin/config': {
        get: {
          tags: ['Admin'],
          summary: 'Get all system config as key→value pairs',
          responses: { 200: { description: 'Config object' } },
        },
        put: {
          tags: ['Admin'],
          summary: 'Upsert system config key→value pairs',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: true, example: { max_asset_per_employee: 3 } } } } },
          responses: { 200: { description: 'Config updated' } },
        },
      },
      '/api/admin/notification-config': {
        get: {
          tags: ['Admin'],
          summary: 'Get notification type configuration',
          responses: { 200: { description: 'Notification config object' } },
        },
        put: {
          tags: ['Admin'],
          summary: 'Upsert notification config',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
          responses: { 200: { description: 'Notification config updated' } },
        },
      },
    },
  },
  apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);
