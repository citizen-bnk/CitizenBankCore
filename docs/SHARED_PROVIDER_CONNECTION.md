# Shared CitizenAI connection

The original citizenbankcore project holds existing provider credentials and an additive private /api/provider route. Its original banking APIs, sessions, schema and project root remain intact. The active Core serves all canonical apps and calls this route at https://ai.citizenbank.co.ls with CITIZEN_PROVIDER_SECRET body-bound authentication.

The private endpoint was built from the exact original published revision 1768cce. Its provider-api branch changes only that endpoint, focused tests and build-only publication (no migrations, seed or admin bootstrap). Provider keys remain in the original project; no key is returned to a frontend or copied to active Core. Authorization, canonical role checks, scoped banking tools and user rate limiting remain in active Core.

Original project root replacement was rejected by automatic approval review and was abandoned. A rejected root-directory update was not applied, and the follow-up deployment was cancelled. The provider endpoint is additive instead.

Provider presence is not proof of working credentials, model availability or subscription balance. Record an actual harmless generation and speech test before claiming those capabilities operational. If providers reject the existing keys, an administrator must correct the original provider settings securely.
