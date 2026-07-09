the files Codex created or changed

1. main CLI wiring
2. blueprint and resource clients
3. blueprint and resource tables
where habitat blueprint list is defined

src/cli.ts, calls listBlueprintCatalog() and prints the table.
where habitat blueprint show <blueprint-id> is defined

where habitat resource list is defined
src/cli.ts, calls listBlueprintCatalog() and prints the table.
where habitat resource show <blueprint-id> is defined

where the CLI builds Kepler API requests
sendCatalogRequest() in:
src/kepler-blueprints.ts
src/kepler-resources.ts

which Kepler endpoints are used for resources and blueprints
GET /catalog/blueprints in src/kepler-blueprints.ts
GET /catalog/blueprints/{blueprintId} in src/kepler-blueprints.ts
GET /catalog/resources in src/kepler-resources.ts

how the CLI reads the Kepler base URL and token
Reads KEPLER_BASE_URL and KEPLER_TOKEN from .env in their getConfig() helpers src/kepler-blueprints.ts and src/kepler-resources.ts

where table or detail output is formatted
blueprint list table formatting, resource list table formatting, and blueprint detail output

why these commands should be read-only catalog commands\
They only make GET requests and print results, they don't change things

why this lab does not create starter inventory or local inventory state
Only exposes data

one test that proves blueprint behavior works
habitat blueprint list

one test that proves resource behavior works
habitat resource list

one part of the code you understand well
CLI calls a small Kepler client, client validates JSON, the formatter turns that data into a table

one part of the code you would still want to improve or ask about
Confirm which fields are truely stable, and if some should be hidden
