# Security Policy

## Reporting a vulnerability

If you believe you have found a security vulnerability, please do not open a public issue.

Instead, contact the maintainers privately with:

- A short description of the issue and impact
- Steps to reproduce
- A proof-of-concept (if available)
- Suggested mitigation (if you have one)

## Important note about `.vcs`

`.vcs` programs are **executable instructions**. Treat `.vcs` as untrusted input unless it is generated and stored in a trusted pipeline.

Recommended mitigations for embedding:

- Run only a whitelisted set of modules/opcodes
- Validate parameter types/ranges
- Sandbox side-effecting modules (I/O, filesystem, process, network)

