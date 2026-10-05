import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { BankError } from './errors';
export async function rateLimit(req:Request,scope:string,max=20,windowMs=300_000,identity?:string) {
  const client=identity || req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const bucket=Math.floor(Date.now()/windowMs), key=createHash('sha256').update(`${scope}:${client}:${bucket}`).digest('hex');
  const expiry=new Date((bucket+2)*windowMs);
  const result=await db.execute(sql`INSERT INTO auth_rate_limits (id,count,expires_at) VALUES (${key},1,${expiry}) ON CONFLICT (id) DO UPDATE SET count=auth_rate_limits.count+1 RETURNING count`);
  if(Number(result.rows[0]?.count)>max) throw new BankError('RATE_LIMITED','Please wait a moment before trying again.',429);
  await db.execute(sql`DELETE FROM auth_rate_limits WHERE expires_at < now()`);
}
