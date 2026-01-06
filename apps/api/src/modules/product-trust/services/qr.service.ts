import QRCode from 'qrcode';

export interface QrOptions {
  width?: number;
  margin?: number;
  color?: {
    dark?: string;
    light?: string;
  };
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

const DEFAULT_OPTIONS: QrOptions = {
  width: 300,
  margin: 2,
  color: {
    dark: '#000000',
    light: '#ffffff',
  },
  errorCorrectionLevel: 'M',
};

export const qrService = {
  /**
   * Generate a QR code as a data URL
   */
  async generate(data: string, options?: QrOptions): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    return QRCode.toDataURL(data, {
      width: opts.width,
      margin: opts.margin,
      color: opts.color,
      errorCorrectionLevel: opts.errorCorrectionLevel,
    });
  },

  /**
   * Generate a QR code as a Buffer (PNG)
   */
  async generateBuffer(data: string, options?: QrOptions): Promise<Buffer> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    return QRCode.toBuffer(data, {
      type: 'png',
      width: opts.width,
      margin: opts.margin,
      color: opts.color,
      errorCorrectionLevel: opts.errorCorrectionLevel,
    });
  },

  /**
   * Generate a QR code as SVG string
   */
  async generateSvg(data: string, options?: QrOptions): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    return QRCode.toString(data, {
      type: 'svg',
      width: opts.width,
      margin: opts.margin,
      color: opts.color,
      errorCorrectionLevel: opts.errorCorrectionLevel,
    });
  },
};

export default qrService;
