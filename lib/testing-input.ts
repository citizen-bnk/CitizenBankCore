import {z} from 'zod';
const target={userId:z.string().uuid(),reason:z.string().trim().min(10).max(500),confirmed:z.literal(true)};
export const testingInput=z.discriminatedUnion('action',[
 z.object({action:z.literal('list'),search:z.string().trim().max(120).default('')}).strict(),
 z.object({action:z.literal('authorize'),...target,accounts:z.boolean(),cards:z.boolean(),energize:z.boolean()}).strict(),
 z.object({action:z.literal('open_accounts'),...target}).strict(),
 z.object({action:z.literal('energize'),...target,cents:z.number().int().min(1).max(100_000_000)}).strict(),
 z.object({action:z.literal('order_card'),...target,requestId:z.string().uuid(),accountId:z.string().uuid(),kind:z.enum(['DEBIT','CRYPTO']),form:z.enum(['VIRTUAL','PHYSICAL']),deliveryAddress:z.string().trim().max(300).optional()}).strict(),
]);
