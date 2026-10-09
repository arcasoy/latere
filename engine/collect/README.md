# collect

Pulls per-post metrics from Buffer, joins them to the vector via
`buffer_post_id`, and writes the reward into the ledger.

Reward matures over days — collect on a delay and stamp `measured_at`. Tag
obvious confounds (`trending_audio`, `spike_day`) so the surrogate doesn't
over-credit the wrong lever.

**Open dependency:** confirm Buffer exposes per-post metrics, not just date-range
aggregates. If not, fall back to platform-native analytics or Buffer's GraphQL
escape hatch.
