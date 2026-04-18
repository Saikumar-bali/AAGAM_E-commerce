import { z } from 'zod';
export const UserSchema = z.object({
    id: z.string().cuid(),
    email: z.string().email(),
    name: z.string().optional(),
    role: z.enum(['CUSTOMER', 'RIDER', 'ADMIN', 'STORE_OWNER']),
});
export const OrderSchema = z.object({
    id: z.string().cuid(),
    customerId: z.string(),
    storeId: z.string(),
    status: z.enum(['PENDING', 'CONFIRMED', 'PICKING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']),
    totalAmount: z.number(),
});
//# sourceMappingURL=index.js.map