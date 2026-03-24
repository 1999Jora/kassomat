/**
 * @kassomat/print — EscPosBuilder
 *
 * Pure ESC/POS byte builder — no external ESC/POS library dependency.
 * All byte sequences are implemented directly per the ESC/POS command reference.
 *
 * Reference: Epson ESC/POS Command Reference
 */

// ============================================================
// CONSTANTS — ESC/POS command bytes
// ============================================================

const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

// ============================================================
// EscPosBuilder
// ============================================================

/**
 * Fluent ESC/POS byte sequence builder.
 * Chain method calls, then call `.build()` to get the final Buffer.
 */
export class EscPosBuilder {
  private readonly chunks: Uint8Array[] = [];

  // ----------------------------------------------------------
  // Internal helpers
  // ----------------------------------------------------------

  private push(...bytes: number[]): this {
    this.chunks.push(new Uint8Array(bytes));
    return this;
  }

  private pushString(str: string): this {
    // Use latin-1 / cp850 compatible encoding — encode as UTF-8
    // Most modern thermal printers support UTF-8 when configured correctly.
    const encoded = new TextEncoder().encode(str);
    this.chunks.push(encoded);
    return this;
  }

  // ----------------------------------------------------------
  // ESC/POS commands
  // ----------------------------------------------------------

  /**
   * ESC @ — Initialize printer.
   * Resets the printer to default settings.
   */
  init(): this {
    return this.push(ESC, 0x40);
  }

  /**
   * GS V A — Full cut.
   * Performs a full paper cut after feeding.
   */
  cut(): this {
    return this.push(GS, 0x56, 0x41, 0x00);
  }

  /**
   * ESC d n — Feed n lines.
   * @param lines Number of lines to feed (0–255)
   */
  feed(lines: number): this {
    const n = Math.min(255, Math.max(0, lines));
    return this.push(ESC, 0x64, n);
  }

  /**
   * Print plain text followed by a line feed.
   * @param content The text to print
   */
  text(content: string): this {
    this.pushString(content);
    this.push(LF);
    return this;
  }

  /**
   * ESC E n — Bold on/off.
   * @param on true to enable bold, false to disable
   */
  bold(on: boolean): this {
    return this.push(ESC, 0x45, on ? 0x01 : 0x00);
  }

  /**
   * ESC a n — Set justification.
   * @param pos 'left' = 0, 'center' = 1, 'right' = 2
   */
  align(pos: 'left' | 'center' | 'right'): this {
    const n = pos === 'left' ? 0x00 : pos === 'center' ? 0x01 : 0x02;
    return this.push(ESC, 0x61, n);
  }

  /**
   * GS ! n — Set character size.
   * size=1: normal (GS ! 0x00)
   * size=2: double height + double width (GS ! 0x11)
   * @param size 1 for normal, 2 for double height/width
   */
  fontSize(size: 1 | 2): this {
    const n = size === 2 ? 0x11 : 0x00;
    return this.push(GS, 0x21, n);
  }

  /**
   * Print a key-value line padded to a fixed width.
   * The left string is padded with spaces so the right string is right-aligned.
   * If combined length exceeds width, a single space separates the two.
   *
   * @param left  Left-side text (e.g. item name)
   * @param right Right-side text (e.g. price)
   * @param width Total character width (default: 42)
   */
  printLine(left: string, right: string, width = 42): this {
    const gap = width - left.length - right.length;
    const spaces = gap > 0 ? ' '.repeat(gap) : ' ';
    return this.text(left + spaces + right);
  }

  /**
   * Print a divider line of '-' characters.
   * @param width Number of characters (default: 42)
   */
  divider(width = 42): this {
    return this.text('-'.repeat(width));
  }

  /**
   * GS ( k — Print QR code using the model 2 / error correction L method.
   *
   * Sequence:
   *  1. Function 165 — Set QR model (model 2)
   *  2. Function 167 — Set module size (2–6)
   *  3. Function 169 — Set error correction level (L=48, M=49, Q=50, H=51)
   *  4. Function 180 — Store QR data
   *  5. Function 181 — Print QR
   *
   * @param data  The string to encode in the QR code
   * @param size  Module size 1–8 (default: 4)
   */
  qrCode(data: string, size = 4): this {
    const clampedSize = Math.min(8, Math.max(1, size));
    const dataBytes = new TextEncoder().encode(data);
    const dataLen = dataBytes.length + 3; // pL + pH + cn + fn + data
    const pL = dataLen & 0xff;
    const pH = (dataLen >> 8) & 0xff;

    // 1. Set QR model (model 2 = 50)
    this.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);

    // 2. Set module size
    this.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, clampedSize);

    // 3. Set error correction level (L = 48)
    this.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30);

    // 4. Store data — GS ( k pL pH cn=49 fn=80 data...
    const storeHeader = [GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30];
    this.push(...storeHeader);
    this.chunks.push(dataBytes);

    // 5. Print — GS ( k 0x03 0x00 0x31 0x51 0x30
    this.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);

    return this;
  }

  /**
   * Return the accumulated ESC/POS bytes as a Buffer.
   */
  build(): Buffer {
    const totalLength = this.chunks.reduce((sum, c) => sum + c.length, 0);
    const result = Buffer.alloc(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}
