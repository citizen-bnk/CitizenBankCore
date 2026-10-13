# Citizen shared provider service

This directory deploys to the existing citizenbankcore project, where provider keys are already configured. It contains no banking database code, migration, seeding, customer sessions or public chat UI. The active banking Core calls its private signed API at https://ai.citizenbank.co.ls.

Keep CITIZEN_PROVIDER_SECRET identical in the provider service and active Core production environment. Active Core sets CITIZEN_PROVIDER_URL to the address above. Keys remain in the provider project. No key is returned to callers. All user authorization, current-role checks, prompt context, read-only banking tools and throttling remain in the active Core; the service accepts only allowlisted provider operations with body-bound authentication.

Release from the Core repository with rootDirectory=provider-service, framework=null and no build/migration command. Verify the exact Git revision and both signed and unsigned requests. Keep the Vercel protection setting on preview deployments; the custom API domain uses its own required server signature.

Provider configuration presence does not prove valid keys, subscription credits or enabled model access. Verify a harmless actual generation and speech request before claiming operational availability. Do not copy provider keys to a frontend.
