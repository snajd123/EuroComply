/**
 * Email Service
 * Email verification for supplier onboarding
 */

import jwt from 'jsonwebtoken';
import { prisma } from '@eurocomply/database';

const JWT_SECRET = process.env['SUPPLIER_JWT_SECRET'] || process.env['JWT_SECRET'] || 'supplier-secret-change-me';
const EMAIL_TOKEN_EXPIRES_IN = '24h';
const DASHBOARD_URL = process.env['DASHBOARD_URL'] || 'http://localhost:3000';

interface EmailVerificationToken {
  supplierId: string;
  email: string;
  purpose: 'email_verification';
}

// ===========================================
// TOKEN GENERATION
// ===========================================

/**
 * Generate an email verification token
 */
export function generateEmailVerificationToken(supplierId: string, email: string): string {
  return jwt.sign(
    { supplierId, email, purpose: 'email_verification' } as EmailVerificationToken,
    JWT_SECRET,
    { expiresIn: EMAIL_TOKEN_EXPIRES_IN }
  );
}

/**
 * Verify an email verification token
 */
export function verifyEmailToken(token: string): EmailVerificationToken {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as EmailVerificationToken;

    if (decoded.purpose !== 'email_verification') {
      throw new Error('Invalid token purpose');
    }

    return decoded;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Verification link has expired. Please request a new one.');
    }
    throw new Error('Invalid verification token');
  }
}

// ===========================================
// EMAIL VERIFICATION
// ===========================================

/**
 * Get email verification URL
 */
export function getVerificationUrl(token: string): string {
  return `${DASHBOARD_URL}/verify-email?token=${encodeURIComponent(token)}`;
}

/**
 * Send email verification (placeholder - integrate with email provider)
 */
export async function sendVerificationEmail(supplierId: string, email: string): Promise<void> {
  const token = generateEmailVerificationToken(supplierId, email);
  const verificationUrl = getVerificationUrl(token);

  // TODO: Integrate with email provider (SendGrid, Postmark, AWS SES, etc.)
  // For now, log the verification URL
  console.log(`[Email Verification] Send to: ${email}`);
  console.log(`[Email Verification] URL: ${verificationUrl}`);

  // In production, use an email service like:
  // await sendgrid.send({
  //   to: email,
  //   from: 'noreply@eurocomply.eu',
  //   subject: 'Verify your EuroComply account',
  //   templateId: 'd-xxxxx',
  //   dynamicTemplateData: { verificationUrl },
  // });
}

/**
 * Verify email from token
 */
export async function verifyEmail(token: string): Promise<{ success: boolean; email: string }> {
  // Verify the token
  const decoded = verifyEmailToken(token);

  // Get supplier
  const supplier = await prisma.supplier.findUnique({
    where: { id: decoded.supplierId },
    select: {
      id: true,
      email: true,
      emailVerified: true
    },
  });

  if (!supplier) {
    throw new Error('Supplier not found');
  }

  // Check if email matches
  if (supplier.email.toLowerCase() !== decoded.email.toLowerCase()) {
    throw new Error('Email mismatch. This verification link is for a different email.');
  }

  // Check if already verified
  if (supplier.emailVerified) {
    return { success: true, email: supplier.email };
  }

  // Update supplier
  await prisma.supplier.update({
    where: { id: decoded.supplierId },
    data: {
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  return { success: true, email: supplier.email };
}

/**
 * Resend verification email
 */
export async function resendVerificationEmail(supplierId: string): Promise<void> {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { email: true, emailVerified: true },
  });

  if (!supplier) {
    throw new Error('Supplier not found');
  }

  if (supplier.emailVerified) {
    throw new Error('Email is already verified');
  }

  await sendVerificationEmail(supplierId, supplier.email);
}

/**
 * Check if email is verified
 */
export async function isEmailVerified(supplierId: string): Promise<boolean> {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { emailVerified: true },
  });

  return supplier?.emailVerified ?? false;
}
