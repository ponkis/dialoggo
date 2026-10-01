# Security policy

## Supported versions

Security fixes target the latest stable Dialoggo release. Development builds from `main` are not release artifacts.

## Report a vulnerability

Please do not disclose a suspected vulnerability in a public issue or pull request. Use GitHub's private vulnerability reporting option on the repository's **Security** tab when it is available. If private reporting is unavailable, contact the maintainer through the private contact channel listed on the [ponkis GitHub profile](https://github.com/ponkis).

Include the affected Dialoggo version, operating system, steps to reproduce, and any relevant logs. Remove personal paths or other sensitive information from logs before sharing them.

## Scope

Reports about Dialoggo's Electron process boundary, preload bridge, renderer, IPC, Content Security Policy, file-path or external-URL validation, and bundled dependency use are in scope. Vulnerabilities in Node.js, Electron, operating systems, or upstream dependencies should also be reported to the relevant upstream project.