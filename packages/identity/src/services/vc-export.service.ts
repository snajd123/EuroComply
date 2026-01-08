/**
 * VC Export Service
 *
 * Enables data sovereignty through portable, self-contained Verifiable Credentials.
 * Key features:
 * - Self-contained VCs with all DPP data embedded
 * - Offline verification using did:key
 * - Portable export packages with viewer
 * - Private key export for ownership transfer
 */

import { getDidKeyService } from './did-key.service.js';
import type { VerifiableCredential, CredentialSubject, JsonWebKey } from '../types.js';

export interface EmbeddedImage {
  name: string;
  data: string; // data URI (base64)
}

export interface CreateSelfContainedVCOptions {
  issuerDid: string;
  issuerKeyId: string;
  subjectId: string;
  dppData: Record<string, unknown>;
  images?: EmbeddedImage[];
  expirationDate?: Date;
}

export interface ExportPackageOptions extends CreateSelfContainedVCOptions {
  includePrivateKey?: boolean;
}

export interface ExportPackageFile {
  name: string;
  content: string;
}

export interface ExportPackage {
  files: ExportPackageFile[];
  manifest: {
    version: string;
    createdAt: string;
    issuerDid: string;
    subjectId: string;
    hasPrivateKey: boolean;
  };
}

export interface OfflineVerificationResult {
  valid: boolean;
  issuerDid?: string;
  error?: string;
}

export class VcExportService {
  private didKeyService = getDidKeyService();

