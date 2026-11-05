# Security

cc-exporter reads Claude Code transcripts on your computer and writes export files. It makes no network requests, and the HTML it writes loads nothing from outside the file.

## Reporting a problem

Please report vulnerabilities privately through GitHub's **Report a vulnerability** button on this repository's Security tab, not in a public issue. Include the version, your platform, and the steps or a transcript snippet that shows the problem (with any real secrets removed).

## What counts

- Script that runs when an exported HTML file is opened.
- The exporter reading or including files that the session didn't produce.
- `--redact` missing a secret format it claims to cover.
- An installer writing outside the folders it documents.
