import type { EvidenceHandoff } from "./types.js";

const OWNER_CRAFTS = ["Code", "Deploy", "Design", "Docs"] as const;
const RECORD_TYPES = [
  "Brief",
  "Decision",
  "Spec",
  "Design",
  "Ship",
  "Research",
  "Inbox",
] as const;
const NEXT_OWNERS = [...OWNER_CRAFTS, "Done"] as const;

export interface EvidenceHandoffInput {
  projectOrScope?: string;
  ownerCraft?: string;
  recordType?: string;
  artifactUrl?: string;
  verify?: string;
  nextOwner?: string;
  summary?: string;
  openBlockerOrApprovalNeeded?: string;
  consequentialClaim?: boolean;
  sourceUrls?: string[];
}

export type EvidenceHandoffValidation =
  | {
      status: "handoff_incomplete";
      mayWrite: false;
      missingFields: string[];
      invalidFields: string[];
      correctOwner: string;
    }
  | {
      status: "valid_packet";
      mayWrite: false;
      handoffPacket: EvidenceHandoff & {
        openBlockerOrApprovalNeeded?: string;
        sourceUrls: string[];
      };
    };

/**
 * Validates the same evidence fields used by the Grok Bots' Evidence Handoff
 * skill. This function performs no I/O and never files a Notion Record.
 */
export function validateEvidenceHandoff(
  input: EvidenceHandoffInput,
): EvidenceHandoffValidation {
  const missingFields: string[] = [];
  const invalidFields: string[] = [];

  requireText(input.projectOrScope, "projectOrScope", missingFields);
  requireText(input.ownerCraft, "ownerCraft", missingFields);
  requireText(input.recordType, "recordType", missingFields);
  requireText(input.artifactUrl, "artifactUrl", missingFields);
  requireText(input.verify, "verify", missingFields);
  requireText(input.nextOwner, "nextOwner", missingFields);
  requireText(input.summary, "summary", missingFields);

  validateChoice(input.ownerCraft, OWNER_CRAFTS, "ownerCraft", invalidFields);
  validateChoice(input.recordType, RECORD_TYPES, "recordType", invalidFields);
  validateChoice(input.nextOwner, NEXT_OWNERS, "nextOwner", invalidFields);

  if (hasText(input.artifactUrl) && !isHttpUrl(input.artifactUrl)) {
    invalidFields.push("artifactUrl");
  }

  const sourceUrls = input.sourceUrls ?? [];
  if (input.consequentialClaim === true && sourceUrls.length === 0) {
    missingFields.push("sourceUrls");
  }

  if (sourceUrls.some((sourceUrl) => !isHttpUrl(sourceUrl))) {
    invalidFields.push("sourceUrls");
  }

  if (missingFields.length > 0 || invalidFields.length > 0) {
    return {
      status: "handoff_incomplete",
      mayWrite: false,
      missingFields,
      invalidFields,
      correctOwner: isChoice(input.ownerCraft, OWNER_CRAFTS)
        ? input.ownerCraft!
        : "Docs",
    };
  }

  return {
    status: "valid_packet",
    mayWrite: false,
    handoffPacket: {
      projectOrScope: input.projectOrScope!.trim(),
      ownerCraft: input.ownerCraft as EvidenceHandoff["ownerCraft"],
      recordType: input.recordType as EvidenceHandoff["recordType"],
      artifactUrl: input.artifactUrl!.trim(),
      verify: input.verify!.trim(),
      nextOwner: input.nextOwner as EvidenceHandoff["nextOwner"],
      summary: input.summary!.trim(),
      ...(hasText(input.openBlockerOrApprovalNeeded)
        ? { openBlockerOrApprovalNeeded: input.openBlockerOrApprovalNeeded.trim() }
        : {}),
      sourceUrls: sourceUrls.map((sourceUrl) => sourceUrl.trim()),
    },
  };
}

function requireText(
  value: string | undefined,
  field: string,
  missingFields: string[],
): void {
  if (!hasText(value)) {
    missingFields.push(field);
  }
}

function validateChoice(
  value: string | undefined,
  choices: readonly string[],
  field: string,
  invalidFields: string[],
): void {
  if (hasText(value) && !isChoice(value, choices)) {
    invalidFields.push(field);
  }
}

function isChoice(value: string | undefined, choices: readonly string[]): boolean {
  return hasText(value) && choices.includes(value);
}

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
