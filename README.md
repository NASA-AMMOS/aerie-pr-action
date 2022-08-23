# Aerie Pull Request Action

A simple Github action to handle custom logic for PRs. Created to streamline workflows for the [aerie](https://github.com/NASA-AMMOS/aerie) development team.

# Features
- Assigns PR opener as assignee
- Automatically give one approval to PRs with `documentation` or `hotfix` labels, to speed up merging velocity for small changes.

# Usage
Add the following to e.g. `./.github/workflows/aerie.yml`
```yaml
name: "Aerie PR Logic"
on:
  pull_request:
    types:
      - opened
      - synchronize
      - ready_for_review
      - labeled
      - unlabeled
jobs:
  pr_logic:
  steps:
    - uses: nasa-ammos/aerie-pr-action@main
```
...and then open a PR!
