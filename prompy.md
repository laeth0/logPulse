I want to add the optional **Multi-Tenancy** feature to this project.

For this step, **DO NOT implement anything yet**. I am using Claude Opus only to analyze the existing project and produce a complete implementation plan. Later, I will use Claude Sonnet to execute that plan.

Before creating the plan:

* Carefully inspect the entire current codebase, architecture, database schema, migrations, authentication-related code, ingestion flow, query flow, aggregation flow, retention implementation, Docker setup, configuration, CI, and documentation.
* Read `Final_Project.md` carefully, especially:

  * Required API Contract
  * Optional Features and Load Generator Contract
  * Authentication and API Keys
  * Multi-Tenancy
  * Default / zero-configuration behavior
  * Load-generator compatibility
  * Retention
  * CI requirements
  * Performance requirements
* Treat the requirements in `Final_Project.md` as authoritative.

## Main Goal

Create a complete implementation plan for evolving the current single-tenant system into a multi-tenant system using API keys, while preserving the existing behavior and performance characteristics required by the project.

The database schema, application architecture, repositories, authentication flow, configuration, retention logic, seed/startup behavior, and any other affected parts of the project should be reconsidered and redesigned where necessary so that multi-tenancy becomes a clean architectural concept rather than a small patch added on top of the current implementation.

## Critical Load Generator Constraint

This project is evaluated using an external load generator from the provided load-testing website.

Therefore, **compatibility with the existing load generator is one of the highest-priority requirements**.

The existing mandatory API contract must remain exactly compatible with the specification and with the APIs that currently exist.

Do not introduce changes to the required endpoints that could break the load generator.

In particular:

* Do not rename required endpoints.
* Do not change required request structures.
* Do not change required response structures or field types.
* Do not introduce a required tenant parameter.
* Do not introduce a required tenant header.
* Do not make tenant identity part of the request body or query parameters.
* Do not otherwise require the load generator to understand multi-tenancy.
* All multi-tenancy behavior must be transparent from the perspective of the required APIs.

Anything new must be **additive**.


When authentication is disabled, the existing application must continue working exactly like the core single-tenant service, including compatibility with the external load generator.

When authentication/multi-tenancy is enabled, tenant identity must be derived transparently from the API key according to the project requirements.

## Multi-Tenant Data Isolation

The plan must cover tenant isolation across all relevant system behavior, including:

* log ingestion
* log querying
* aggregation
* filtering
* database access
* retention
* internal services/repositories
* any other paths that access tenant-owned data


## System Administrator

I also want to introduce a separate **System Administrator** concept.

The System Administrator is different from a tenant and from tenant API-key authentication.

The System Administrator will eventually use an administration frontend.

For now, implement only the backend requirements in the future implementation.

The implementation plan must include:

* A System Administrator role/entity/model appropriate for the architecture.
* Authentication for the System Administrator.
* A login API for the System Administrator.
* Access-token generation.
* Refresh-token generation and refresh flow.
* Secure handling of administrator credentials and tokens.
* Seed data that creates one initial System Administrator.
* Appropriate authorization so only the System Administrator can access system-level tenant-management APIs.

Do not change the authentication model required by `Final_Project.md` for tenant API access. Tenant/API-key authentication and System Administrator authentication are separate concerns and should be designed cleanly.

The required log APIs must not suddenly require a System Administrator JWT.

## Tenant Management API

Add planning for new administrative APIs that will later be consumed by a frontend.

Only the System Administrator should be able to use these APIs.

The system administrator must be able to:

* Get all tenants.
* Get a tenant by ID.
* Create a tenant.
* Update a tenant.
* Delete a tenant.

Design these as additional administration endpoints without modifying the mandatory log-service API contract.

## Tenant API Keys

For tenant-facing access, follow the API-key and multi-tenancy rules in `Final_Project.md`.

The implementation plan should cover the lifecycle and ownership of tenant API keys and how authentication resolves an API key to a tenant and its permissions.

Do not replace the required tenant API-key model with JWT authentication.

JWT access/refresh tokens are specifically for the **System Administrator**.


## Architecture and Code Quality

Use the existing architecture as the starting point, but do not be afraid to propose restructuring when necessary.

The final design should have clear separation between concepts such as:

* System Administrator authentication
* tenant API-key authentication
* tenant context
* tenant management
* log domain/application logic
* persistence
* configuration
* startup/seeding
* retention

Avoid spreading tenant-related conditional logic throughout controllers and repositories in an ad-hoc way.

The goal is a clean, understandable architecture that I can explain during the final project demo.


## Documentation

Include the README/documentation changes required after implementation, especially:

* optional feature description
* default state
* environment variables
* authentication behavior
* multi-tenancy behavior
* load-generator compatibility
* System Administrator functionality
* tenant-management APIs
* schema/design decisions
* retention impact
* performance impact
* known limitations

## Expected Output

Produce a **complete implementation plan only**.

Do not modify files.
Do not generate implementation code.
Do not start implementing.

Make the plan detailed and structured enough that I can later give it directly to Claude Sonnet and ask it to implement the phases one by one without having to rediscover the architecture or requirements.
