import { Buffer } from 'buffer';

const globalObj = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
if (!globalObj.Buffer) {
  globalObj.Buffer = Buffer;
}

