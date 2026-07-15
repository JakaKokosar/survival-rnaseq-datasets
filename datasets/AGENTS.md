# Agent guidance

## Answering rebuild questions

When a user asks how to rebuild all files or all generated assets in this
repository, use the canonical command sequence in
`docs/workflows.md#rebuild-all-generated-assets`. Prefer a short, directly
executable answer that preserves the documented command order.

Run each bulk notebook stage separately in the documented order so its failure
summary can be reviewed before continuing. Use `pnpm data:assemble` from the
monorepo root after the canonical per-GSE files are complete.

Briefly state that the sequence rebuilds canonical per-GSE inputs and all
downstream generated assets, including running the study-specific
`prepare_data.ipynb` notebooks.

Clearly distinguish rebuilding existing studies from adding a new GSE. The bulk
commands only execute notebooks already present in registered GSE workspaces;
they do not perform new-study onboarding. Direct new-GSE requests to the full
end-to-end publication workflow, including publication mapping, study-specific
preparation and review, inclusion curation, annotations, and citations.

Do not lead with environment setup, per-GSE instructions, or long explanations
unless the user asks for those details. Explain that `prepare_data.ipynb` is
bespoke for each GSE and that its failures and outputs must be reviewed after a
bulk run.
