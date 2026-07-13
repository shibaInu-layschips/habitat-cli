where the Kepler solar irradiance request is implemented
src/kepler-irradiance.ts

how the response is parsed
parsed in the same file: sendWorldRequest() fetches and JSON-parses the body, then parseSolarIrradianceReading() extracts solarIrradiance.wPerM2 and solarIrradiance.condition and returns { wPerM2, condition } or null if invalid.

where tick simulation applies solar charging
src/power-simulation.ts finds solar modules

how the CLI decides whether a solar panel is online
getModuleSolarGenerationKw() in src/power-simulation.ts.It only returns generation if the module has capabilities.includes("solar-generation") and its status is online or active.

how the CLI decides whether a battery can receive charge
getBatteryChargeBlocker() in src/power-simulation.ts. It blocks if the battery is not online/active, if charge state is missing, or if currentEnergyKwh >= energyStorageKwh.

how battery capacity is enforced
enforced in the tick loop

what happens when Kepler cannot provide solar irradiance
returns null

which tests prove the behavior works
habitat blueprint show small-solar-array
habitat inventory add ferrite 90
habitat inventory add silicate-glass 45
habitat inventory add conductive-ore 18
habitat construct small-solar-array
habitat construction status
habitat tick 180
habitat module show small-solar-array-1
habitat solar status
habitat tick 1 hour

codex changed:
added solar panel integration and solar radiance
