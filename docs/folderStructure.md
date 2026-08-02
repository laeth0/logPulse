```text
logstream/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   │
│   ├── config/
│   │   ├── config.module.ts
│   │   ├── configuration.ts
│   │   ├── env.validation.ts
│   │   └── config.types.ts
│   │
│   ├── common/
│   │   ├── constants/
│   │   │   └── injection-tokens.ts
│   │   │
│   │   ├── filters/
│   │   │   └── global-exception.filter.ts
│   │   │
│   │   └── pipes/
│   │       └── parse-attributes.pipe.ts
│   │
│   │
│   ├── health/
│   │   ├── health.module.ts
│   │   ├── health.controller.ts
│   │   └── health.service.ts
│   │
│   ├── logs/
│   │   ├── logs.module.ts
│   │   ├── logs.controller.ts
│   │   │
│   │   ├── dto/
│   │   │   ├── requests/
│   │   │   │   ├── ingest-logs.dto.ts
│   │   │   │   ├── log-entry.dto.ts
│   │   │   │   ├── query-logs.dto.ts
│   │   │   │   └── aggregate-logs.dto.ts
│   │   │   │
│   │   │   └── responses/
│   │   │       ├── ingest-logs-response.dto.ts
│   │   │       ├── query-logs-response.dto.ts
│   │   │       └── aggregate-logs-response.dto.ts
│   │   │
│   │   ├── entities/
│   │   │   └── log.entity.ts
│   │   │
│   │   ├── enums/
│   │   │   ├── log-level.enum.ts
│   │   │   ├── aggregation-bucket.enum.ts
│   │   │   └── aggregation-group.enum.ts
│   │   │
│   │   ├── interfaces/
│   │   │   ├── log-repository.interface.ts
│   │   │   ├── log-query.interface.ts
│   │   │   └── cursor-payload.interface.ts
│   │   │
│   │   ├── repositories/
│   │   │   └── log.repository.ts
│   │   │
│   │   ├── services/
│   │   │   ├── log-ingestion.service.ts
│   │   │   ├── log-query.service.ts
│   │   │   └── log-aggregation.service.ts
│   │   │
│   │   ├── query-builders/
│   │   │   ├── log-filter.builder.ts
│   │   │   ├── log-query.builder.ts
│   │   │   └── aggregation-query.builder.ts
│   │   │
│   │   ├── validators/
│   │   │   └── log-entry.validator.ts
│   │   │
│   │   ├── mappers/
│   │   │   └── log.mapper.ts
│   │   │
│   │   └── cursor/
│   │       └── cursor.service.ts
│   │
│   └── retention/
│       ├── retention.module.ts
│       ├── retention.service.ts
│       ├── retention.scheduler.ts
│       └── partition.service.ts
│
├── migrations/
│   ├── 001-enable-extensions.sql
│   ├── 002-create-log-level.sql
│   ├── 003-create-logs-table.sql
│   ├── 004-create-log-indexes.sql
│   └── 005-create-initial-partitions.sql
│
├── test/
│   ├── logs.e2e-spec.ts
│   ├── health.e2e-spec.ts
│   ├── ingestion-load.spec.ts
│   └── jest-e2e.json
│
├── scripts/
│   ├── run-migrations.ts
│   ├── create-partitions.ts
│   └── load-test.ts
│
├── docker/
│   └── postgres/
│       └── init.sql
│
├── .github/
│   └── workflows/
│       └── ci.yml
│
├── .env.example
├── docker-compose.yml
├── Dockerfile
├── nest-cli.json
├── package.json
├── tsconfig.json
└── README.md
```