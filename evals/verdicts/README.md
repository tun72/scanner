# Verdict quality evaluation (DLP-06 / TC14)

Build a dataset of about 50 labeled JPEGs across four synthetic profiles. Include meals and packaging, clear and unclear images, non-food images, and examples for each verdict level. Label each photo/profile pair before running either model. Use photos you have permission to send to Anthropic and omit identifying details and real health notes. Match the phone's input by resizing to a maximum of 1024 px on the longest side and keeping each file below 1.5 MiB.

Copy `manifest.example.json` to `local/manifest.json` and put the photos under `local/photos/`. The example is a layout template with placeholder labels. Replace those labels with your own reviewed labels. `expectedFlags` is optional and lists ingredient names the verdict should flag. The report uses case-insensitive exact matches, so review equivalent spellings and synonyms manually. Case IDs must be unique, profile IDs must exist in the manifest, and photo paths are relative to the manifest directory. The `local` directory is ignored by Git.

From the repository root, validate the dataset and see the number of planned model calls without sending any photos:

```sh
npm run eval:verdicts -- --manifest evals/verdicts/local/manifest.json
```

After approving the spend, configure `ANTHROPIC_API_KEY` locally and explicitly enable the live comparison. With 50 cases, the two models need at most 100 generation requests:

```sh
npm run --silent eval:verdicts -- --manifest evals/verdicts/local/manifest.json \
  --live --max-calls 100 > evals/verdicts/local/report.json
```

The runner uses the production prompt, schema and verdict rules for both models. It disables retries and fallback so outcomes can be attributed to the model requested. Both models retain the app's prompt-cache settings. Compare exact verdict matches, matches that also include required flags, incorrect Safe verdicts, provider failures, p50/p95 latency, and token-based USD estimates. Review every incorrect Safe verdict and any missed Not sure case before using cost and latency to choose a model. The report contains case IDs and results without photos, profile notes, or model explanations.

The call limit caps generation requests. The USD estimates use public rates and reported usage, including cache reads and writes. Usage can be missing on a timeout or error, and service pricing can change. Compare the estimates with Anthropic billing. [Claude API pricing](https://platform.claude.com/docs/en/about-claude/pricing)
