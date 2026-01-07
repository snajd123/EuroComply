/**
 * Supplier Service
 * Business logic for supplier operations
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '@eurocomply/database';
import type {
  RegisterSupplierInput,
  LoginSupplierInput,
  UpdateSupplierProfileInput,
  CreateSupplierProductInput,
  UpdateSupplierProductInput,
  CatalogSearchInput,
  SubmitVerificationInput,
  AdminReviewVerificationInput,
} from './validators.js';

const JWT_SECRET = process.env['SUPPLIER_JWT_SECRET'] || process.env['JWT_SECRET'] || 'supplier-secret-change-me';
const JWT_EXPIRES_IN = '7d';

// ===========================================
// AUTH SERVICE
// ===========================================

export async function registerSupplier(input: RegisterSupplierInput) {
  // Check if email already exists
  const existing = await prisma.supplier.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (existing) {
    throw new Error('Email already registered');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(input.password, 12);

  // Create supplier
  const supplier = await prisma.supplier.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash,
      companyName: input.companyName,
      country: input.country.toUpperCase(),
      website: input.website,
      description: input.description,
      verificationStatus: 'PENDING',
      catalogVisibility: 'PUBLIC',
    },
    select: {
      id: true,
      email: true,
      companyName: true,
      country: true,
      verificationStatus: true,
      createdAt: true,
    },
  });

  // Generate JWT
  const token = jwt.sign(
    { supplierId: supplier.id, email: supplier.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return { supplier, token };
}

export async function loginSupplier(input: LoginSupplierInput) {
  const supplier = await prisma.supplier.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (!supplier) {
    throw new Error('Invalid email or password');
  }

  // Check if suspended
  if (supplier.verificationStatus === 'SUSPENDED') {
    throw new Error('Account suspended. Please contact support.');
  }

  // Verify password
  const validPassword = await bcrypt.compare(input.password, supplier.passwordHash);
  if (!validPassword) {
    throw new Error('Invalid email or password');
  }

  // Generate JWT
  const token = jwt.sign(
    { supplierId: supplier.id, email: supplier.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return {
    supplier: {
      id: supplier.id,
      email: supplier.email,
      companyName: supplier.companyName,
      country: supplier.country,
      verificationStatus: supplier.verificationStatus,
      catalogVisibility: supplier.catalogVisibility,
    },
    token,
  };
}

export function verifySupplierToken(token: string) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { supplierId: string; email: string };
    return decoded;
  } catch {
    throw new Error('Invalid or expired token');
  }
}

export async function getSupplierById(supplierId: string) {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: {
      id: true,
      email: true,
      companyName: true,
      companyRegistration: true,
      country: true,
      website: true,
      logoUrl: true,
      description: true,
      verificationStatus: true,
      verifiedAt: true,
      catalogVisibility: true,
      stripeConnectAccountId: true,
      payoutEnabled: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          products: true,
        },
      },
    },
  });

  if (!supplier) {
    throw new Error('Supplier not found');
  }

  return supplier;
}

export async function updateSupplierProfile(supplierId: string, input: UpdateSupplierProfileInput) {
  const supplier = await prisma.supplier.update({
    where: { id: supplierId },
    data: {
      companyName: input.companyName,
      website: input.website,
      description: input.description,
      logoUrl: input.logoUrl,
      catalogVisibility: input.catalogVisibility,
    },
    select: {
      id: true,
      email: true,
      companyName: true,
      country: true,
      website: true,
      logoUrl: true,
      description: true,
      verificationStatus: true,
      catalogVisibility: true,
    },
  });

  return supplier;
}

// ===========================================
// VERIFICATION SERVICE
// ===========================================

export async function submitVerification(supplierId: string, input: SubmitVerificationInput) {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { verificationStatus: true },
  });

  if (!supplier) {
    throw new Error('Supplier not found');
  }

  // Only allow submission if PENDING or REJECTED
  if (!['PENDING', 'REJECTED'].includes(supplier.verificationStatus)) {
    throw new Error(`Cannot submit verification when status is ${supplier.verificationStatus}`);
  }

  // Update supplier with verification docs
  const updated = await prisma.supplier.update({
    where: { id: supplierId },
    data: {
      companyRegistration: input.companyRegistration,
      verificationStatus: 'IN_REVIEW',
      verificationDocs: {
        documents: input.documents,
        notes: input.notes,
        submittedAt: new Date().toISOString(),
      },
    },
    select: {
      id: true,
      email: true,
      companyName: true,
      verificationStatus: true,
      verificationDocs: true,
    },
  });

  return updated;
}

export async function getVerificationStatus(supplierId: string) {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: {
      verificationStatus: true,
      verifiedAt: true,
      verifiedBy: true,
      verificationDocs: true,
      companyRegistration: true,
    },
  });

  if (!supplier) {
    throw new Error('Supplier not found');
  }

  return supplier;
}

export async function adminReviewVerification(
  supplierId: string,
  input: AdminReviewVerificationInput,
  adminId: string
) {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { verificationStatus: true, verificationDocs: true },
  });

  if (!supplier) {
    throw new Error('Supplier not found');
  }

  if (supplier.verificationStatus !== 'IN_REVIEW') {
    throw new Error(`Cannot review supplier with status ${supplier.verificationStatus}`);
  }

  const existingDocs = supplier.verificationDocs as any || {};

  const updated = await prisma.supplier.update({
    where: { id: supplierId },
    data: {
      verificationStatus: input.decision,
      verifiedAt: input.decision === 'VERIFIED' ? new Date() : null,
      verifiedBy: input.decision === 'VERIFIED' ? adminId : null,
      verificationDocs: {
        ...existingDocs,
        reviewedAt: new Date().toISOString(),
        reviewedBy: adminId,
        reviewNotes: input.notes,
        decision: input.decision,
      },
    },
    select: {
      id: true,
      email: true,
      companyName: true,
      verificationStatus: true,
      verifiedAt: true,
    },
  });

  return updated;
}

export async function getPendingVerifications() {
  const suppliers = await prisma.supplier.findMany({
    where: { verificationStatus: 'IN_REVIEW' },
    orderBy: { updatedAt: 'asc' },
    select: {
      id: true,
      email: true,
      companyName: true,
      country: true,
      website: true,
      companyRegistration: true,
      verificationDocs: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return suppliers;
}

// ===========================================
// PRODUCT SERVICE
// ===========================================

export async function createSupplierProduct(supplierId: string, input: CreateSupplierProductInput) {
  // Verify supplier exists and is verified (for publishing)
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { verificationStatus: true, companyName: true },
  });

  if (!supplier) {
    throw new Error('Supplier not found');
  }

  // Can create drafts without verification, but can't publish
  if (input.visibility === 'PUBLISHED' && supplier.verificationStatus !== 'VERIFIED') {
    throw new Error('Only verified suppliers can publish products. Please complete verification first.');
  }

  const product = await prisma.supplierProduct.create({
    data: {
      supplierId,
      name: input.name,
      description: input.description,
      category: input.category,
      imageUrls: input.imageUrls || [],
      dppData: input.dppData,
      visibility: input.visibility,
      publishedAt: input.visibility === 'PUBLISHED' ? new Date() : null,
    },
    include: {
      supplier: {
        select: {
          companyName: true,
          country: true,
          verificationStatus: true,
        },
      },
    },
  });

  return product;
}

export async function getSupplierProducts(supplierId: string) {
  const products = await prisma.supplierProduct.findMany({
    where: { supplierId },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: {
        select: {
          merchantLinks: true,
          usageEvents: true,
        },
      },
    },
  });

  return products;
}

export async function getSupplierProductById(supplierId: string, productId: string) {
  const product = await prisma.supplierProduct.findFirst({
    where: {
      id: productId,
      supplierId,
    },
    include: {
      supplier: {
        select: {
          companyName: true,
          country: true,
          verificationStatus: true,
          logoUrl: true,
        },
      },
      _count: {
        select: {
          merchantLinks: true,
        },
      },
    },
  });

  if (!product) {
    throw new Error('Product not found');
  }

  return product;
}

export async function updateSupplierProduct(
  supplierId: string,
  productId: string,
  input: UpdateSupplierProductInput
) {
  // Verify ownership
  const existing = await prisma.supplierProduct.findFirst({
    where: { id: productId, supplierId },
    include: {
      supplier: {
        select: { verificationStatus: true },
      },
    },
  });

  if (!existing) {
    throw new Error('Product not found');
  }

  // Check verification for publishing
  if (input.visibility === 'PUBLISHED' && existing.supplier.verificationStatus !== 'VERIFIED') {
    throw new Error('Only verified suppliers can publish products');
  }

  const product = await prisma.supplierProduct.update({
    where: { id: productId },
    data: {
      name: input.name,
      description: input.description,
      category: input.category,
      imageUrls: input.imageUrls,
      dppData: input.dppData,
      visibility: input.visibility,
      publishedAt: input.visibility === 'PUBLISHED' && !existing.publishedAt ? new Date() : existing.publishedAt,
    },
  });

  return product;
}

export async function deleteSupplierProduct(supplierId: string, productId: string) {
  // Verify ownership
  const existing = await prisma.supplierProduct.findFirst({
    where: { id: productId, supplierId },
    include: {
      _count: {
        select: { merchantLinks: true },
      },
    },
  });

  if (!existing) {
    throw new Error('Product not found');
  }

  // Don't allow deletion if merchants are using it
  if (existing._count.merchantLinks > 0) {
    throw new Error(`Cannot delete product - ${existing._count.merchantLinks} merchant(s) are using this DPP. Archive it instead.`);
  }

  await prisma.supplierProduct.delete({
    where: { id: productId },
  });

  return { success: true };
}

// ===========================================
// CATALOG SERVICE (Public)
// ===========================================

export async function searchCatalog(input: CatalogSearchInput, merchantShop?: string) {
  const { category, certification, search, supplierCountry, page, limit } = input;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {
    visibility: 'PUBLISHED',
    supplier: {
      verificationStatus: 'VERIFIED',
      OR: [
        { catalogVisibility: 'PUBLIC' },
        // Include invite-only if merchant has invitation
        ...(merchantShop ? [{
          catalogVisibility: 'INVITE_ONLY',
          invitations: {
            some: {
              merchantShop,
              status: 'ACCEPTED',
            },
          },
        }] : []),
      ],
    },
  };

  if (category) {
    where.category = category;
  }

  if (supplierCountry) {
    where.supplier = {
      ...where.supplier,
      country: supplierCountry.toUpperCase(),
    };
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { supplier: { companyName: { contains: search, mode: 'insensitive' } } },
    ];
  }

  // TODO: Filter by certification (need to query JSON dppData)

  const [products, total] = await Promise.all([
    prisma.supplierProduct.findMany({
      where,
      skip,
      take: limit,
      orderBy: [
        { timesLinked: 'desc' },
        { publishedAt: 'desc' },
      ],
      include: {
        supplier: {
          select: {
            id: true,
            companyName: true,
            country: true,
            logoUrl: true,
            verificationStatus: true,
          },
        },
      },
    }),
    prisma.supplierProduct.count({ where }),
  ]);

  // Transform for catalog display
  type ProductWithSupplier = {
    id: string;
    name: string;
    description: string | null;
    category: string;
    supplier: {
      id: string;
      companyName: string;
      country: string | null;
      logoUrl: string | null;
      verificationStatus: string;
    };
    dppData: unknown;
    vcStatus: string | null;
    timesLinked: number;
    timesForked: number;
    imageUrls: string[] | null;
  };
  const catalogProducts = (products as ProductWithSupplier[]).map((product: ProductWithSupplier) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    supplier: {
      id: product.supplier.id,
      name: product.supplier.companyName,
      country: product.supplier.country,
      verified: product.supplier.verificationStatus === 'VERIFIED',
      logoUrl: product.supplier.logoUrl,
    },
    dppSummary: extractDppSummary(product.dppData as any),
    vcAnchored: product.vcStatus === 'ANCHORED',
    timesUsed: product.timesLinked + product.timesForked,
    imageUrl: product.imageUrls?.[0],
  }));

  return {
    products: catalogProducts,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getCatalogProductById(productId: string, merchantShop?: string) {
  const product = await prisma.supplierProduct.findFirst({
    where: {
      id: productId,
      visibility: 'PUBLISHED',
      supplier: {
        verificationStatus: 'VERIFIED',
      },
    },
    include: {
      supplier: {
        select: {
          id: true,
          companyName: true,
          country: true,
          website: true,
          logoUrl: true,
          verificationStatus: true,
          description: true,
        },
      },
    },
  });

  if (!product) {
    throw new Error('Product not found in catalog');
  }

  // Check access for invite-only
  if (product.supplier.verificationStatus === 'VERIFIED') {
    const supplier = await prisma.supplier.findUnique({
      where: { id: product.supplierId },
      select: { catalogVisibility: true },
    });

    if (supplier?.catalogVisibility === 'INVITE_ONLY' && merchantShop) {
      const invitation = await prisma.supplierInvitation.findFirst({
        where: {
          supplierId: product.supplierId,
          merchantShop,
          status: 'ACCEPTED',
        },
      });

      if (!invitation) {
        throw new Error('Access denied - this product is invite-only');
      }
    }
  }

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    imageUrls: product.imageUrls,
    supplier: {
      id: product.supplier.id,
      name: product.supplier.companyName,
      country: product.supplier.country,
      website: product.supplier.website,
      verified: product.supplier.verificationStatus === 'VERIFIED',
      logoUrl: product.supplier.logoUrl,
      description: product.supplier.description,
    },
    dppData: product.dppData,
    dppSummary: extractDppSummary(product.dppData as any),
    vcAnchored: product.vcStatus === 'ANCHORED',
    vcId: product.vcId,
    timesUsed: product.timesLinked + product.timesForked,
    publishedAt: product.publishedAt,
  };
}

// ===========================================
// HELPERS
// ===========================================

function extractDppSummary(dppData: any) {
  if (!dppData) return {};

  const summary: any = {};

  // Fiber composition summary
  if (dppData.fiberComposition?.length) {
    summary.fiberComposition = dppData.fiberComposition
      .map((f: any) => `${f.percentage}% ${formatFiberType(f.fiberType)}`)
      .join(', ');
  }

  // Certifications
  if (dppData.certifications?.length) {
    summary.certifications = dppData.certifications.map((c: any) => c.type);
  }

  // Carbon footprint
  if (dppData.carbonFootprint?.value) {
    summary.carbonFootprint = dppData.carbonFootprint.value;
  }

  // Country of manufacture
  if (dppData.countryOfManufacture) {
    summary.countryOfManufacture = dppData.countryOfManufacture;
  }

  // Manufacturer
  if (dppData.manufacturer?.name) {
    summary.manufacturer = dppData.manufacturer.name;
  }

  return summary;
}

function formatFiberType(type: string): string {
  const mappings: Record<string, string> = {
    cotton: 'Cotton',
    organic_cotton: 'Organic Cotton',
    polyester: 'Polyester',
    recycled_polyester: 'Recycled Polyester',
    wool: 'Wool',
    linen: 'Linen',
    silk: 'Silk',
    elastane: 'Elastane',
    nylon: 'Nylon',
    recycled_nylon: 'Recycled Nylon',
    viscose: 'Viscose',
    lyocell: 'Lyocell',
    modal: 'Modal',
    hemp: 'Hemp',
    cashmere: 'Cashmere',
  };
  return mappings[type] || type;
}
