/** Legacy demo invitations must never grant production banking privileges. */
export async function POST(){return Response.json({code:'LEGACY_ADMIN_ACTIVATION_DISABLED',error:'This legacy administrator activation route is retired. Manage approved Citizen roles in the Hub.',recovery:'hub'},{status:403,headers:{'Cache-Control':'no-store'}});}
