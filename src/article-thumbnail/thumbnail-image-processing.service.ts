import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
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

const FONT_PATH = path.join(__dirname, 'fonts', 'BlackHanSans-Regular.ttf');

const TEMPLATES_DIR = path.join(__dirname, 'templates');

@Injectable()
export class ThumbnailImageProcessingService implements OnModuleInit {
  private fontBase64: string;
  private templateBuffers: Map<string, Buffer> = new Map();

  async onModuleInit(): Promise<void> {
    // 폰트 base64 인코딩 (1회)
    const fontBuffer = await fs.readFile(FONT_PATH);
    this.fontBase64 = fontBuffer.toString('base64');

    // 템플릿 이미지 메모리 캐시 (1회)
    for (const tpl of TEMPLATES) {
      const buf = await fs.readFile(path.join(TEMPLATES_DIR, tpl.filename));
      this.templateBuffers.set(tpl.filename, buf);
    }
  }

  async processThumbnailWithText(title: string): Promise<Buffer> {
    // 랜덤 템플릿 선택
    const tpl = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
    const templateBuffer = this.templateBuffers.get(tpl.filename)!;

    // 텍스트 줄 계산
    const { lines, fontSize } = this.calculateTextLayout(title, tpl.textZone);

    // SVG 생성
    const svgBuffer = this.buildSvgOverlay(lines, fontSize, tpl.textZone);

    // sharp 합성 → webp
    const outputBuffer = await sharp(templateBuffer)
      .composite([{ input: svgBuffer, blend: 'over' }])
      .webp({ quality: 85 })
      .toBuffer();

    return outputBuffer;
  }

  // ─── 텍스트 줄바꿈 계산 ───────────────────────────────────────────────

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

    // 최소 폰트로도 안 맞으면 강제로 잘라서 반환
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

  // 공백 포함 토큰화: 영문은 단어 단위, 한글은 어절 단위
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

  // 폭 추정: 한글 1자 ≈ fontSize * 1.0, 영문 1자 ≈ fontSize * 0.65, 공백 ≈ fontSize * 0.35
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

  // ─── SVG 오버레이 생성 ────────────────────────────────────────────────

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
