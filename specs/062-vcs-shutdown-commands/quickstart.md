# Validation

1. Synthetic known-format XML: terminal Shutdown from unknown/controller-like
   channel, Web/remote duplicates; one power_off and source references only.
2. Error/cancel/config/subsystem lookalikes do not create events.
3. Check old registry → required full selection, new registry → unchanged skip.
4. Cancel halfway, retry same SR/version/files, read only prefixes of checkpointed
   files; incomplete scan never publishes partial replacement.
5. Worker and direct fallback equal, UI progress and SQL views retain conditions.
6. Polycom archive requires separate reviewed sample; metadata-only until then.
