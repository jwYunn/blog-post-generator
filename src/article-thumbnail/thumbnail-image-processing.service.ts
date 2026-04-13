import { Injectable, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import * as sharp from 'sharp';

interface TextZone {
  centerX: number;
  startY: number;
  endY: number;
  maxWidth: number;
}

interface TemplateConfig {
  filename: string;
  textZone: TextZone;
}

const S3_BASE =
  'https://blog-assets-441964862929-ap-northeast-2-an.s3.ap-northeast-2.amazonaws.com/templates';

const FONT_URL =
  'https://fonts.gstatic.com/s/blackhansans/v17/ea8Aad44WunzF9a-dL6toA8r8nqVIXSkH-Hc.ttf';

const TEMPLATES: TemplateConfig[] = [
  {
    filename: 'blog_template_2.webp',
    textZone: { centerX: 576, startY: 108, endY: 410, maxWidth: 852 },
  },
  {
    filename: 'blog_template_3.webp',
    textZone: { centerX: 576, startY: 94, endY: 490, maxWidth: 896 },
  },
  {
    filename: 'blog_template_4.webp',
    textZone: { centerX: 576, startY: 108, endY: 478, maxWidth: 852 },
  },
];

@Injectable()
export class ThumbnailImageProcessingService implements OnModuleInit {
  private fontBase64: string;
  private templateBuffers: Map<string, Buffer> = new Map();

  async onModuleInit(): Promise<void> {
    // Download font and encode to base64 (runs once on module init)
    const fontRes = await axios.get<ArrayBuffer>(FONT_URL, {
      responseType: 'arraybuffer',
    });
    this.fontBase64 = Buffer.from(fontRes.data).toString('base64');

    // Download template images and cache in memory (runs once on module init)
    await Promise.all(
      TEMPLATES.map(async (tpl) => {
        const res = await axios.get<ArrayBuffer>(
          `${S3_BASE}/${tpl.filename}`,
          { responseType: 'arraybuffer' },
        );
        this.templateBuffers.set(tpl.filename, Buffer.from(res.data));
      }),
    );
  }

  async processThumbnailWithText(title: string): Promise<Buffer> {
    // Pick a random template
    const tpl = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
    const templateBuffer = this.templateBuffers.get(tpl.filename)!;

    // Calculate text line layout
    const { lines, fontSize } = this.calculateTextLayout(title, tpl.textZone);

    // Build SVG overlay
    const svgBuffer = this.buildSvgOverlay(lines, fontSize, tpl.textZone);

    // Step 1: composite SVG text onto template (keep original 1152x896 size)
    const composited = await sharp(templateBuffer)
      .composite([{ input: svgBuffer, blend: 'over' }])
      .toBuffer();

    // Step 2: resize to 400x300 and convert to webp
    const outputBuffer = await sharp(composited)
      .resize(400, 300, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();

    return outputBuffer;
  }

  // ─── Text wrap calculation ────────────────────────────────────────────

  private calculateTextLayout(
    text: string,
    zone: TextZone,
  ): { lines: string[]; fontSize: number } {
    const fontSizes = [68, 58, 48, 40];

    for (const fontSize of fontSizes) {
      const lines = this.wrapText(text, zone.maxWidth - 80, fontSize);
      const lineHeight = fontSize * 1.5;
      const totalHeight = lines.length * lineHeight;
      const zoneHeight = zone.endY - zone.startY;

      if (lines.length <= 4 && totalHeight <= zoneHeight) {
        return { lines, fontSize };
      }
    }

    // Fallback: force-truncate to 4 lines at minimum font size
    const fallback = this.wrapText(text, zone.maxWidth - 80, 40);
    return { lines: fallback.slice(0, 4), fontSize: 40 };
  }

  private wrapText(text: string, maxWidth: number, fontSize: number): string[] {
    const lines: string[] = [];
    let currentLine = '';
    let currentWidth = 0;

    const tokens = this.tokenize(text);

    for (const token of tokens) {
      const tokenWidth = this.estimateWidth(token, fontSize);

      if (currentWidth + tokenWidth > maxWidth && currentLine.length > 0) {
        lines.push(currentLine.trimEnd());
        currentLine = token === ' ' ? '' : token;
        currentWidth = token === ' ' ? 0 : tokenWidth;
      } else {
        currentLine += token;
        currentWidth += tokenWidth;
      }
    }

    if (currentLine.trim().length > 0) {
      lines.push(currentLine.trimEnd());
    }

    return lines;
  }

  // Tokenize preserving spaces: English by word, Korean by eojeol (space-delimited chunk)
  private tokenize(text: string): string[] {
    const tokens: string[] = [];
    let current = '';

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const isSpace = ch === ' ';

      if (isSpace) {
        if (current.length > 0) {
          tokens.push(current);
          current = '';
        }
        tokens.push(' ');
      } else {
        current += ch;
      }
    }

    if (current.length > 0) tokens.push(current);
    return tokens;
  }

  // Width estimate: Korean char ≈ fontSize * 1.0, English char ≈ fontSize * 0.65, space ≈ fontSize * 0.35
  private estimateWidth(token: string, fontSize: number): number {
    let width = 0;
    for (const ch of token) {
      if (/[\uAC00-\uD7A3\u3131-\u318E]/.test(ch)) {
        width += fontSize * 1.0;
      } else if (ch === ' ') {
        width += fontSize * 0.35;
      } else {
        width += fontSize * 0.65;
      }
    }
    return width;
  }

  // ─── SVG overlay builder ──────────────────────────────────────────────

  private buildSvgOverlay(
    lines: string[],
    fontSize: number,
    zone: TextZone,
  ): Buffer {
    const lineHeight = fontSize * 1.55;
    const totalHeight = lines.length * lineHeight;
    const zoneCenterY = (zone.startY + zone.endY) / 2;
    const blockStartY = zoneCenterY - totalHeight / 2 + fontSize;

    const textElements = lines
      .map((line, i) => {
        const y = Math.round(blockStartY + i * lineHeight);
        const safeText = this.escapeSvgText(line);
        return `<text x="${zone.centerX}" y="${y}" font-family="BlackHanSans" font-size="${fontSize}" fill="white" stroke="rgba(0,0,0,0.55)" stroke-width="${Math.max(2, Math.round(fontSize * 0.05))}" paint-order="stroke" text-anchor="middle">${safeText}</text>`;
      })
      .join('\n  ');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1152" height="896">
  <defs>
    <style>
      @font-face {
        font-family: 'BlackHanSans';
        src: url('data:font/truetype;base64,${this.fontBase64}') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
    </style>
  </defs>
  ${textElements}
</svg>`;

    return Buffer.from(svg);
  }

  private escapeSvgText(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
