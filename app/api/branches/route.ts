import { nearestBranches } from "@/lib/banking";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const lat = q.get("lat"), lng = q.get("lng");
  return Response.json(await nearestBranches(lat ? Number(lat) : undefined, lng ? Number(lng) : undefined, Number(q.get("limit") ?? 3)));
}
