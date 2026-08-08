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

const transactionWithSerializableRetry = async (
  input: unknown,
  options?: TransactionOptions,
) => {
  const isInteractive = typeof input === 'function'
  const isSerializable = String(options?.isolationLevel || '').toLowerCase() === 'serializable'

  if (!isInteractive || !isSerializable) {
    return baseTransaction(input, options)
  }

  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await baseTransaction(input, options)
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

export const Role = {
  CUSTOMER: 'CUSTOMER',
  RIDER: 'RIDER',
  ADMIN: 'ADMIN',
  STORE_OWNER: 'STORE_OWNER',
} as const

export type Role = (typeof Role)[keyof typeof Role]


export const OrderSource = {
  CHECKOUT: 'CHECKOUT',
  SUBSCRIPTION: 'SUBSCRIPTION',
  ADMIN: 'ADMIN',
} as const

export type OrderSource = (typeof OrderSource)[keyof typeof OrderSource]

export const OrderStatus = {
  PENDING: 'PENDING',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  CONFIRMED: 'CONFIRMED',
  PICKING: 'PICKING',
  PACKED: 'PACKED',
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
