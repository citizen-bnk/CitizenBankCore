import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { db,schema } from '@/db';
import { getSession,hashPassword,setSessionCookie } from '@/lib/auth';
import { assertOrigin } from '@/lib/passkey-auth';
import { errorResponse } from '@/lib/api';
import { BankError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { withDataScope } from '@/lib/execution-context';
export async function POST(req:Request){try{
  assertOrigin(req);
  await rateLimit(req,'explore',5,3600_000);
  if(process.env.DEMO_MODE!=='true') throw new BankError('DEMO_ONLY','Limited exploration is available only in the demonstration.',403);
  if(await getSession()) return Response.json({ok:true});
  return await withDataScope('demo',async()=>{
  // Random, unguessable identity; no accounts/card/funding or user-supplied existing-account lookup.
  const token=randomBytes(24).toString('hex');
  const [u]=await db.insert(schema.users).values({email:`visitor-${token}@explore.invalid`,passwordHash:await hashPassword(randomBytes(32).toString('base64url')),firstName:'Explorer',lastName:''}).returning();
  await setSessionCookie({userId:u.id,roles:u.roles});
  (await cookies()).set('cb_explorer','1',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:28800});
  return Response.json({ok:true,limited:true});
  });
}catch(e){return errorResponse(e);}}
