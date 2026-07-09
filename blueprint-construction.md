which command starts construction
habitat construct small-solar-array

what dry-run checks
dry-run does a simulation of the construction process

what local files change during real construction
add a solar array to the habitat inventory, take away energy battery, take away from inventory

how inventory is spent
looks at each inventory item, sees if it needs, subtracts number if needs

where the construction job is stored
.habitat/construction.json

how ticks advance remaining build time
advances by 1 tick per second, ticks are used to track remaining build time

how the completed module is created
looks at blueprint, habitat module create ..., uses ticks as time

how cancellation works
habitat construction cancel workshop-fabricator-1

why construction reads Kepler blueprints but writes local Habitat state
reads blueprint to understand what to build, writes local state to track progress

what CLI checks prove the workflow works
habitat blueprint show small-solar-array, check statuses, run dry run then construction, advance time, finish build

A brief explanation of what must be true before a blueprint can be constructed.
must have idea of what to build

A brief explanation of why construction reads from Kepler but writes to local Habitat state.
Kepler is the source of truth for blueprint definitions: what a module requires, how long it takes, what facility it needs, and what it should produce.

A note describing one fix, adjustment, or verification pass you made after the first implementation.
made organization better
