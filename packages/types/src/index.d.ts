import { z } from 'zod';
export declare const UserSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    emailVerified: z.ZodOptional<z.ZodBoolean>;
    role: z.ZodEnum<["CUSTOMER", "RIDER", "ADMIN", "STORE_OWNER"]>;
}, "strip", z.ZodTypeAny, {
    email: string;
    id: string;
    role: "CUSTOMER" | "RIDER" | "STORE_OWNER" | "ADMIN";
    avatarUrl?: string | null | undefined;
    emailVerified?: boolean | undefined;
    name?: string | undefined;
}, {
    email: string;
    id: string;
    role: "CUSTOMER" | "RIDER" | "STORE_OWNER" | "ADMIN";
    avatarUrl?: string | null | undefined;
    emailVerified?: boolean | undefined;
    name?: string | undefined;
}>;
export declare const OrderSchema: z.ZodObject<{
    id: z.ZodString;
    customerId: z.ZodString;
    storeId: z.ZodString;
    status: z.ZodEnum<["PENDING", "CONFIRMED", "PICKING", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"]>;
    totalAmount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: "PENDING" | "CONFIRMED" | "PICKING" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";
    customerId: string;
    storeId: string;
    totalAmount: number;
}, {
    id: string;
    status: "PENDING" | "CONFIRMED" | "PICKING" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";
    customerId: string;
    storeId: string;
    totalAmount: number;
}>;
export type UserType = z.infer<typeof UserSchema>;
export type OrderType = z.infer<typeof OrderSchema>;
//# sourceMappingURL=index.d.ts.map
