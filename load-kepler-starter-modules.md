the files Codex created or changed
load-kepler-starter-modules.md, plan-habitat-tick.md

where the registration manifest is read or received
received in "sendRegisterRequest()", which is in src/kepler-registration.ts

where starter modules are transformed into local data
local data lands in .habitat/habitat.sqlite, saved starter module state is a HabitatModuleState object

what the saved starter-module data looks like
object with JSON:

{
  habitatId: "habitat-1",
  modules: [
    {
      id: "…",
      slug: "…",
      blueprintId: "…",
      displayName: "…",
      connectedTo: ["…"],
      runtimeAttributes: { ... },
      capabilities: ["…"]
    }
  ]
}

how the code avoids hard-coding one fixed list of starter modules
does not store a built-in starter-module list anywhere in source, reads which starterModules array Kepler sends and parses, writes result locally. 

applyMissingSlugs() only fills in missing slugs for starter modules

one command you ran to verify the data loaded correctly
bun test tests/module-storage.test.ts

one part of the code you understand
Kepler registration returns a manifest, that manifest is stored in registration.raw

one part of the code you do not fully understand yet
only rehydrates when the local habitat ID changes or the local module list is empty, so changes in Kepler’s starter-module payload may not automatically overwrite existing local modules.
