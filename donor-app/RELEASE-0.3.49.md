# Donor 0.3.49

- **No more silent freezes.** Every message the donor sends to the brain now has a 30 s limit. A send that cannot finish (the link stopped taking data) marks the link stalled and the donor reconnects, instead of waiting forever with every thread parked — the freeze that dropped a rented card after 89 s of silence.
- **Out of date? It says so.** When the brain wants a newer build, or refuses this one as too old, the donor window shows it in a warning line with an **Update** button that opens the latest release.
- The brain now refuses donors older than its current release by default, telling them which version they need.
