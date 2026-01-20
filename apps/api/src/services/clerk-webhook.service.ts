/**
 * Clerk Webhook Service
 *
 * Handles Clerk webhook events to sync users between Clerk and our database.
 * This is the industry standard approach for Clerk integration.
 */

import { prisma } from '@eurocomply/db';
import { Webhook } from 'svix';
import { loggers } from '../lib/logger.js';

const log = loggers.webhook;

// Clerk webhook event types
interface ClerkUserData {
  id: string;
  email_addresses: Array<{
    email_address: string;
    id: string;
  }>;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
  created_at: number;
  updated_at: number;
}

interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserData;
  object: 'event';
}

/**
 * Verify Clerk webhook signature using svix
 */
export function verifyWebhookSignature(
  payload: string,
  headers: {
    'svix-id': string;
    'svix-timestamp': string;
    'svix-signature': string;
  },
  webhookSecret: string
): ClerkWebhookEvent {
  const wh = new Webhook(webhookSecret);

  // This will throw if verification fails
  const event = wh.verify(payload, {
    'svix-id': headers['svix-id'],
    'svix-timestamp': headers['svix-timestamp'],
    'svix-signature': headers['svix-signature'],
  }) as ClerkWebhookEvent;

  return event;
}

/**
 * Handle user.created event - create user in database
 */
export async function handleUserCreated(userData: ClerkUserData): Promise<void> {
  const primaryEmail = userData.email_addresses[0]?.email_address;

  if (!primaryEmail) {
    log.warn({ userId: userData.id }, 'user.created: No email found');
    return;
  }

  const name = [userData.first_name, userData.last_name]
    .filter(Boolean)
    .join(' ') || null;

  // Check if user already exists (idempotency)
  const existingUser = await prisma.user.findUnique({
    where: { clerkId: userData.id },
  });

  if (existingUser) {
    log.debug({ userId: userData.id }, 'user.created: User already exists, skipping');
    return;
  }

  // Also check by email to prevent duplicates
  const existingByEmail = await prisma.user.findUnique({
    where: { email: primaryEmail },
  });

  if (existingByEmail) {
    // Update the existing user with the new Clerk ID
    log.info({ email: primaryEmail }, 'user.created: User with email exists, updating clerkId');
    await prisma.user.update({
      where: { email: primaryEmail },
      data: {
        clerkId: userData.id,
        name: name || existingByEmail.name,
        avatarUrl: userData.image_url,
      },
    });
    return;
  }

  // Create new user
  await prisma.user.create({
    data: {
      clerkId: userData.id,
      email: primaryEmail,
      name,
      avatarUrl: userData.image_url,
    },
  });

  log.info({ userId: userData.id, email: primaryEmail }, 'user.created: Created user');
}

/**
 * Handle user.updated event - update user in database
 */
export async function handleUserUpdated(userData: ClerkUserData): Promise<void> {
  const primaryEmail = userData.email_addresses[0]?.email_address;

  if (!primaryEmail) {
    log.warn({ userId: userData.id }, 'user.updated: No email found');
    return;
  }

  const name = [userData.first_name, userData.last_name]
    .filter(Boolean)
    .join(' ') || null;

  // Find and update user
  const existingUser = await prisma.user.findUnique({
    where: { clerkId: userData.id },
  });

  if (!existingUser) {
    // User doesn't exist yet, create them
    log.info({ userId: userData.id }, 'user.updated: User not found, creating');
    await handleUserCreated(userData);
    return;
  }

  await prisma.user.update({
    where: { clerkId: userData.id },
    data: {
      email: primaryEmail,
      name,
      avatarUrl: userData.image_url,
    },
  });

  log.info({ userId: userData.id }, 'user.updated: Updated user');
}

/**
 * Handle user.deleted event - handle user deletion
 *
 * Note: We don't hard delete users due to data integrity (foreign keys).
 * Instead, we could soft delete or anonymize. For now, we just log.
 */
export async function handleUserDeleted(userData: ClerkUserData): Promise<void> {
  const existingUser = await prisma.user.findUnique({
    where: { clerkId: userData.id },
  });

  if (!existingUser) {
    log.debug({ userId: userData.id }, 'user.deleted: User not found, nothing to delete');
    return;
  }

  // For now, just log. In production, you might want to:
  // - Soft delete (add deletedAt timestamp)
  // - Anonymize personal data (GDPR compliance)
  // - Remove from organizations
  log.info({ userId: userData.id }, 'user.deleted: User deleted in Clerk (no action taken in DB)');

  // Future: Implement soft delete
  // await prisma.user.update({
  //   where: { clerkId: userData.id },
  //   data: { deletedAt: new Date() },
  // });
}

/**
 * Process a verified Clerk webhook event
 */
export async function processWebhookEvent(event: ClerkWebhookEvent): Promise<void> {
  log.info({ eventType: event.type }, 'Processing webhook event');

  switch (event.type) {
    case 'user.created':
      await handleUserCreated(event.data);
      break;

    case 'user.updated':
      await handleUserUpdated(event.data);
      break;

    case 'user.deleted':
      await handleUserDeleted(event.data);
      break;

    default:
      log.debug({ eventType: event.type }, 'Unhandled event type');
  }
}
