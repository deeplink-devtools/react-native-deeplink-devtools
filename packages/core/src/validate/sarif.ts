import type { Diagnostic } from '../index.js';
import type { DocumentReport, ValidationResult } from './types.js';

/** A single SARIF 2.1.0 rule (one per distinct diagnostic code). */
export interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
}

/** A single SARIF 2.1.0 result. */
export interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  locations: {
    physicalLocation: { artifactLocation: { uri: string } };
  }[];
}

/** A minimal SARIF 2.1.0 log — the subset `rndl validate --sarif` emits. */
export interface SarifLog {
  $schema: string;
  version: '2.1.0';
  runs: {
    tool: {
      driver: {
        name: string;
        informationUri: string;
        version: string;
        rules: SarifRule[];
      };
    };
    results: SarifResult[];
  }[];
}

const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';
const TOOL_INFORMATION_URI = 'https://github.com/deeplink-devtools/react-native-deeplink-devtools';

/** Synthetic rule id under which informational notes are surfaced in SARIF. */
const NOTE_RULE_ID = 'RNDL_NOTE';

function diagnosticLevel(severity: Diagnostic['severity']): 'error' | 'warning' {
  return severity === 'error' ? 'error' : 'warning';
}

/**
 * Serialize a {@link ValidationResult} to a SARIF 2.1.0 log for CI ingestion.
 * Each diagnostic becomes a result (error→`error`, warn→`warning`) located at
 * the file it came from; each informational note becomes a `note`-level result
 * under a synthetic rule. Every referenced rule id is declared on the driver.
 */
export function toSarif(result: ValidationResult, meta: { toolVersion: string }): SarifLog {
  const results: SarifResult[] = [];
  const rules = new Map<string, SarifRule>();

  const addRule = (id: string, description: string): void => {
    if (!rules.has(id)) {
      rules.set(id, { id, name: id, shortDescription: { text: description } });
    }
  };

  const emitFor = (report: DocumentReport): void => {
    const uri = report.fetchedFrom ?? report.requestedUrl;
    for (const diagnostic of report.diagnostics) {
      addRule(diagnostic.code, diagnostic.message);
      const text =
        diagnostic.fix !== undefined
          ? `${diagnostic.message} Fix: ${diagnostic.fix}`
          : diagnostic.message;
      results.push({
        ruleId: diagnostic.code,
        level: diagnosticLevel(diagnostic.severity),
        message: { text },
        locations: [{ physicalLocation: { artifactLocation: { uri } } }],
      });
    }
    for (const note of report.notes) {
      addRule(NOTE_RULE_ID, 'Informational note from rndl validate.');
      results.push({
        ruleId: NOTE_RULE_ID,
        level: 'note',
        message: { text: note },
        locations: [{ physicalLocation: { artifactLocation: { uri } } }],
      });
    }
  };

  emitFor(result.aasa);
  emitFor(result.assetlinks);

  return {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'rndl',
            informationUri: TOOL_INFORMATION_URI,
            version: meta.toolVersion,
            rules: [...rules.values()],
          },
        },
        results,
      },
    ],
  };
}
