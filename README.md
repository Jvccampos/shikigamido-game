# Shikigamido

Web implementation of the Shikigamido tactical card/board game.

## Included

- Google sign-in through Sited OAuth
- Persistent deck builder with 30-card validation
- Room creation by code, two-player matches, and spectator view
- Five-phase turn flow, PE economy, mulligan, movement graph, combat, curses, response stack, and win condition
- Card catalog and local card artwork from the original game files

## Run and deploy

This project is a Sited capsule. Install Node.js 22+, then run the Sited development or deployment commands described by d.ellep.dev. Keep `SITED_ADMIN_TOKEN` in the environment only; never commit it.

The live deployment is hosted at [shikigamido-game.d.ellep.dev](https://shikigamido-game.d.ellep.dev).

## Rule interpretations

The implementation documents ambiguous decisions in the in-app Regras view, including response priority (LIFO), curse path tie-breaking, and the base Omionji profile where no Omionji card was present in the supplied catalog.
