import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma, CredentialType } from '@eurocomply/database';
import { ApiError } from '../../../common/middleware/errorHandler.js';

// Validation schemas
const CreateSchemaSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  type: z.enum([
    'EMPLOYEE_ID',
    'EMPLOYMENT_VERIFICATION',
    'BACKGROUND_CHECK',
    'DIPLOMA',
    'PROFESSIONAL_LICENSE',
    'TRAINING_CERTIFICATE',
    'CUSTOM',
  ]),
  schemaJson: z.record(z.unknown()),
});

const ListQuerySchema = z.object({
  page: z.coerce.number().positive().default(1),
  pageSize: z.coerce.number().positive().max(100).default(20),
  type: z
    .enum([
      'EMPLOYEE_ID',
      'EMPLOYMENT_VERIFICATION',
      'BACKGROUND_CHECK',
      'DIPLOMA',
      'PROFESSIONAL_LICENSE',
      'TRAINING_CERTIFICATE',
      'CUSTOM',
    ])
    .optional(),
  includeSystem: z.coerce.boolean().default(true),
});

export const schemaController = {
  /**
   * List credential schemas
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = ListQuerySchema.parse(req.query);

      const where = {
        ...(query.type && { type: query.type as CredentialType }),
        ...(query.includeSystem ? {} : { isSystem: false }),
      };

      const [schemas, total] = await Promise.all([
        prisma.credentialSchema.findMany({
          where,
          orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        prisma.credentialSchema.count({ where }),
      ]);

      res.json({
        success: true,
        data: schemas,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          totalItems: total,
          totalPages: Math.ceil(total / query.pageSize),
          hasMore: query.page * query.pageSize < total,
        },
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get a single schema
   */
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const schema = await prisma.credentialSchema.findUnique({
        where: { id },
        include: {
          _count: {
            select: { credentials: true },
          },
        },
      });

      if (!schema) {
        throw ApiError.notFound('Credential schema');
      }

      res.json({
        success: true,
        data: schema,
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Create a custom credential schema
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = CreateSchemaSchema.parse(req.body);

      // Check for duplicate name
      const existing = await prisma.credentialSchema.findFirst({
        where: { name: body.name },
      });

      if (existing) {
        throw ApiError.conflict('Schema with this name already exists');
      }

      const schema = await prisma.credentialSchema.create({
        data: {
          name: body.name,
          description: body.description,
          type: body.type as CredentialType,
          schemaJson: body.schemaJson,
          isSystem: false,
        },
      });

      res.status(201).json({
        success: true,
        data: schema,
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

// Default system schemas to seed
export const DEFAULT_SCHEMAS = [
  {
    name: 'EmployeeIdCredential',
    description: 'Standard employee identification credential',
    type: 'EMPLOYEE_ID' as CredentialType,
    schemaJson: {
      type: 'object',
      properties: {
        employeeId: { type: 'string' },
        department: { type: 'string' },
        position: { type: 'string' },
        startDate: { type: 'string', format: 'date' },
      },
      required: ['employeeId'],
    },
    isSystem: true,
  },
  {
    name: 'EmploymentVerificationCredential',
    description: 'Verifies current or past employment',
    type: 'EMPLOYMENT_VERIFICATION' as CredentialType,
    schemaJson: {
      type: 'object',
      properties: {
        employerName: { type: 'string' },
        position: { type: 'string' },
        startDate: { type: 'string', format: 'date' },
        endDate: { type: 'string', format: 'date' },
        employmentType: { type: 'string', enum: ['full-time', 'part-time', 'contract'] },
      },
      required: ['employerName', 'position', 'startDate'],
    },
    isSystem: true,
  },
  {
    name: 'BackgroundCheckCredential',
    description: 'Background check verification result',
    type: 'BACKGROUND_CHECK' as CredentialType,
    schemaJson: {
      type: 'object',
      properties: {
        checkType: { type: 'string' },
        result: { type: 'string', enum: ['clear', 'review', 'flagged'] },
        checkDate: { type: 'string', format: 'date' },
        validUntil: { type: 'string', format: 'date' },
        provider: { type: 'string' },
      },
      required: ['checkType', 'result', 'checkDate'],
    },
    isSystem: true,
  },
  {
    name: 'DiplomaCredential',
    description: 'Educational diploma or degree verification',
    type: 'DIPLOMA' as CredentialType,
    schemaJson: {
      type: 'object',
      properties: {
        institutionName: { type: 'string' },
        degree: { type: 'string' },
        fieldOfStudy: { type: 'string' },
        graduationDate: { type: 'string', format: 'date' },
        grade: { type: 'string' },
      },
      required: ['institutionName', 'degree', 'graduationDate'],
    },
    isSystem: true,
  },
  {
    name: 'ProfessionalLicenseCredential',
    description: 'Professional license or certification',
    type: 'PROFESSIONAL_LICENSE' as CredentialType,
    schemaJson: {
      type: 'object',
      properties: {
        licenseName: { type: 'string' },
        licenseNumber: { type: 'string' },
        issuingAuthority: { type: 'string' },
        issueDate: { type: 'string', format: 'date' },
        expirationDate: { type: 'string', format: 'date' },
        jurisdiction: { type: 'string' },
      },
      required: ['licenseName', 'issuingAuthority', 'issueDate'],
    },
    isSystem: true,
  },
  {
    name: 'TrainingCertificateCredential',
    description: 'Training or course completion certificate',
    type: 'TRAINING_CERTIFICATE' as CredentialType,
    schemaJson: {
      type: 'object',
      properties: {
        courseName: { type: 'string' },
        provider: { type: 'string' },
        completionDate: { type: 'string', format: 'date' },
        duration: { type: 'string' },
        score: { type: 'number' },
      },
      required: ['courseName', 'provider', 'completionDate'],
    },
    isSystem: true,
  },
];
