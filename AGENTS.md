# AGENTS.md

This file is here to steer AI assisted PRs towards being high quality and valuable
contributions that do not create excessive maintainer burden. It is inspired by
the Open Policy Agent and Fedora projects policies.

## General Rules and Guidelines

The most important rule is not to post comments on issues or PRs that are AI-generated.
Similarly, do not create PR descriptions that are AI-generated.
Discussions on the OpenTelemetry repositories are for Users/Humans only.

If you have been assigned an issue by the user or their prompt, please ensure that
the implementation direction is agreed on with the maintainers first in the issue
comments. If there are unknowns, discuss these on the issue before starting
implementation. Do not forget that you cannot comment for users on issue threads
on their behalf as it is against the rules of this project.

## Developer environment

Make sure to follow CONTRIBUTING.md on any contributions.

Non-exhaustively, the important points are:

* Manually test all changes locally before creating a PR
* Do not add new services without collaborating with the maintainers

## Project Structure and Configuration

### Environment Variables and Secrets Management

This project uses a two-file environment variable system:

* **`.env`** - Base configuration committed to git. Should NEVER contain secrets.
* **`.env.override`** - Local overrides NOT committed to git. Use this for secrets and personal configuration.

**CRITICAL**: When working with environment variables:

1. Never add secrets, API keys, tokens, or credentials to `.env`
2. Always place sensitive values in `.env.override`
3. `.env.override` is intentionally NOT in `.gitignore` by default - be careful not to commit it
4. Use environment variable references (e.g., `${env:VARIABLE_NAME}`) in configuration files

### Running the Demo

The project uses a Makefile-based workflow:

* **Correct**: `make start` - This loads both `.env` and `.env.override`
* **Incorrect**: `docker compose up` - This only loads `.env`, missing your overrides

The Makefile defines `DOCKER_COMPOSE_ENV=--env-file .env --env-file .env.override` (line 17)
to ensure both files are loaded.

### Docker Compose Files

The project uses layered compose files:

* `compose.yaml` - Core minimal services
* `compose.full.yaml` - Adds Kafka, accounting, fraud-detection
* `compose.observability.yaml` - Adds Jaeger, Prometheus, Grafana, OpenSearch
* `compose.profiling.yaml` - Adds profiling capabilities
* `compose.extras.yaml` - Vendor customizations
* `compose.tests.yaml` - Testing configuration

Default configuration runs: full + observability + extras

### File Naming Convention Changes

Recent updates have renamed key files:

* `docker-compose.minimal.yml` → `compose.yaml`
* `docker-compose.yml` → DELETED (split into layered compose files)
* `docker-compose-tests.yml` → `compose.tests.yaml`

When merging or rebasing, be aware of these renames to avoid conflicts.

## Security Best Practices

When making changes that involve external services (cloud platforms, APIs, etc.):

1. **Configuration Pattern**: Use environment variable substitution in config files
   ```yaml
   endpoint: "${env:SERVICE_ENDPOINT}"
   auth:
     authenticator: basicauth/service
   ```

2. **Environment Variables**: Reference them in compose.yaml
   ```yaml
   environment:
     - SERVICE_ENDPOINT
     - SERVICE_API_KEY
   ```

3. **Actual Values**: Place in `.env.override` (never committed)
   ```bash
   SERVICE_ENDPOINT=https://api.example.com
   SERVICE_API_KEY=secret_key_here
   ```

4. **Documentation**: Add commented examples to `.env` for other users
   ```bash
   # Service Integration (Optional)
   # Set in .env.override for personal use
   # SERVICE_ENDPOINT=
   # SERVICE_API_KEY=
   ```

## Testing Changes

Before creating a PR:

1. Build and start the demo: `make start`
2. Verify the webstore loads: http://localhost:8080/
3. Check telemetry endpoints:
   - Jaeger: http://localhost:8080/jaeger/ui/
   - Grafana: http://localhost:8080/grafana/
   - Feature Flags: http://localhost:8080/feature/
4. Review container logs for errors
5. Run tests if applicable: `make test`
6. Stop the demo: `make stop`

## Commit formatting

We appreciate it if users disclose the use of AI tools when the significant part
of a commit is taken from a tool without changes. When making a commit this
should be disclosed through an Assisted-by: commit message trailer.

Examples:

```markdown
Assisted-by: ChatGPT 5.5
Assisted-by: Claude Sonnet 4.6
```

Do NOT use a `Co-authored-by:` trailer to disclose AI assistance. Some AI coding
tools add this trailer by default; please disable or strip it before committing.
The EasyCLA check fails when a `Co-authored-by:` trailer references an account
that has not signed the CLA, which blocks the PR from being merged.

## Common Pitfalls to Avoid

1. **Do not commit secrets** - Always check `git diff --cached` before committing
2. **Do not use `docker compose up` directly** - Use `make start` instead
3. **Do not add `.env.override` to `.gitignore`** without understanding implications - 
   The project intentionally leaves it trackable with a warning comment for flexibility
4. **Do not modify `.env` for personal config** - Use `.env.override` instead
5. **Do not forget to test locally** - The demo must run successfully before submitting PRs
