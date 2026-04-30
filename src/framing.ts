import { decode, decodeFirst } from '@atcute/cbor'

interface FrameHeader {
  /**
   * operation code: 1 for message, -1 for error
   */
  op: 1 | -1

  /**
   * type discriminator for message frames (relative to NSID, e.g., "#commit")
   */
  t?: string
}

type DecodedFrame =
  | {
      type: 'message'
      body: unknown
      discriminator?: string
    }
  | {
      type: 'error'
      error: string
      message?: string
    }

interface ErrorFrameBody {
  error: string
  message?: string
}

export const decodeFrame = (buffer: Uint8Array): DecodedFrame => {
  const [header, afterHeader] = decodeFirst(buffer)

  if (!isValidHeader(header)) {
    throw new Error('invalid frame header')
  }

  const body = decode(afterHeader)

  if (header.op === 1) {
    return {
      type: 'message',
      body,
      discriminator: header.t,
    }
  } else {
    const errorBody = body as ErrorFrameBody
    return {
      type: 'error',
      error: errorBody.error,
      message: errorBody.message,
    }
  }
}

/**
 * type guard for frame header
 */
const isValidHeader = (value: unknown): value is FrameHeader => {
  if (value === null || typeof value !== 'object') {
    return false
  }

  const obj = value as Record<string, unknown>

  return (obj.op === 1 || obj.op === -1) && (obj.t === undefined || typeof obj.t === 'string')
}
