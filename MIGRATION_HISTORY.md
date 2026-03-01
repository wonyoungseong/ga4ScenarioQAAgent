# Migration History: Root src/ → ga4ScenarioQAAgent/src/

## Migration Date: 2026-03-01

## Path Mapping (Old → New)

### Entry Points (Renamed)
| Old Path | New Path | Notes |
|----------|----------|-------|
| src/cli.ts | ga4ScenarioQAAgent/src/cli-qa.ts | QA CLI, orchestrator import updated |
| src/orchestrator.ts | ga4ScenarioQAAgent/src/orchestrator-qa.ts | Renamed (GA4 has orchestrator/ directory) |
| src/orchestrator-event.ts | ga4ScenarioQAAgent/src/orchestrator-event.ts | Path move only |
| src/orchestrator-global-variable.ts | ga4ScenarioQAAgent/src/orchestrator-global-variable.ts | Path move only |

### Agents (Structure preserved — under agents/)
| Old Path | New Path |
|----------|----------|
| src/agents/analyzer/* | ga4ScenarioQAAgent/src/agents/analyzer/* |
| src/agents/collector/* | ga4ScenarioQAAgent/src/agents/collector/* |
| src/agents/observer/* | ga4ScenarioQAAgent/src/agents/observer/* |
| src/agents/parser/* | ga4ScenarioQAAgent/src/agents/parser/* |
| src/agents/recon/* | ga4ScenarioQAAgent/src/agents/recon/* |
| src/agents/reporter/* | ga4ScenarioQAAgent/src/agents/reporter/* |
| src/agents/validator/* | ga4ScenarioQAAgent/src/agents/validator/* |

### Types (Added to existing types/ — no filename conflicts)
| Old Path | New Path |
|----------|----------|
| src/types/collected-data.ts | ga4ScenarioQAAgent/src/types/collected-data.ts |
| src/types/common.ts | ga4ScenarioQAAgent/src/types/common.ts |
| src/types/content-group.ts | ga4ScenarioQAAgent/src/types/content-group.ts |
| src/types/custom-event-observation.ts | ga4ScenarioQAAgent/src/types/custom-event-observation.ts |
| src/types/devguide.ts | ga4ScenarioQAAgent/src/types/devguide.ts |
| src/types/event-scenario-knowledge.ts | ga4ScenarioQAAgent/src/types/event-scenario-knowledge.ts |
| src/types/event-scenario.ts | ga4ScenarioQAAgent/src/types/event-scenario.ts |
| src/types/event-validation-result.ts | ga4ScenarioQAAgent/src/types/event-validation-result.ts |
| src/types/gtm-container.ts | ga4ScenarioQAAgent/src/types/gtm-container.ts |
| src/types/knowledge-state.ts | ga4ScenarioQAAgent/src/types/knowledge-state.ts |
| src/types/parameter-spec.ts | ga4ScenarioQAAgent/src/types/parameter-spec.ts |
| src/types/parameter-validation-result.ts | ga4ScenarioQAAgent/src/types/parameter-validation-result.ts |
| src/types/parsed-inputs.ts | ga4ScenarioQAAgent/src/types/parsed-inputs.ts |
| src/types/qa-report.ts | ga4ScenarioQAAgent/src/types/qa-report.ts |
| src/types/recon.ts | ga4ScenarioQAAgent/src/types/recon.ts |

### Knowledge (New directory — not in GA4)
| Old Path | New Path |
|----------|----------|
| src/knowledge/* | ga4ScenarioQAAgent/src/knowledge/* |
| src/knowledge/events/* | ga4ScenarioQAAgent/src/knowledge/events/* |

### Config (1 file added to existing 14, no conflicts)
| Old Path | New Path |
|----------|----------|
| src/config/event-scenario-registry.ts | ga4ScenarioQAAgent/src/config/event-scenario-registry.ts |

### Tests & Utilities
| Old Path | New Path |
|----------|----------|
| src/__tests__/* | ga4ScenarioQAAgent/src/__tests__/* |
| src/merge-excel.ts | ga4ScenarioQAAgent/src/merge-excel.ts |
| src/merge-event-excel.ts | ga4ScenarioQAAgent/src/merge-event-excel.ts |

### Deleted Files (Merged into GA4 package.json/tsconfig.json)
| Deleted | Replacement |
|---------|-------------|
| Built_to_Last_2026/package.json | ga4ScenarioQAAgent/package.json (deps merged) |
| Built_to_Last_2026/tsconfig.json | ga4ScenarioQAAgent/tsconfig.json |
| Built_to_Last_2026/node_modules/ | ga4ScenarioQAAgent/node_modules/ |

## Import Changes
| File | Old Import | New Import | Reason |
|------|-----------|------------|--------|
| cli-qa.ts | `from './orchestrator'` | `from './orchestrator-qa'` | orchestrator.ts renamed to orchestrator-qa.ts |

## Troubleshooting Guide
- **Import errors**: Search old path in this table → replace with new path
- **Type errors**: No filename conflicts between GA4 types/ and migrated types/. If same type name exists in different files, check per-file imports
- **Module not found**: Ensure node_modules is under ga4ScenarioQAAgent/ → run `npm install`
