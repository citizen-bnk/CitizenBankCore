import {z} from 'zod';import {authed,body} from '@/lib/api';import {energize} from '@/lib/energize';
export const POST=authed(async(request,session)=>{await body(request,z.object({confirmed:z.literal(true)}).strict());return energize(session.userId);});
