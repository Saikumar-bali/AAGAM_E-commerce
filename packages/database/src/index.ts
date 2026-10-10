import { Prisma, PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '../../../.env') })

type RawQuery = <T = any>(query: string, ...values: any[]) => Prisma.PrismaPromise<T>
type AagamTransactionClient = Omit<Prisma.TransactionClient, '$queryRawUnsafe'> & {
  $queryRawUnsafe: RawQuery
}
type UnwrapPrismaTuple<T extends readonly unknown[]> = {
  [K in keyof T]: T[K] extends Prisma.PrismaPromise<infer U> ? U : never
}
type AagamPrismaClient = Omit<PrismaClient, '$queryRawUnsafe' | '$transaction'> & {
  $queryRawUnsafe: RawQuery
  $transaction<R>(
    fn: (client: AagamTransactionClient) => Promise<R>,
    options?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    },
  ): Promise<R>
  $transaction<P extends readonly Prisma.PrismaPromise<any>[]>(
    operations: [...P],
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<UnwrapPrismaTuple<P>>
}

type TransactionOptions = {
  maxWait?: number
  timeout?: number
  isolationLevel?: Prisma.TransactionIsolationLevel
}

const prismaClient = new PrismaClient()
const baseTransaction = prismaClient.$transaction.bind(prismaClient) as unknown as (
  input: unknown,
  options?: TransactionOptions,
) => Promise<unknown>

const POSTGRES_RETRYABLE_TRANSACTION_STATES = ['40001', '40P01', '25P02'] as const

function containsRetryablePostgresState(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const candidate = error as {
    code?: unknown
    message?: unknown
    meta?: Record<string, unknown>
  }
  const values = [
    candidate.code,
    candidate.message,
    candidate.meta?.code,
    candidate.meta?.message,
    candidate.meta?.database_error,
    candidate.meta?.databaseError,
  ]

  return values.some((value) => {
    const text = String(value || '')
    return POSTGRES_RETRYABLE_TRANSACTION_STATES.some((state) => text.includes(state))
  })
}

// Interactive transactions default to a 5s budget in Prisma. Against the remote
// Supabase pooler a single round-trip is often tens of ms, so any action that
// fans out into several sequential queries (skip/pause/cancel teardown,
// dispatch, quick-actions, packing) blows the budget and surfaces as an opaque
// `Transaction already closed` / `Transaction not found` HTTP 500. Give every
// interactive transaction a workable default; callers can still override.
const DEFAULT_INTERACTIVE_MAX_WAIT = 15000
const DEFAULT_INTERACTIVE_TIMEOUT = 30000

const withInteractiveDefaults = (
  input: unknown,
  options?: TransactionOptions,
): TransactionOptions | undefined => {
  if (typeof input !== 'function') return options
  return {
    ...options,
    maxWait: options?.maxWait ?? DEFAULT_INTERACTIVE_MAX_WAIT,
    timeout: options?.timeout ?? DEFAULT_INTERACTIVE_TIMEOUT,
  }
}

const transactionWithSerializableRetry = async (
  input: unknown,
  options?: TransactionOptions,
) => {
  const isInteractive = typeof input === 'function'
  const isSerializable = String(options?.isolationLevel || '').toLowerCase() === 'serializable'
  const resolvedOptions = withInteractiveDefaults(input, options)

  if (!isInteractive || !isSerializable) {
    return baseTransaction(input, resolvedOptions)
  }

  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await baseTransaction(input, resolvedOptions)
    } catch (error: any) {
      // Prisma normally reports Serializable conflicts as P2034. Raw PostgreSQL
      // errors can surface as SQLSTATE 40001 (serialization), 40P01 (deadlock),
      // or 25P02 after the transaction has already been aborted. Retrying here
      // creates a fresh transaction; retries stay bounded so deterministic
      // application errors still fail instead of looping indefinitely.
      const retryable = error?.code === 'P2034' || containsRetryablePostgresState(error)
      if (!retryable || attempt === maxAttempts) throw error
      await new Promise((resolve) => setTimeout(resolve, attempt * 25))
    }
  }

  throw new Error('Serializable transaction retry loop exited unexpectedly')
}

Object.defineProperty(prismaClient, '$transaction', {
  value: transactionWithSerializableRetry,
  configurable: false,
  enumerable: false,
  writable: false,
})

export const prisma = prismaClient as AagamPrismaClient

export const OrderStatus = {
  PENDING: 'PENDING',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  CONFIRMED: 'CONFIRMED',
  PICKING: 'PICKING',
  PACKED: 'PACKED',
  STORE_DELIVERING: 'STORE_DELIVERING',
  STORE_DELIVERED: 'STORE_DELIVERED',
  RIDER_ASSIGNED: 'RIDER_ASSIGNED',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus]

export const PaymentMethod = {
  ONLINE: 'ONLINE',
  COD: 'COD',
  SUBSCRIPTION_CASH_CREDIT: 'SUBSCRIPTION_CASH_CREDIT',
} as const

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod]

export const PaymentStatus = {
  CREATED: 'CREATED',
  CAPTURED: 'CAPTURED',
  FAILED: 'FAILED',
  PENDING_COD: 'PENDING_COD',
  SUBSCRIPTION_FUNDED: 'SUBSCRIPTION_FUNDED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
} as const

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus]

export const RefundStatus = {
  PENDING: 'PENDING',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED',
} as const

export type RefundStatus = (typeof RefundStatus)[keyof typeof RefundStatus]

export * from '@prisma/client'
