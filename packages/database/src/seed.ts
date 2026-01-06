import { PrismaClient, CredentialType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Seed default credential schemas
  const schemas = [
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
    {
      name: 'DigitalProductPassport',
      description: 'ESPR-compliant Digital Product Passport credential',
      type: 'CUSTOM' as CredentialType,
      schemaJson: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          productName: { type: 'string' },
          manufacturerName: { type: 'string' },
          gtin: { type: 'string' },
          carbonFootprint: {
            type: 'object',
            properties: {
              value: { type: 'number' },
              unit: { type: 'string' },
            },
          },
          recyclability: {
            type: 'object',
            properties: {
              percentage: { type: 'number' },
            },
          },
        },
        required: ['productId', 'productName', 'manufacturerName'],
      },
      isSystem: true,
    },
  ];

  for (const schema of schemas) {
    await prisma.credentialSchema.upsert({
      where: { name_version: { name: schema.name, version: '1.0' } },
      update: {},
      create: {
        ...schema,
        version: '1.0',
      },
    });
    console.log(`  ✓ Created schema: ${schema.name}`);
  }

  console.log('✅ Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
