import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@eurocomply/database';
import { ApiError } from '../../../common/middleware/errorHandler.js';
import { gs1Service } from '../services/gs1.service.js';

// Validation schemas
const CreateProductSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  sku: z.string().optional(),
  gtin: z.string().optional(),
  attributes: z.record(z.unknown()).optional(),
  sustainabilityClaims: z.array(z.record(z.unknown())).optional(),
});

const UpdateProductSchema = CreateProductSchema.partial();

const ListQuerySchema = z.object({
  page: z.coerce.number().positive().default(1),
  pageSize: z.coerce.number().positive().max(100).default(20),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  search: z.string().optional(),
});

export const productController = {
  /**
   * Create a new product
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = CreateProductSchema.parse(req.body);
      const organizationId = req.auth!.organizationId;

      // Check for duplicate SKU
      if (data.sku) {
        const existing = await prisma.product.findUnique({
          where: {
            organizationId_sku: {
              organizationId,
              sku: data.sku,
            },
          },
        });
        if (existing) {
          throw ApiError.conflict('Product with this SKU already exists');
        }
      }

      // Generate GS1 Digital Link if GTIN provided
      let gs1DigitalLink: string | undefined;
      if (data.gtin) {
        gs1DigitalLink = gs1Service.generateDigitalLink(data.gtin);
      }

      const product = await prisma.product.create({
        data: {
          organizationId,
          name: data.name,
          description: data.description,
          sku: data.sku,
          gtin: data.gtin,
          gs1DigitalLink,
          attributes: (data.attributes || {}) as any,
          sustainabilityClaims: (data.sustainabilityClaims || []) as any,
          status: 'DRAFT',
        },
      });

      res.status(201).json({
        success: true,
        data: product,
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
   * List products with pagination
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = ListQuerySchema.parse(req.query);
      const organizationId = req.auth!.organizationId;

      const where = {
        organizationId,
        ...(query.status && { status: query.status }),
        ...(query.search && {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { sku: { contains: query.search, mode: 'insensitive' as const } },
            { gtin: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }),
      };

      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: {
            _count: {
              select: { passports: true, lifecycleEvents: true },
            },
          },
        }),
        prisma.product.count({ where }),
      ]);

      res.json({
        success: true,
        data: products,
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
   * Get a single product
   */
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const organizationId = req.auth!.organizationId;

      const product = await prisma.product.findFirst({
        where: { id, organizationId },
        include: {
          passports: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          lifecycleEvents: {
            orderBy: { occurredAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!product) {
        throw ApiError.notFound('Product');
      }

      res.json({
        success: true,
        data: product,
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
   * Update a product
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const data = UpdateProductSchema.parse(req.body);
      const organizationId = req.auth!.organizationId;

      // Check product exists
      const existing = await prisma.product.findFirst({
        where: { id, organizationId },
      });

      if (!existing) {
        throw ApiError.notFound('Product');
      }

      // Check for duplicate SKU if changing
      if (data.sku && data.sku !== existing.sku) {
        const duplicate = await prisma.product.findUnique({
          where: {
            organizationId_sku: {
              organizationId,
              sku: data.sku,
            },
          },
        });
        if (duplicate) {
          throw ApiError.conflict('Product with this SKU already exists');
        }
      }

      // Update GS1 Digital Link if GTIN changed
      let gs1DigitalLink = existing.gs1DigitalLink;
      if (data.gtin && data.gtin !== existing.gtin) {
        gs1DigitalLink = gs1Service.generateDigitalLink(data.gtin);
      }

      // Separate JSON fields that need casting
      const { attributes, sustainabilityClaims, ...restData } = data;
      const product = await prisma.product.update({
        where: { id },
        data: {
          ...restData,
          ...(attributes && { attributes: attributes as any }),
          ...(sustainabilityClaims && { sustainabilityClaims: sustainabilityClaims as any }),
          ...(gs1DigitalLink && { gs1DigitalLink }),
        },
      });

      res.json({
        success: true,
        data: product,
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
   * Archive a product
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const organizationId = req.auth!.organizationId;

      const existing = await prisma.product.findFirst({
        where: { id, organizationId },
      });

      if (!existing) {
        throw ApiError.notFound('Product');
      }

      // Soft delete by archiving
      await prisma.product.update({
        where: { id },
        data: { status: 'ARCHIVED' },
      });

      res.json({
        success: true,
        data: { message: 'Product archived' },
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
