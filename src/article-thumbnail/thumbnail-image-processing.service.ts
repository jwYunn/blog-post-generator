import { Injectable, OnModuleInit } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
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

/**
 * Templates ship with the build (nest-cli copies them next to the compiled
 * service). They used to be fetched from S3 on boot, which made the app's
 * startup depend on a bucket for two files it already carried.
 */
const TEMPLATE_DIR = join(__dirname, 'templates');

/**
 * The font's own family name, which is what fontconfig will answer to. It is
 * installed into the image rather than embedded in the SVG: librsvg resolves
 * fonts only through fontconfig and ignores an @font-face that carries the font
 * inline, so the embedded copy this used to build was never once used.
 */
const FONT_FAMILY = 'Black Han Sans';

const TEMPLATES: TemplateConfig[] = [
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
  private templateBuffers: Map<string, Buffer> = new Map();

  /**
   * Read once at boot rather than per thumbnail. Failing here is deliberate: a
   * missing template is a broken build, and finding that out on the first
   * article of the day is worse than finding it out on deploy.
   */
  async onModuleInit(): Promise<void> {
    await Promise.all(
      TEMPLATES.map(async (tpl) => {
        const buffer = await readFile(join(TEMPLATE_DIR, tpl.filename));
        this.templateBuffers.set(tpl.filename, buffer);
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
        return `<text x="${zone.centerX}" y="${y}" font-family="${FONT_FAMILY}" font-size="${fontSize}" fill="white" stroke="rgba(0,0,0,0.55)" stroke-width="${Math.max(2, Math.round(fontSize * 0.05))}" paint-order="stroke" text-anchor="middle">${safeText}</text>`;
      })
      .join('\n  ');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1152" height="896">
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
