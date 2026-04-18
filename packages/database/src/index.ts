import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables from the root .env file
dotenv.config({ path: path.join(__dirname, '../../../.env') })

export const prisma = new PrismaClient()

export * from '@prisma/client'
