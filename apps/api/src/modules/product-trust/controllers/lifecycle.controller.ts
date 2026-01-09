import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '@eurocomply/database';
import { ApiError } from '../../../common/middleware/errorHandler.js';

// Define LifecycleEventType locally (matches Prisma enum)
type LifecycleEventType =
  | 'MANUFACTURED'
  | 'SHIPPED'
  | 'RECEIVED'
  | 'SOLD'
  | 'RETURNED'
  | 'RECYCLED'
  | 'DESTROYED'
  | 'DONATED'
  | 'REPAIRED'
  | 'REFURBISHED';

// Validation schemas
const CreateLifecycleEventSchema = z.object({
  eventType: z.enum([
    'MANUFACTURED',
    'SHIPPED',
    'RECEIVED',
    'SOLD',
    'RETURNED',
    'RECYCLED',
    'DESTROYED',
    'DONATED',
    'REPAIRED',
    'REFURBISHED',
  ]),
  description: z.string().optional(),
  data: z.record(z.unknown()).optional(),
  quantity: z.number().positive().optional(),
  reason: z.string().optional(), // For destruction events
  occurredAt: z.string().datetime().optional(),
});

const ListQuerySchema = z.object({
  page: z.coerce.number().positive().default(1),
  pageSize: z.coerce.number().positive().max(100).default(20),
  eventType: z
    .enum([
      'MANUFACTURED',
      'SHIPPED',
      'RECEIVED',
      'SOLD',
      'RETURNED',
      'RECYCLED',
      'DESTROYED',
      'DONATED',
      'REPAIRED',
      'REFURBISHED',
    ])
    .optional(),
});

const ReportQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const lifecycleController = {
  /**
   * Create a lifecycle event
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { productId } = req.params;
      const body = CreateLifecycleEventSchema.parse(req.body);
      const organizationId = req.auth!.organizationId;

      // Verify product belongs to organization
      const product = await prisma.product.findFirst({
        where: { id: productId, organizationId },
      });

      if (!product) {
        throw ApiError.notFound('Product');
      }

      // Create lifecycle event
      const event = await prisma.lifecycleEvent.create({
        data: {
          productId,
          eventType: body.eventType as LifecycleEventType,
          description: body.description,
          data: (body.data || {}) as any,
          quantity: body.quantity,
          reason: body.reason,
          occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
        },
      });

      res.status(201).json({
        success: true,
        data: event,
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
   * List lifecycle events for a product
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { productId } = req.params;
      const query = ListQuerySchema.parse(req.query);
      const organizationId = req.auth!.organizationId;

      // Verify product belongs to organization
      const product = await prisma.product.findFirst({
        where: { id: productId, organizationId },
      });

      if (!product) {
        throw ApiError.notFound('Product');
      }

      const where = {
        productId,
        ...(query.eventType && { eventType: query.eventType as LifecycleEventType }),
      };

      const [events, total] = await Promise.all([
        prisma.lifecycleEvent.findMany({
          where,
          orderBy: { occurredAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        prisma.lifecycleEvent.count({ where }),
      ]);

      res.json({
        success: true,
        data: events,
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
   * Generate ESPR unsold goods report
   * Required by ESPR Article 20 for tracking product destruction
   */
  async unsoldGoodsReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = ReportQuerySchema.parse(req.query);
      const organizationId = req.auth!.organizationId;

      const startDate = query.startDate
        ? new Date(query.startDate)
        : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // Default: last year
      const endDate = query.endDate ? new Date(query.endDate) : new Date();

      // Get all destruction and donation events
      const events = await prisma.lifecycleEvent.findMany({
        where: {
          product: { organizationId },
          eventType: { in: ['DESTROYED', 'DONATED', 'RECYCLED'] },
          occurredAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              gtin: true,
            },
          },
        },
        orderBy: { occurredAt: 'desc' },
      });

      // Aggregate statistics
      const stats = {
        totalEvents: events.length,
        destroyed: events.filter((e) => e.eventType === 'DESTROYED').length,
        donated: events.filter((e) => e.eventType === 'DONATED').length,
        recycled: events.filter((e) => e.eventType === 'RECYCLED').length,
        totalQuantity: events.reduce((sum, e) => sum + (e.quantity || 1), 0),
        destroyedQuantity: events
          .filter((e) => e.eventType === 'DESTROYED')
          .reduce((sum, e) => sum + (e.quantity || 1), 0),
      };

      // Group by reason (for destruction events)
      const byReason = events
        .filter((e) => e.eventType === 'DESTROYED' && e.reason)
        .reduce(
          (acc, e) => {
            const reason = e.reason || 'Unknown';
            acc[reason] = (acc[reason] || 0) + (e.quantity || 1);
            return acc;
          },
          {} as Record<string, number>
        );

      res.json({
        success: true,
        data: {
          reportPeriod: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          },
          statistics: stats,
          byReason,
          events: events.map((e) => ({
            id: e.id,
            eventType: e.eventType,
            product: e.product,
            quantity: e.quantity,
            reason: e.reason,
            occurredAt: e.occurredAt,
          })),
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
   * Generate sustainability metrics report
   */
  async sustainabilityReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = ReportQuerySchema.parse(req.query);
      const organizationId = req.auth!.organizationId;

      const startDate = query.startDate
        ? new Date(query.startDate)
        : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const endDate = query.endDate ? new Date(query.endDate) : new Date();

      // Get all products with sustainability claims
      const products = await prisma.product.findMany({
        where: {
          organizationId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          id: true,
          name: true,
          sustainabilityClaims: true,
          attributes: true,
        },
      });

      // Get lifecycle events for circular economy metrics
      const events = await prisma.lifecycleEvent.findMany({
        where: {
          product: { organizationId },
          occurredAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      // Calculate metrics
      const metrics = {
        totalProducts: products.length,
        withSustainabilityClaims: products.filter(
          (p) =>
            Array.isArray(p.sustainabilityClaims) &&
            (p.sustainabilityClaims as unknown[]).length > 0
        ).length,
        circularityRate: calculateCircularityRate(events),
        eventBreakdown: events.reduce(
          (acc, e) => {
            acc[e.eventType] = (acc[e.eventType] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        ),
      };

      res.json({
        success: true,
        data: {
          reportPeriod: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          },
          metrics,
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
};

/**
 * Calculate circularity rate based on lifecycle events
 * (recycled + refurbished + repaired) / (destroyed + recycled + refurbished + repaired + donated)
 */
function calculateCircularityRate(
  events: { eventType: LifecycleEventType; quantity: number | null }[]
): number {
  const circular = ['RECYCLED', 'REFURBISHED', 'REPAIRED'];
  const endOfLife = ['DESTROYED', 'RECYCLED', 'REFURBISHED', 'REPAIRED', 'DONATED'];

  const circularCount = events
    .filter((e) => circular.includes(e.eventType))
    .reduce((sum, e) => sum + (e.quantity || 1), 0);

  const endOfLifeCount = events
    .filter((e) => endOfLife.includes(e.eventType))
    .reduce((sum, e) => sum + (e.quantity || 1), 0);

  if (endOfLifeCount === 0) return 0;

  return Math.round((circularCount / endOfLifeCount) * 100) / 100;
}