  /**
   * Create a self-contained VC with all DPP data embedded
   */
  async createSelfContainedVC(options: CreateSelfContainedVCOptions): Promise<VerifiableCredential> {
    const credentialId = `urn:uuid:${crypto.randomUUID()}`;
    const issuanceDate = new Date().toISOString();

    // Build credential subject with all data embedded
    const credentialSubject: CredentialSubject = {
      id: options.subjectId,
      ...options.dppData,
    };

    // Embed images as base64 data URIs
    if (options.images && options.images.length > 0) {
      credentialSubject.images = options.images.map((img) => ({
        name: img.name,
        data: img.data,
      }));
    }

    // Create the VC structure
    const vc: VerifiableCredential = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://eurocomply.eu/contexts/dpp/v1',
      ],
      id: credentialId,
      type: ['VerifiableCredential', 'DigitalProductPassport'],
      issuer: options.issuerDid,
      issuanceDate,
      expirationDate: options.expirationDate?.toISOString(),
      credentialSubject,
    };

    // Sign the VC
    const signedVC = await this.signVC(vc, options.issuerKeyId);

    return signedVC;
  }

  /**
   * Export a portable package with VC, viewer, and optionally private key
   */
  async exportPortablePackage(options: ExportPackageOptions): Promise<ExportPackage> {
    const vc = await this.createSelfContainedVC(options);
    const files: ExportPackageFile[] = [];

    // Add the credential JSON
    files.push({
      name: 'credential.json',
      content: JSON.stringify(vc, null, 2),
    });

    // Add the offline viewer HTML
    files.push({
      name: 'viewer.html',
      content: this.generateOfflineViewer(vc),
    });

    // Add public key info
    const publicKey = await this.didKeyService.extractPublicKey(options.issuerDid);
    if (publicKey) {
      files.push({
        name: 'public-key.jwk',
        content: JSON.stringify(publicKey, null, 2),
      });
    }

    // Optionally include private key for ownership transfer
    if (options.includePrivateKey) {
      const privateKey = await this.didKeyService.exportPrivateKey(options.issuerKeyId);
      if (privateKey) {
        files.push({
          name: 'private-key.jwk',
          content: JSON.stringify(privateKey, null, 2),
        });
      }
    }

    return {
      files,
      manifest: {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        issuerDid: options.issuerDid,
        subjectId: options.subjectId,
        hasPrivateKey: options.includePrivateKey || false,
      },
    };
  }

  /**
   * Verify a VC offline using only embedded did:key
   */
  async verifyOffline(vc: VerifiableCredential): Promise<OfflineVerificationResult> {
    const issuerDid = typeof vc.issuer === 'string' ? vc.issuer : vc.issuer.id;

    // Only did:key can be verified offline
    if (!issuerDid.startsWith('did:key:')) {
      return {
        valid: false,
        error: 'Offline verification requires did:key issuer',
      };
    }

    // Check if VC has a proof
    if (!vc.proof || !vc.proof.jws) {
      return {
        valid: false,
        issuerDid,
        error: 'VC has no cryptographic proof',
      };
    }

    try {
      // Extract the signed data (VC without proof)
      const { proof, ...vcWithoutProof } = vc;
      const dataToVerify = JSON.stringify(vcWithoutProof);

      // Verify signature using did:key (no network needed!)
      const isValid = await this.didKeyService.verifySignatureOffline(
        issuerDid,
        dataToVerify,
        proof.jws
      );

      return {
        valid: isValid,
        issuerDid,
        error: isValid ? undefined : 'Invalid signature - data may have been tampered',
      };
    } catch (error) {
      return {
        valid: false,
        issuerDid,
        error: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Generate a self-contained HTML viewer for the VC
   */
  generateOfflineViewer(vc: VerifiableCredential): string {
    const subject = vc.credentialSubject;
    const issuerDid = typeof vc.issuer === 'string' ? vc.issuer : vc.issuer.id;

    // Generate a simple QR code SVG for the credential ID
    const qrCodeSvg = this.generateSimpleQRCode(vc.id || 'unknown');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Digital Product Passport - ${this.escapeHtml(String(subject.productName || 'Product'))}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #1a365d 0%, #2d3748 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 { font-size: 1.8rem; margin-bottom: 8px; }
    .header .subtitle { opacity: 0.8; font-size: 0.9rem; }
    .content { padding: 30px; }
    .product-name {
      font-size: 1.5rem;
      color: #1a365d;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #e2e8f0;
    }
    .section { margin-bottom: 25px; }
    .section-title {
      font-size: 0.85rem;
      color: #718096;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
    }
    .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
    .info-item {
      background: #f7fafc;
      padding: 15px;
      border-radius: 8px;
      border-left: 3px solid #667eea;
    }
    .info-label { font-size: 0.8rem; color: #718096; }
    .info-value { font-size: 1.1rem; color: #1a365d; font-weight: 600; margin-top: 4px; }
    .certifications { display: flex; flex-wrap: wrap; gap: 8px; }
    .cert-badge {
      background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
      color: white;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 500;
    }
    .fiber-list { list-style: none; }
    .fiber-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    .qr-section { text-align: center; padding: 20px; background: #f7fafc; }
    .qr-section svg { max-width: 150px; }
    .footer {
      padding: 20px 30px;
      background: #f7fafc;
      font-size: 0.8rem;
      color: #718096;
      text-align: center;
    }
    .verified-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #48bb78;
      color: white;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
    }
    .sustainability-score {
      font-size: 2rem;
      font-weight: bold;
      color: #48bb78;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🌿 Digital Product Passport</h1>
      <div class="subtitle">ESPR Compliant • Verifiable Credential</div>
    </div>

    <div class="content">
      <h2 class="product-name">${this.escapeHtml(String(subject.productName || 'Unknown Product'))}</h2>

      <div class="section">
        <div class="section-title">Manufacturer</div>
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Company</div>
            <div class="info-value">${this.escapeHtml(String(subject.manufacturerName || 'Unknown'))}</div>
          </div>
          ${subject.countryOfManufacture ? `
          <div class="info-item">
            <div class="info-label">Country of Manufacture</div>
            <div class="info-value">${this.escapeHtml(String(subject.countryOfManufacture))}</div>
          </div>
          ` : ''}
          ${subject.gtin ? `
          <div class="info-item">
            <div class="info-label">GTIN</div>
            <div class="info-value">${this.escapeHtml(String(subject.gtin))}</div>
          </div>
          ` : ''}
        </div>
      </div>

      ${this.renderCertifications(subject.certifications)}
      ${this.renderFiberComposition(subject.fiberComposition)}
      ${this.renderSustainabilityMetrics(subject)}

      <div class="section qr-section">
        <div class="section-title">Credential QR Code</div>
        ${qrCodeSvg}
        <div style="margin-top: 10px; font-size: 0.75rem; color: #718096;">
          Scan to verify this Digital Product Passport
        </div>
      </div>
    </div>

    <div class="footer">
      <div class="verified-badge">✓ Cryptographically Signed</div>
      <div style="margin-top: 10px;">
        Issued: ${new Date(vc.issuanceDate).toLocaleDateString()}<br>
        Issuer: ${this.escapeHtml(issuerDid.substring(0, 30))}...
      </div>
      <div style="margin-top: 10px; font-size: 0.7rem;">
        This Digital Product Passport is self-contained and can be verified offline.
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  private async signVC(vc: VerifiableCredential, keyId: string): Promise<VerifiableCredential> {
    // Create the data to sign (VC without proof)
    const dataToSign = JSON.stringify(vc);

    // Sign with did:key
    const signature = await this.didKeyService.sign(keyId, dataToSign);

    // Add proof to VC
    const issuerDid = typeof vc.issuer === 'string' ? vc.issuer : vc.issuer.id;

    return {
      ...vc,
      proof: {
        type: 'JsonWebSignature2020',
        created: new Date().toISOString(),
        verificationMethod: `${issuerDid}#key-1`,
        proofPurpose: 'assertionMethod',
        jws: signature,
      },
    };
  }

  private renderCertifications(certifications: unknown): string {
    if (!Array.isArray(certifications) || certifications.length === 0) return '';

    return `
      <div class="section">
        <div class="section-title">Certifications</div>
        <div class="certifications">
          ${certifications.map((cert) => `<span class="cert-badge">${this.escapeHtml(String(cert))}</span>`).join('')}
        </div>
      </div>
    `;
  }

  private renderFiberComposition(composition: unknown): string {
    if (!Array.isArray(composition) || composition.length === 0) return '';

    return `
      <div class="section">
        <div class="section-title">Fiber Composition</div>
        <ul class="fiber-list">
          ${composition
            .map(
              (item: { material?: string; percentage?: number }) => `
            <li class="fiber-item">
              <span>${this.escapeHtml(String(item.material || 'Unknown'))}</span>
              <span><strong>${item.percentage || 0}%</strong></span>
            </li>
          `
            )
            .join('')}
        </ul>
      </div>
    `;
  }

  private renderSustainabilityMetrics(subject: CredentialSubject): string {
    const metrics: string[] = [];

    if (subject.carbonFootprint && typeof subject.carbonFootprint === 'object') {
      const cf = subject.carbonFootprint as { value?: number; unit?: string };
      metrics.push(`
        <div class="info-item">
          <div class="info-label">Carbon Footprint</div>
          <div class="info-value">${cf.value} ${cf.unit || 'kg CO2e'}</div>
        </div>
      `);
    }

    if (subject.repairability && typeof subject.repairability === 'object') {
      const rep = subject.repairability as { score?: number; maxScore?: number };
      metrics.push(`
        <div class="info-item">
          <div class="info-label">Repairability Score</div>
          <div class="info-value">${rep.score}/${rep.maxScore || 10}</div>
        </div>
      `);
    }

    if (subject.durability && typeof subject.durability === 'object') {
      const dur = subject.durability as { expectedLifespan?: number; unit?: string };
      metrics.push(`
        <div class="info-item">
          <div class="info-label">Expected Lifespan</div>
          <div class="info-value">${dur.expectedLifespan} ${dur.unit || 'years'}</div>
        </div>
      `);
    }

    if (subject.recyclability && typeof subject.recyclability === 'object') {
      const rec = subject.recyclability as { percentage?: number };
      metrics.push(`
        <div class="info-item">
          <div class="info-label">Recyclability</div>
          <div class="info-value">${rec.percentage}%</div>
        </div>
      `);
    }

    if (metrics.length === 0) return '';

    return `
      <div class="section">
        <div class="section-title">Sustainability Metrics</div>
        <div class="info-grid">
          ${metrics.join('')}
        </div>
      </div>
    `;
  }

  private generateSimpleQRCode(data: string): string {
    // Generate a simple placeholder QR code SVG
    // In production, use a proper QR code library
    const hash = this.simpleHash(data);
    const size = 21; // QR version 1 size
    const cellSize = 6;
    const totalSize = size * cellSize;

    let cells = '';
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Create pattern based on hash
        const bit = ((hash >> ((x + y * size) % 32)) & 1) === 1;
        // Always fill corners (finder patterns)
        const isFinderPattern =
          (x < 7 && y < 7) || // Top-left
          (x >= size - 7 && y < 7) || // Top-right
          (x < 7 && y >= size - 7); // Bottom-left

        if (isFinderPattern || bit) {
          cells += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="#1a365d"/>`;
        }
      }
    }

    return `<svg width="${totalSize}" height="${totalSize}" viewBox="0 0 ${totalSize} ${totalSize}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      ${cells}
    </svg>`;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Singleton instance
let vcExportService: VcExportService | null = null;

export function getVcExportService(): VcExportService {
  if (!vcExportService) {
    vcExportService = new VcExportService();
  }
  return vcExportService;
}

export function resetVcExportService(): void {
  vcExportService = null;
}
